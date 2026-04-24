import { HeroStats, Composite, Monsters, sqlOne } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId } = await request.json();

        const { data: composite, error: playerError } = await Composite.getFullPlayer(userId);
        if (playerError || !composite || !composite.stats) throw new Error('Player not found.');

        const stats = composite.stats;
        let heroData = stats.hero_data || {};
        
        if (!stats.flasks || stats.flasks <= 0) {
            return NextResponse.json({ error: 'No Crimson Flasks remaining!' }, { status: 400 });
        }

        const pStats = calcPlayerStats(heroData); // legacy compatibility for stats math
        
        // Base Flask heal
        const newPlayerHp = Math.min(stats.max_hp, stats.hp + 60);
        let finalHp = newPlayerHp;
        
        let narrative = `[HEAL]: You consume a flask. +60 HP.`;

        // If in combat, enemy attacks
        if (enemyId) {
             let fetchedEnemy = { id: enemyId, name: "Void Stalker", tier: "Uncommon", base_hp: 80, base_dmg: 8, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };
             if (enemyId !== 'void_stalker') {
                  // Fallback for real monster IDs
                  const { data: mData } = await sqlOne('SELECT * FROM monsters WHERE id = $1', [enemyId]);
                  if (mData) {
                      fetchedEnemy = mData;
                      fetchedEnemy.base_damage_min = Math.floor(mData.base_dmg * 0.8);
                      fetchedEnemy.base_damage_max = Math.ceil(mData.base_dmg * 1.2);
                  }
             }
             
             const eStats = calcMonsterStats(fetchedEnemy);
             
             if (isHitDodged(pStats.dodgeChance)) {
                 narrative += ` [EVADE]: You dodged ${fetchedEnemy.name}'s counter-attack!`;
             } else {
                 const mDamage = rollDamage(eStats.damageMin, eStats.damageMax);
                 finalHp = Math.max(0, newPlayerHp - mDamage);
                 narrative += ` [WOUNDED]: ${fetchedEnemy.name} hits you while drinking for ${mDamage}!`;
             }
        }
        
        // Execute atomic update
        const { error: updateError } = await HeroStats.update(userId, { hp: finalHp, flasks: stats.flasks - 1 });
        if (updateError) throw updateError;

        // Reconstruct legacy response
        const updatedHero = {
            ...heroData,
            str: stats.str,
            def: stats.def,
            dex: stats.dex,
            int: stats.int,
            vit: stats.vit,
            unspentStatPoints: stats.unspent_points,
            level: stats.level,
            xp: stats.xp,
            hp: finalHp,
            flasks: stats.flasks - 1,
            max_hp: stats.max_hp
        };

        return NextResponse.json({
            success: true,
            updatedHero,
            narrative,
            died: finalHp <= 0
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

