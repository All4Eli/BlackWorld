import { HeroStats, Composite, Monsters, sqlOne } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';
import { incrementQuestProgress } from '@/lib/quests';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId } = await request.json();

        // 1. Fetch player strictly from DB
        const { data: composite, error: playerError } = await Composite.getFullPlayer(userId);
        if (playerError || !composite || !composite.stats) throw new Error('Player not found.');

        const stats = composite.stats;
        let heroData = stats.hero_data || {};
        
        // Ensure player isn't already dead
        if (stats.hp <= 0) {
            return NextResponse.json({ error: 'You are dead.' }, { status: 400 });
        }

        const pStats = calcPlayerStats(heroData); // Fallback for stat math relying on full object

        // Fetch Enemy Stats (Mocked or queried from DB). 
        let fetchedEnemy = { id: enemyId, name: "Void Stalker", tier: "Uncommon", base_hp: 80, base_dmg: 8, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };
        
        if (enemyId && enemyId !== 'void_stalker') {
             const { data: mData } = await sqlOne('SELECT * FROM monsters WHERE id = $1', [enemyId]);
             if (mData) {
                 fetchedEnemy = mData;
                 fetchedEnemy.base_damage_min = Math.floor(mData.base_dmg * 0.8);
                 fetchedEnemy.base_damage_max = Math.ceil(mData.base_dmg * 1.2);
             }
        }

        const eStats = calcMonsterStats(fetchedEnemy);
        let eHp = eStats.hp;
        let pHp = stats.hp || pStats.maxHp;

        // Auto-resolve loop
        let win = false;
        let maxRounds = 50;
        let totalDamageDealt = 0;
        let totalDamageTaken = 0;
        let roundsFought = 0;

        for (let i = 0; i < maxRounds; i++) {
            roundsFought++;
            // Player attacks
            if (!isHitDodged(eStats.dodgeChance)) {
                let d = rollDamage(pStats.baseDamageMin, pStats.baseDamageMax);
                eHp -= d;
                totalDamageDealt += d;
            }
            if (eHp <= 0) {
                win = true;
                break;
            }

            // Enemy attacks — use scaled stats from calcMonsterStats
            if (!isHitDodged(pStats.dodgeChance)) {
                let d = rollDamage(eStats.damageMin, eStats.damageMax);
                pHp -= d;
                totalDamageTaken += d;
            }
            if (pHp <= 0) {
                win = false;
                break;
            }
        }

        // Apply results
        let expGained = 0;
        let goldGained = 0;
        const updates = { hp: pHp };

        if (win) {
            expGained = fetchedEnemy.tier === 'BOSS' ? 50 : 15;
            goldGained = Math.floor(Math.random() * 20) + 10;
            updates.xp = (stats.xp || 0) + expGained;
            updates.gold = (stats.gold || 0) + goldGained;
            updates.kills = (stats.kills || 0) + 1;

            // Optional loot chance
            if (Math.random() > 0.8) {
                if (!heroData.artifacts) heroData.artifacts = [];
                heroData.artifacts.push({ type: 'item', name: 'Demon Fang', acquired_at: new Date().toISOString() });
                updates.hero_data = heroData;
            }

            // Temporary compat for quests (mutates heroData inplace)
            incrementQuestProgress(heroData, 'SLAY_MONSTERS', 1);
            if (goldGained > 0) incrementQuestProgress(heroData, 'GOLD_LOOTED', goldGained);
            updates.hero_data = heroData;
        } else {
            updates.hp = 0; // Death penalty
            updates.deaths = (stats.deaths || 0) + 1;
        }

        // Save
        const { error: updateError } = await HeroStats.update(userId, updates);
        if (updateError) throw updateError;
        
        // Reconstruct legacy response shape
        const updatedHero = {
            ...heroData,
            str: stats.str,
            def: stats.def,
            dex: stats.dex,
            int: stats.int,
            vit: stats.vit,
            unspentStatPoints: stats.unspent_points,
            level: stats.level,
            xp: updates.xp ?? stats.xp,
            gold: updates.gold ?? stats.gold,
            hp: updates.hp,
            max_hp: stats.max_hp
        };

        return NextResponse.json({
            success: true,
            win,
            expGained,
            goldGained,
            updatedHero
        });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

