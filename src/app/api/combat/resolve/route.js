// ═══════════════════════════════════════════════════════════════════
// POST /api/combat/resolve — Auto-resolve a full combat encounter
// ═══════════════════════════════════════════════════════════════════
//
// NORMALIZED ARCHITECTURE:
//   - Stats from hero_stats COLUMNS (not hero_data JSONB)
//   - Loot via InventoryDal.grantLootDrops() (not JSONB push)
//   - Returns partial updatedHero for shallow-merge client
// ═══════════════════════════════════════════════════════════════════

import { HeroStats, Composite, Monsters, sqlOne } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';
import { calculateSkillBonuses, calculateTomeBonuses } from '@/lib/skillTree';
import * as InventoryDal from '@/lib/db/dal/inventory';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId } = await request.json();

        // ── 1. Fetch player from normalized columns ────────────────
        const { data: stats, error: playerError } = await sqlOne(
            `SELECT hp, max_hp, gold, xp, level, kills, deaths, flasks,
                    str, def, dex, int, vit, base_dmg,
                    unspent_points, skill_points_unspent, skill_points, tomes
             FROM hero_stats WHERE player_id = $1`,
            [userId]
        );
        if (playerError || !stats) throw new Error('Player not found.');

        if (stats.hp <= 0) {
            return NextResponse.json({ error: 'You are dead.' }, { status: 400 });
        }

        // Build hero object for calcPlayerStats compatibility
        const hero = {
            level: stats.level, hp: stats.hp, max_hp: stats.max_hp,
            str: stats.str, def: stats.def, dex: stats.dex,
            int: stats.int, vit: stats.vit, baseDmg: stats.base_dmg,
            gold: stats.gold, xp: stats.xp, kills: stats.kills,
            deaths: stats.deaths, flasks: stats.flasks,
            skillPoints: stats.skill_points || {},
        };

        // ── Fetch equipped gear for combat stat bonuses ────────────
        const { data: eqRows } = await sqlOne(
          `SELECT json_agg(json_build_object(
             'slot', e.slot,
             'baseStats', i.base_stats,
             'rolledStats', inv.rolled_stats
           )) AS gear
           FROM equipment e
           JOIN inventory inv ON e.inventory_id = inv.id
           JOIN items i ON inv.item_id = i.id
           WHERE e.player_id = $1`, [userId]
        );
        if (eqRows?.gear) {
          hero.equipped = eqRows.gear.reduce((acc, row) => {
            acc[row.slot] = { baseStats: row.baseStats || {}, rolledStats: row.rolledStats || {} };
            return acc;
          }, {});
        }

        const pStats = calcPlayerStats(hero);

        // ── 2. Fetch enemy ─────────────────────────────────────────
        let fetchedEnemy = { id: enemyId, name: "Void Stalker", tier: "Uncommon",
            base_hp: 80, base_dmg: 8, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };

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

        // ── 3. Auto-resolve combat loop ────────────────────────────
        let win = false;
        let maxRounds = 50;
        let totalDamageDealt = 0;
        let totalDamageTaken = 0;
        let roundsFought = 0;

        for (let i = 0; i < maxRounds; i++) {
            roundsFought++;
            if (!isHitDodged(eStats.dodgeChance)) {
                let d = rollDamage(pStats.baseDamageMin, pStats.baseDamageMax);
                eHp -= d;
                totalDamageDealt += d;
            }
            if (eHp <= 0) { win = true; break; }

            if (!isHitDodged(pStats.dodgeChance)) {
                let d = rollDamage(eStats.damageMin, eStats.damageMax);
                pHp -= d;
                totalDamageTaken += d;
            }
            if (pHp <= 0) { win = false; break; }
        }

        // ── 4. Apply results ───────────────────────────────────────
        let expGained = 0;
        let goldGained = 0;
        let droppedLoot = null;
        const updates = { hp: Math.max(0, pHp) };

        if (win) {
            const isBoss = fetchedEnemy.tier === 'BOSS';
            expGained = isBoss ? 50 : 15;
            goldGained = Math.floor(Math.random() * 20) + 10;
            updates.xp = (stats.xp || 0) + expGained;
            updates.gold = (stats.gold || 0) + goldGained;
            updates.kills = (stats.kills || 0) + 1;
            // Increment boss_kills if the defeated enemy was a BOSS
            if (isBoss) {
                updates.boss_kills = (stats.boss_kills || 0) + 1;
            }

            // ── Level-up loop ──────────────────────────────────────
            //
            // Without this, XP can exceed the threshold and the
            // player never levels up. This mirrors the same loop
            // in /api/explore/combat.
            let currentLevel = stats.level;
            let currentXp = updates.xp;
            let unspentPoints = stats.unspent_points || 0;
            let skillPointsUnspent = stats.skill_points_unspent || 0;
            const { calculateXPRequirement } = require('@/lib/gameData');
            let requiredXp = calculateXPRequirement(currentLevel);
            while (currentXp >= requiredXp) {
                currentXp -= requiredXp;
                currentLevel += 1;
                unspentPoints += 3;
                skillPointsUnspent += 1;
                requiredXp = calculateXPRequirement(currentLevel);
            }
            if (currentLevel > stats.level) {
                updates.level = currentLevel;
                updates.xp = currentXp;
                updates.unspent_points = unspentPoints;
                updates.skill_points_unspent = skillPointsUnspent;
                // Recalculate derived stats (formula: 100 + vit*5 + level*5)
                updates.max_hp = 100 + (stats.vit * 5) + (currentLevel * 5);
                updates.max_mana = 50 + (stats.int * 3);
            }

            // ── Loot via normalized inventory table ────────────────
            if (Math.random() > 0.8) {
                const { generateLoot } = require('@/lib/gameData');
                const loot = generateLoot(stats.level || 1);
                const itemKey = loot.name.toLowerCase().replace(/\s+/g, '_');

                const { error: lootErr } = await InventoryDal.grantLootDrops(
                    userId, [{ item_key: itemKey, quantity: 1 }]
                );
                if (!lootErr) {
                    droppedLoot = { name: loot.name, tier: loot.tier, key: itemKey };
                }
            }
        } else {
            updates.hp = 0;
            updates.deaths = (stats.deaths || 0) + 1;
        }

        // ── 5. Persist via column UPDATE (no hero_data JSONB) ──────
        const { error: updateError } = await HeroStats.update(userId, updates);
        if (updateError) throw updateError;

        // ── 6. Compute effective maxHp/maxMana for response ────────
        const skillBonuses = calculateSkillBonuses(stats.skill_points || {});
        const tomeBonuses = calculateTomeBonuses(stats.tomes || []);
        const finalLevel = updates.level ?? stats.level;
        const baseMaxHp = 100 + (stats.vit * 5) + (finalLevel * 5);
        const baseMaxMana = 50 + (stats.int * 3);

        let gearHp = 0;
        if (eqRows?.gear) {
          for (const row of eqRows.gear) {
            gearHp += (row.baseStats?.hp || 0) + (row.rolledStats?.hp || 0);
          }
        }

        const effectiveMaxHp = baseMaxHp + (skillBonuses.maxHp || 0) + (tomeBonuses.flatHp || 0) + gearHp;

        return NextResponse.json({
            success: true,
            win,
            expGained,
            goldGained,
            droppedLoot,
            updatedHero: {
                hp: updates.hp,
                maxHp: effectiveMaxHp,
                gold: updates.gold ?? stats.gold,
                xp: updates.xp ?? stats.xp,
                level: finalLevel,
                kills: updates.kills ?? stats.kills,
                deaths: updates.deaths ?? stats.deaths,
                flasks: stats.flasks,
                unspentPoints: updates.unspent_points ?? stats.unspent_points,
                skillPointsUnspent: updates.skill_points_unspent ?? stats.skill_points_unspent,
            }
        });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
