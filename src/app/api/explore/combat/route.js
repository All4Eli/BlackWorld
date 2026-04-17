import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';
import { validateAndConsume } from '@/lib/resources';
import { incrementQuestProgress } from '@/lib/quests';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId, action, enemyState } = await request.json();

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        const pStats = calcPlayerStats(hero);

        // Algorithmic healing fix for players trapped by the NaN procedural generation bug.
        if (hero.hp == null || isNaN(hero.hp)) {
             hero.hp = pStats.maxHp;
        }

        if (hero.hp <= 0) {
            return NextResponse.json({ error: 'You are dead.' }, { status: 400 });
        }

        const { generateEnemy } = require('@/lib/gameData');
        let fetchedEnemy = generateEnemy(1); // Default logic fallback
        if (enemyId && enemyId !== 'void_stalker') {
             const { data: bossData } = await supabase.from('boss_monsters').select('*').eq('id', enemyId).single();
             if (bossData) fetchedEnemy = bossData;
        }

        const eStats = calcMonsterStats(fetchedEnemy);
        
        let pHp = hero.hp || pStats.maxHp;
        let eHp = enemyState?.hp ?? eStats.hp; 
        let eBleed = enemyState?.bleed || 0;
        let eAegis = enemyState?.aegisTriggered || false;
        
        let logs = [];
        let win = false;
        let combatEnded = false;

        if (eBleed > 0) {
             const dmg = eBleed;
             eHp -= dmg;
             logs.push(`🩸 [BLEED]: Enemy suffers ${dmg} bleed damage from your Serrated Blades!`);
             if (eHp <= 0) { win = true; combatEnded = true; }
        }

        // If this is the FIRST action against this enemy, validate and consume Vitae.
        // We use a simple heuristic: if eHp == eStats.hp, it's the start.
        if (eHp === eStats.hp && action === 'ATTACK') {
             const limits = hero.player_resources || {};
             const check = validateAndConsume(hero, { ...hero, ...limits }, 10, 'vitae');
             if (!check.success) {
                  return NextResponse.json({ error: 'Insufficient Vitae to initiate combat.' }, { status: 400 });
             }
             if (!hero.player_resources) hero.player_resources = {};
             hero.player_resources.vitae_current = check.new_current;
             hero.player_resources.vitae_last_update = check.new_last_update;
        }

        let initialLogs = [];
        let delayedLogs = [];

        if (action === 'ATTACK') {
             // 1. Player Strike
             if (!isHitDodged(eStats.dodgeChance)) {
                 const dmg = rollDamage(pStats.baseDamageMin, pStats.baseDamageMax);
                 eHp -= dmg;
                 initialLogs.push(`⚔️ [STRIKE]: You slashed the enemy for ${dmg} damage!`);
                 if (pStats.passiveBleed) {
                      eBleed += pStats.passiveBleed;
                      initialLogs.push(`🔪 [LACERATED]: Bleeding stacks increased!`);
                 }
                 if (pStats.lifesteal) {
                      pHp = Math.min(pStats.maxHp, pHp + pStats.lifesteal);
                      initialLogs.push(`🩸 [SIPHON]: You siphoned ${pStats.lifesteal} HP from the wound!`);
                 }
             } else {
                 initialLogs.push(`💨 [MISS]: Your attack was dodged!`);
             }
             
             if (eHp <= 0) {
                 win = true;
                 combatEnded = true;
             } else {
                 // 2. Enemy Implicit Counter
                 if (!isHitDodged(pStats.dodgeChance)) {
                     const eDmg = rollDamage(eStats.damageMin, eStats.damageMax);
                     pHp -= Math.max(1, eDmg - (pStats.damageReduction || 0));
                     delayedLogs.push(`👹 [ENEMY TURN]: The enemy lunges and hits you for ${eDmg} damage!`);
                 } else {
                     delayedLogs.push(`💨 [EVADE]: You dodged the enemy's attack!`);
                 }
                 if (pHp <= 0) { win = false; combatEnded = true; }
             }
        } else if (action === 'DEFEND') {
            initialLogs.push(`🛡️ [DEFEND]: You raised your guard!`);
            
            // Full DEFEND mechanic (calculates against immediate enemy turn)
            if (!isHitDodged(pStats.dodgeChance + 0.3)) {
                let dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                dmg = Math.max(0, Math.floor(dmg * 0.2) - (pStats.damageReduction || 0));
                pHp -= dmg;
                if (dmg > 0) {
                     delayedLogs.push(`🛡️ [BLOCKED]: Enemy strikes your guard for a mere ${dmg} damage!`);
                } else {
                     delayedLogs.push(`🛡️ [PERFECT BLOCK]: You completely nullified the enemy attack!`);
                }
                
                if (Math.random() < 0.4) {
                     const counter = Math.max(1, Math.floor(pStats.baseDamageMin * 0.5));
                     eHp -= counter;
                     delayedLogs.push(`⚔️ [RIPOSTE]: You swiftly counterattacked for ${counter} damage!`);
                }
            } else {
                delayedLogs.push(`💨 [EVADE]: You perfectly dodged while defending!`);
            }
            if (pHp <= 0) combatEnded = true;
            if (eHp <= 0) { win = true; combatEnded = true; }
        } else if (action === 'FLASK') {
            if ((hero.flasks || 0) <= 0) {
                return NextResponse.json({ error: 'No Crimson Flasks remaining!' }, { status: 400 });
            }
            hero.flasks -= 1;
            pHp = Math.min(pStats.maxHp, pHp + 60);
            initialLogs.push(`🩸 [HEAL]: You consume a flask. +60 HP`);
            
            // Enemy attacks back
            if (!isHitDodged(pStats.dodgeChance)) {
                const dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                pHp -= Math.max(1, dmg - (pStats.damageReduction || 0));
                delayedLogs.push(`🩸 [WOUNDED]: Enemy strikes while you drink for ${dmg}!`);
            } else {
                delayedLogs.push(`💨 [EVADE]: You dodged the enemy's attack while drinking!`);
            }
            if (pHp <= 0) combatEnded = true;

        } else if (action === 'FLEE') {
            if (Math.random() < 0.4) {
                initialLogs.push(`💨 [ESCAPE]: You successfully fled the battle!`);
                combatEnded = true;
                // No rewards, just escaped
            } else {
                initialLogs.push(`❌ [TRAPPED]: You failed to escape! Brace yourself!`);
                if (!isHitDodged(pStats.dodgeChance)) {
                    const dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                    pHp -= Math.max(1, dmg - (pStats.damageReduction || 0));
                    delayedLogs.push(`🩸 [WOUNDED]: Enemy hits your exposed back for ${dmg}!`);
                } else {
                    delayedLogs.push(`💨 [EVADE]: You dodged the pursuit!`);
                }
                if (pHp <= 0) combatEnded = true;
            }
        }

        // Apply results
        let expGained = 0;
        let goldGained = 0;
        hero.hp = Math.max(0, pHp);

        if (combatEnded) {
            if (win) {
                expGained = fetchedEnemy.tier === 'Boss' ? 50 : 15;
                goldGained = Math.floor(Math.random() * 20) + 10;
                hero.xp = (hero.xp || 0) + expGained;
                hero.gold = (hero.gold || 0) + goldGained;
                hero.level = hero.level || 1;
                hero.unspentStatPoints = hero.unspentStatPoints || 0;
                hero.skillPointsUnspent = hero.skillPointsUnspent || 0;

                const { calculateXPRequirement } = require('@/lib/gameData');
                let requiredXp = calculateXPRequirement(hero.level);

                while ((hero.xp || 0) >= requiredXp) {
                    hero.xp -= requiredXp;
                    hero.level += 1;
                    hero.unspentStatPoints += 3;
                    hero.skillPointsUnspent += 1;
                    logs.push(`✨ [LEVEL UP]: You reached Level ${hero.level}! (+3 Stat Points, +1 Skill Point)`);
                    requiredXp = calculateXPRequirement(hero.level);
                }

                if (Math.random() > 0.6) {
                    if (!hero.artifacts) hero.artifacts = [];
                    const { generateLoot } = require('@/lib/gameData');
                    const loot = generateLoot(1);
                    hero.artifacts.push({ ...loot, acquired_at: new Date().toISOString() });
                    logs.push(`💎 [LOOT]: You recovered a ${loot.name}!`);
                }

                incrementQuestProgress(hero, 'SLAY_MONSTERS', 1);
                if (goldGained > 0) incrementQuestProgress(hero, 'GOLD_LOOTED', goldGained);
            } else if (hero.hp <= 0) {
               // Death penalty
               const goldLoss = Math.floor((hero.gold || 0) * 0.1);
               hero.gold = Math.max(0, (hero.gold || 0) - goldLoss);
               hero.hp = 1;
               logs.push(`☠️ [DEATH]: You have fallen. Lost ${goldLoss} gold.`);
            }
        }

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            win,
            combatEnded,
            newEnemyHp: Math.max(0, eHp),
            newEnemyState: { hp: Math.max(0, eHp), bleed: eBleed },
            newPlayerHp: hero.hp,
            expGained,
            goldGained,
            initialLogs,
            delayedLogs,
            updatedHero: hero
        });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
