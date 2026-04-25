// ═══════════════════════════════════════════════════════════════════
// POST /api/explore/combat — Per-turn combat resolution (Exploration)
// ═══════════════════════════════════════════════════════════════════
//
// NORMALIZED ARCHITECTURE:
//   - All hero stats come from hero_stats COLUMNS (not hero_data JSONB)
//   - Loot drops go to the `inventory` table via InventoryDal.grantLootDrops()
//   - Quest progress is tracked via the `player_quests` table
//   - hero_data JSONB is NO LONGER read or written
//
// DATA FLOW:
//   Client sends: { enemyId, action, enemyState }
//   Server reads: hero_stats columns (hp, gold, xp, level, etc.)
//   Server writes: UPDATE hero_stats SET hp=$1, gold=$2, ... (columns only)
//   Loot writes: INSERT INTO inventory via grantLootDrops()
//   Response: { success, win, combatEnded, updatedHero: { ...partial } }
// ═══════════════════════════════════════════════════════════════════

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { sql, sqlOne } from '@/lib/db/pool';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';
import * as InventoryDal from '@/lib/db/dal/inventory';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId, action, enemyState } = await request.json();

        // ── 1. Fetch hero from NORMALIZED COLUMNS (no hero_data) ────
        const { data: heroRow, error: heroErr } = await sqlOne(
          `SELECT hp, max_hp, gold, xp, level, kills, deaths, flasks, max_flasks,
                  str, def, dex, int, vit, base_dmg, mana, max_mana,
                  unspent_points, skill_points_unspent, skill_points,
                  essence, max_essence
           FROM hero_stats WHERE player_id = $1`, [userId]
        );
        if (heroErr || !heroRow) throw new Error('Player not found.');

        // Build a hero object from normalized columns for calcPlayerStats
        const hero = {
            hp: heroRow.hp,
            max_hp: heroRow.max_hp,
            gold: heroRow.gold,
            xp: heroRow.xp,
            level: heroRow.level,
            kills: heroRow.kills,
            deaths: heroRow.deaths,
            flasks: heroRow.flasks,
            maxFlasks: heroRow.max_flasks,
            str: heroRow.str,
            def: heroRow.def,
            dex: heroRow.dex,
            int: heroRow.int,
            vit: heroRow.vit,
            baseDmg: heroRow.base_dmg,
            mana: heroRow.mana,
            maxMana: heroRow.max_mana,
            unspentStatPoints: heroRow.unspent_points,
            skillPointsUnspent: heroRow.skill_points_unspent,
            skillPoints: heroRow.skill_points || {},
            essence: heroRow.essence,
            maxEssence: heroRow.max_essence,
        };

        // ── Fetch equipped gear for combat stat bonuses ────────────
        //
        // calcCombatStats (called by calcPlayerStats) reads hero.equipped
        // to aggregate gear bonuses (dmg, def, hp, crit, etc.).
        // Without this query, all gear provides ZERO combat benefit.
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

        if (hero.hp == null || isNaN(hero.hp)) hero.hp = pStats.maxHp;
        if (hero.hp <= 0) return NextResponse.json({ error: 'You are dead.' }, { status: 400 });

        const { generateEnemy } = require('@/lib/gameData');
        let fetchedEnemy = generateEnemy(hero.level || 1);

        const eStats = calcMonsterStats(fetchedEnemy);

        let pHp = hero.hp || pStats.maxHp;
        let eHp = enemyState?.hp ?? eStats.hp;
        let eBleed = enemyState?.bleed || 0;

        let win = false;
        let combatEnded = false;
        let initialLogs = [];
        let delayedLogs = [];

        if (eBleed > 0) {
            eHp -= eBleed;
            initialLogs.push(`♦ [BLEED]: Enemy suffers ${eBleed} bleed damage!`);
            if (eHp <= 0) { win = true; combatEnded = true; }
        }

        if (action === 'ATTACK') {
             if (!isHitDodged(eStats.dodgeChance)) {
                 const dmg = rollDamage(pStats.baseDamageMin, pStats.baseDamageMax);
                 eHp -= dmg;
                 initialLogs.push(`⚔ [STRIKE]: You slashed the enemy for ${dmg} damage!`);
                 if (pStats.passiveBleed) {
                      eBleed += pStats.passiveBleed;
                      initialLogs.push(`🔪 [LACERATED]: Bleeding stacks increased!`);
                 }
                 if (pStats.lifesteal) {
                      pHp = Math.min(pStats.maxHp, pHp + pStats.lifesteal);
                      initialLogs.push(`♦ [SIPHON]: You siphoned ${pStats.lifesteal} HP!`);
                 }
             } else {
                 initialLogs.push(`≈ [MISS]: Your attack was dodged!`);
             }

             if (eHp <= 0) {
                 win = true; combatEnded = true;
             } else {
                 if (!isHitDodged(pStats.dodgeChance)) {
                     const eDmg = rollDamage(eStats.damageMin, eStats.damageMax);
                     pHp -= Math.max(0, eDmg - (pStats.damageReduction || 0));
                     delayedLogs.push(`👹 [ENEMY TURN]: Hit you for ${eDmg} damage!`);
                 } else {
                     delayedLogs.push(`≈ [EVADE]: You dodged the enemy's attack!`);
                 }
                 if (pHp <= 0) { win = false; combatEnded = true; }
             }
        } else if (action === 'DEFEND') {
            initialLogs.push(`⛨ [DEFEND]: You raised your guard!`);
            if (!isHitDodged(pStats.dodgeChance + 0.3)) {
                let dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                dmg = Math.max(0, Math.floor(dmg * 0.2) - (pStats.damageReduction || 0));
                pHp -= dmg;
                delayedLogs.push(dmg > 0 ? `⛨ [BLOCKED]: ${dmg} damage!` : `⛨ [PERFECT BLOCK]!`);
                if (Math.random() < 0.4) {
                     const counter = Math.max(1, Math.floor(pStats.baseDamageMin * 0.5));
                     eHp -= counter;
                     delayedLogs.push(`⚔ [RIPOSTE]: Counterattacked for ${counter} damage!`);
                }
            } else {
                delayedLogs.push(`≈ [EVADE]: Dodged while defending!`);
            }
            if (pHp <= 0) combatEnded = true;
            if (eHp <= 0) { win = true; combatEnded = true; }
        } else if (action === 'FLASK') {
            if ((hero.flasks || 0) <= 0) return NextResponse.json({ error: 'No flasks!' }, { status: 400 });
            hero.flasks -= 1;
            pHp = Math.min(pStats.maxHp, pHp + 60);
            initialLogs.push(`♦ [HEAL]: Flask consumed. +60 HP`);

            if (!isHitDodged(pStats.dodgeChance)) {
                const dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                const netDmg = Math.max(0, dmg - (pStats.damageReduction || 0));
                pHp -= netDmg;
                delayedLogs.push(netDmg > 0 ? `♦ [WOUNDED]: Hit while drinking for ${netDmg}!` : `⛨ [ABSORBED]: Your defense fully blocked the hit!`);
            } else {
                delayedLogs.push(`≈ [EVADE]: Dodged while drinking!`);
            }
            if (pHp <= 0) combatEnded = true;
        } else if (action === 'SKILL') {
            const ARCANA = {
                'blood_surge': { name: 'Blood Surge', type: 'DAMAGE', cost: 10, multiplier: 3.5, msg: 'A torrent of boiling blood erupts!' },
                'shadow_step': { name: 'Shadow Step', type: 'EVADE', cost: 15, msg: 'You melt into darkness.' },
                'holy_cross': { name: 'Holy Cross', type: 'DAMAGE', cost: 20, multiplier: 5.0, msg: 'Blinding white light scorches the enemy!' }
            };
            const skillId = enemyState?.skillId || 'blood_surge';
            const spell = ARCANA[skillId];
            if (!spell) return NextResponse.json({ error: 'Unknown Incantation!' }, { status: 400 });
            if ((hero.mana || 0) < spell.cost) return NextResponse.json({ error: 'Not enough Arcane Energy!' }, { status: 400 });

            hero.mana -= spell.cost;
            initialLogs.push(`✧ [CAST]: ${spell.name} — ${spell.msg}`);

            if (spell.type === 'DAMAGE') {
                const magicalDmg = Math.floor(pStats.baseDamageMax * spell.multiplier);
                eHp -= magicalDmg;
                initialLogs.push(`✧ [ARCANA]: ${magicalDmg} magical damage!`);
                if (eHp > 0) {
                     const dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                     const retNet = Math.max(0, dmg - (pStats.damageReduction || 0));
                     pHp -= retNet;
                     delayedLogs.push(retNet > 0 ? `♦ [WOUNDED]: Enemy retaliates for ${retNet}!` : `⛨ [ABSORBED]: Your defense blocks the retaliation!`);
                }
            } else if (spell.type === 'EVADE') {
                delayedLogs.push(`≈ [SHADOW]: The enemy strikes empty air!`);
            }
            if (pHp <= 0) combatEnded = true;
            if (eHp <= 0) { win = true; combatEnded = true; }
        } else if (action === 'FLEE') {
            if (Math.random() < 0.4) {
                initialLogs.push(`≈ [ESCAPE]: You fled!`);
                combatEnded = true;
            } else {
                initialLogs.push(`✖ [TRAPPED]: Failed to escape!`);
                if (!isHitDodged(pStats.dodgeChance)) {
                    const dmg = rollDamage(eStats.damageMin, eStats.damageMax);
                    const fleeNet = Math.max(0, dmg - (pStats.damageReduction || 0));
                    pHp -= fleeNet;
                    delayedLogs.push(fleeNet > 0 ? `♦ [WOUNDED]: Hit for ${fleeNet}!` : `⛨ [ABSORBED]: Your armor blocks the pursuit strike!`);
                } else {
                    delayedLogs.push(`≈ [EVADE]: Dodged the pursuit!`);
                }
                if (pHp <= 0) combatEnded = true;
            }
        }

        // ── Apply results ──────────────────────────────────────────
        let expGained = 0;
        let goldGained = 0;
        let droppedLoot = null;
        hero.hp = Math.max(0, pHp);

        if (combatEnded && win) {
            let baseExp = 15;
            let baseGold = Math.floor(Math.random() * 20) + 10;
            expGained = baseExp;
            goldGained = baseGold;

            hero.xp = (hero.xp || 0) + expGained;
            hero.gold = (hero.gold || 0) + goldGained;
            hero.kills = (hero.kills || 0) + 1;

            // ── Level-up loop ──
            const { calculateXPRequirement } = require('@/lib/gameData');
            let requiredXp = calculateXPRequirement(hero.level);
            while ((hero.xp || 0) >= requiredXp) {
                hero.xp -= requiredXp;
                hero.level += 1;
                hero.unspentStatPoints = (hero.unspentStatPoints || 0) + 3;
                hero.skillPointsUnspent = (hero.skillPointsUnspent || 0) + 1;
                initialLogs.push(`▲ [LEVEL UP]: Level ${hero.level}! (+3 Stat Points, +1 Skill Point)`);
                requiredXp = calculateXPRequirement(hero.level);
            }

            // ── LOOT via normalized inventory table ────────────────
            //
            // OLD: hero.artifacts.push({ ...loot }) → dead JSONB blob
            // NEW: InventoryDal.grantLootDrops() → proper inventory row
            //      with item catalog JOIN, stackable logic, and UUID
            //
            if (Math.random() > 0.6) {
                const { generateLoot } = require('@/lib/gameData');
                const loot = generateLoot(hero.level || 1);

                // Convert loot name to item_key slug:
                //   "Charred Bone" → "charred_bone"
                const itemKey = loot.name.toLowerCase().replace(/\s+/g, '_');

                const { data: granted, error: lootErr } = await InventoryDal.grantLootDrops(
                    userId,
                    [{ item_key: itemKey, quantity: 1 }]
                );

                if (lootErr) {
                    console.warn('[COMBAT LOOT] Failed to grant:', lootErr.message);
                } else {
                    droppedLoot = { name: loot.name, tier: loot.tier, key: itemKey };
                    initialLogs.push(`✦ [LOOT]: You recovered a ${loot.name}!`);
                }
            }

            // ── Quest progress via normalized player_quests table ──
            //
            // Fire quest events so the QuestLog can track progress.
            // This is a best-effort call — combat should never fail
            // because quest tracking failed.
            try {
                await fetch(new URL('/api/quests/progress', request.url), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json',
                               'Cookie': request.headers.get('cookie') || '' },
                    body: JSON.stringify({ event: 'KILL_ENEMIES', count: 1, zone: 'exploration' }),
                });
            } catch (qErr) {
                console.warn('[QUEST PROGRESS]', qErr.message);
            }

        } else if (combatEnded && hero.hp <= 0) {
            const goldLoss = Math.floor((hero.gold || 0) * 0.1);
            hero.gold = Math.max(0, (hero.gold || 0) - goldLoss);
            hero.hp = 1;
            hero.deaths = (hero.deaths || 0) + 1;
            initialLogs.push(`☠ [DEATH]: You have fallen. Lost ${goldLoss} gold.`);
        }

        // ── Persist to hero_stats COLUMNS (no hero_data JSONB) ─────
        //
        // Every field is a discrete column. No JSON.stringify().
        // The WHERE clause ensures we only update the correct player.
        // Persist ALL mutable combat state (including mana consumed by SKILL actions)
        //
        // max_hp and max_mana are recalculated from base stats using
        // the game formula, ensuring level-ups immediately increase
        // the player's HP/mana pool. Without this, the healer would
        // heal to a stale max_hp value.
        await sql(
          `UPDATE hero_stats SET
            hp = $1, gold = $2, xp = $3, level = $4,
            kills = $5, deaths = $6, flasks = $7,
            unspent_points = $8, skill_points_unspent = $9,
            mana = $10, essence = $11,
            max_hp = 100 + ("vit" * 5) + ($4 * 5),
            max_mana = 50 + ("int" * 3),
            updated_at = NOW()
          WHERE player_id = $12`,
          [hero.hp, hero.gold, hero.xp, hero.level,
           hero.kills, hero.deaths || 0, hero.flasks,
           hero.unspentStatPoints || 0, hero.skillPointsUnspent || 0,
           hero.mana ?? heroRow.mana, hero.essence ?? heroRow.essence,
           userId]
        );

        // ── Response: return ONLY the changed fields ────────────────
        //
        // The client's updateHero() now does a SHALLOW MERGE,
        // so we only need to send the fields that changed.
        // This is lighter than sending the entire hero object.
        // Recalculate derived stats for the response (matches the SQL formula)
        const newMaxHp = 100 + (heroRow.vit * 5) + (hero.level * 5);
        const newMaxMana = 50 + (heroRow.int * 3);

        return NextResponse.json({
            success: true, win, combatEnded,
            newEnemyHp: Math.max(0, eHp),
            newEnemyState: { hp: Math.max(0, eHp), bleed: eBleed },
            newPlayerHp: hero.hp,
            expGained, goldGained,
            droppedLoot,
            initialLogs, delayedLogs,
            updatedHero: {
                hp: hero.hp,
                maxHp: newMaxHp,
                gold: hero.gold,
                xp: hero.xp,
                level: hero.level,
                kills: hero.kills,
                deaths: hero.deaths,
                flasks: hero.flasks,
                mana: hero.mana ?? heroRow.mana,
                maxMana: newMaxMana,
                unspentPoints: hero.unspentStatPoints,
                skillPointsUnspent: hero.skillPointsUnspent,
            }
        });

    } catch(err) {
        console.error('[COMBAT]', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
