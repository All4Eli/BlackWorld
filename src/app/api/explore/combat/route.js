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
        
        if (hero.hp <= 0) {
            return NextResponse.json({ error: 'You are dead.' }, { status: 400 });
        }

        const pStats = calcPlayerStats(hero);

        let fetchedEnemy = { id: enemyId, name: "Void Stalker", tier: "Uncommon", base_hp: 80, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };
        if (enemyId && enemyId !== 'void_stalker') {
             const { data: bossData } = await supabase.from('boss_monsters').select('*').eq('id', enemyId).single();
             if (bossData) fetchedEnemy = bossData;
        }

        const eStats = calcMonsterStats(fetchedEnemy);
        
        let pHp = hero.hp || pStats.maxHp;
        let eHp = enemyState?.hp ?? eStats.hp; // Uses whatever enemy state was passed, since the enemy doesn't persist natively yet
        
        let logs = [];
        let win = false;
        let combatEnded = false;

        // If this is the FIRST action against this enemy, validate and consume Vitae.
        // We use a simple heuristic: if eHp == eStats.hp, it's the start.
        if (eHp === eStats.hp && action === 'ATTACK') {
             const check = validateAndConsume(hero, hero.player_resources || {}, 10, 'vitae');
             if (!check.success) {
                  return NextResponse.json({ error: 'Insufficient Vitae to initiate combat.' }, { status: 400 });
             }
             if (!hero.player_resources) hero.player_resources = {};
             hero.player_resources.vitae_current = check.new_current;
             hero.player_resources.vitae_last_update = check.new_last_update;
        }

        if (action === 'ATTACK') {
            // Auto-resolve remaining loop
            let maxRounds = 50;
            for (let i = 0; i < maxRounds; i++) {
                if (!isHitDodged(eStats.dodgeChance)) {
                    eHp -= rollDamage(pStats.baseDamageMin, pStats.baseDamageMax);
                }
                if (eHp <= 0) {
                    win = true;
                    combatEnded = true;
                    break;
                }
                if (!isHitDodged(pStats.dodgeChance)) {
                    pHp -= rollDamage(eStats.damageMin, eStats.damageMax);
                }
                if (pHp <= 0) {
                    win = false;
                    combatEnded = true;
                    break;
                }
            }
        } else if (action === 'FLASK') {
            if ((hero.flasks || 0) <= 0) {
                return NextResponse.json({ error: 'No Crimson Flasks remaining!' }, { status: 400 });
            }
            hero.flasks -= 1;
            pHp = Math.min(pStats.maxHp, pHp + 60);
            logs.push(`🩸 [HEAL]: You consume a flask. +60 HP`);
            
            // Enemy attacks back
            if (!isHitDodged(pStats.dodgeChance)) {
                const dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                pHp -= dmg;
                logs.push(`🩸 [WOUNDED]: Enemy strikes while you drink for ${dmg}!`);
            } else {
                logs.push(`💨 [EVADE]: You dodged the enemy's attack while drinking!`);
            }
            if (pHp <= 0) combatEnded = true;

        } else if (action === 'FLEE') {
            if (Math.random() < 0.4) {
                logs.push(`💨 [ESCAPE]: You successfully fled the battle!`);
                combatEnded = true;
                // No rewards, just escaped
            } else {
                logs.push(`❌ [TRAPPED]: You failed to escape!`);
                if (!isHitDodged(pStats.dodgeChance)) {
                    const dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                    pHp -= dmg;
                    logs.push(`🩸 [WOUNDED]: Enemy hits you for ${dmg}!`);
                } else {
                    logs.push(`💨 [EVADE]: You dodged the pursuit!`);
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

                if (Math.random() > 0.8) {
                    if (!hero.artifacts) hero.artifacts = [];
                    hero.artifacts.push({ type: 'item', name: 'Demon Fang', acquired_at: new Date().toISOString() });
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
            newEnemyHp: eHp,
            newPlayerHp: hero.hp,
            expGained,
            goldGained,
            logs,
            updatedHero: hero
        });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
