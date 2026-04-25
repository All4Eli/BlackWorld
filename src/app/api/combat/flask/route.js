// ═══════════════════════════════════════════════════════════════════
// POST /api/combat/flask — Use a healing flask during combat
// ═══════════════════════════════════════════════════════════════════
//
// NORMALIZED: Reads from hero_stats COLUMNS only (no hero_data JSONB).
// Returns partial updatedHero for shallow merge.
//
// DATA FLOW:
//   DB:  hero_stats.flasks, hero_stats.hp, hero_stats.max_hp
//   API: { hp, flasks, maxHp } → updatedHero
//   UI:  updateHero({ hp, flasks, maxHp }) → shallow merge into context
// ═══════════════════════════════════════════════════════════════════

import { HeroStats, sqlOne } from '@/lib/dal';
import { sql } from '@/lib/db/pool';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId } = await request.json();

        // ── Read ONLY the columns we need (NO hero_data) ───────────
        const { data: stats, error: playerError } = await sqlOne(
            `SELECT hp, max_hp, flasks, str, def, dex, int, vit, base_dmg, level,
                    skill_points
             FROM hero_stats WHERE player_id = $1`,
            [userId]
        );
        if (playerError || !stats) throw new Error('Player not found.');

        if (!stats.flasks || stats.flasks <= 0) {
            return NextResponse.json({ error: 'No Crimson Flasks remaining!' }, { status: 400 });
        }

        // Build the hero shape that calcPlayerStats expects
        const hero = {
            str: stats.str, def: stats.def, dex: stats.dex,
            int: stats.int, vit: stats.vit, baseDmg: stats.base_dmg,
            level: stats.level, skillPoints: stats.skill_points || {},
        };

        // ── Fetch equipped gear for combat stat bonuses ────────────
        const { data: eqRows } = await sql(
          `SELECT e.slot, i.base_stats AS "baseStats", inv.rolled_stats AS "rolledStats"
           FROM equipment e
           JOIN inventory inv ON e.inventory_id = inv.id
           JOIN items i ON inv.item_id = i.id
           WHERE e.player_id = $1`, [userId]
        );
        if (eqRows && eqRows.length > 0) {
          hero.equipped = eqRows.reduce((acc, row) => {
            acc[row.slot] = { baseStats: row.baseStats || {}, rolledStats: row.rolledStats || {} };
            return acc;
          }, {});
        }

        const pStats = calcPlayerStats(hero);

        // Base Flask heal (+60 HP, capped at max_hp)
        const newPlayerHp = Math.min(stats.max_hp, stats.hp + 60);
        let finalHp = newPlayerHp;
        let narrative = `[HEAL]: You consume a flask. +60 HP.`;

        // If in combat, enemy attacks back while you drink
        if (enemyId) {
             let fetchedEnemy = { id: enemyId, name: "Void Stalker", tier: "Uncommon",
                 base_hp: 80, base_dmg: 8, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };

             if (enemyId !== 'void_stalker') {
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

        // ── Atomic column UPDATE (no hero_data JSONB) ──────────────
        const { error: updateError } = await HeroStats.update(userId, {
            hp: finalHp,
            flasks: stats.flasks - 1,
        });
        if (updateError) throw updateError;

        // ── Return ONLY changed fields for shallow merge ───────────
        //
        // The client calls: updateHero(data.updatedHero)
        // which does:        { ...prevHero, ...data.updatedHero }
        // So we only need to include fields that actually changed.
        return NextResponse.json({
            success: true,
            updatedHero: {
                hp: finalHp,
                maxHp: stats.max_hp,
                flasks: stats.flasks - 1,
            },
            narrative,
            died: finalHp <= 0,
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
