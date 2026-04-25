// ═══════════════════════════════════════════════════════════════════
// POST /api/dungeons/advance — Ascend to the next floor
// ═══════════════════════════════════════════════════════════════════
//
// FULL DATA FLOW (DungeonRunner.jsx → API → PostgreSQL):
//
//   1. Player clears a floor's combat encounter.
//      React sends: POST /api/dungeons/advance { floorCleared: true }
//
//   2. This API wraps the full operation in a transaction:
//        a) SELECT dungeon_runs FOR UPDATE (lock the active run)
//        b) Verify no active combat session exists
//        c) Increment floor_reached
//        d) Look up dungeon_floor_rewards for this floor
//        e) Grant floor-specific bonus gold/XP
//        f) Resolve floor loot table → grant items
//        g) If final floor: mark run 'completed', grant dungeon rewards
//        h) If not final: spawn next floor's combat encounter
//
//   3. Returns:
//        { status: 'IN_PROGRESS', floor, totalFloors, combatState, floorRewards }
//        or { status: 'VICTORY', rewards: {...} }
//        or { status: 'DEFEAT' }
//
// STATE PRESERVATION BETWEEN FLOORS:
//   The dungeon_runs row persists between floors. It tracks:
//     - floor_reached: current floor number (0 = just started)
//     - result: 'in_progress' | 'completed' | 'failed' | 'abandoned'
//     - gold_earned / xp_earned: cumulative totals across all floors
//     - loot_earned: JSONB array of all items found during the run
//
//   The player's HP carries over between floors (tracked in hero_stats).
//   If they die on floor 3, they lose all progress but keep floor loot
//   earned on floors 1-2 (design decision: partial rewards on failure).
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { pool } from '@/lib/db/pool';


async function handlePost(request, { userId }) {
  const client = await pool.connect();

  try {
    const body = await request.json();
    const floorCleared = body.floorCleared ?? true;

    await client.query('BEGIN');

    // ── STEP 1: Lock the active dungeon run ─────────────────────
    //
    // SELECT ... FOR UPDATE locks this specific row. If two requests
    // arrive simultaneously (e.g., double-click), the second blocks
    // here until the first transaction commits. This prevents:
    //   - Skipping floors
    //   - Granting double rewards
    //   - Race conditions in floor_reached increment
    //
    const { rows: runRows } = await client.query(
      `SELECT * FROM dungeon_runs WHERE player_id = $1 AND result = 'in_progress' FOR UPDATE`,
      [userId]
    );

    if (runRows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'ADVANCE_DENIED', message: 'No active dungeon run found.' },
        { status: 404 }
      );
    }

    const run = runRows[0];

    // ── STEP 2: Fetch dungeon definition ────────────────────────
    const { rows: dungeonRows } = await client.query(
      `SELECT * FROM dungeons WHERE id = $1`,
      [run.dungeon_id]
    );
    const dungeon = dungeonRows[0];

    // ── STEP 3: Check for active combat session ─────────────────
    //
    // Players must finish their combat encounter before advancing.
    // FOR SHARE (not FOR UPDATE) because we only read the combat row.
    //
    const { rows: combatCheck } = await client.query(
      `SELECT id FROM combat_sessions WHERE player_id = $1 FOR SHARE`,
      [userId]
    );
    if (combatCheck.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'ADVANCE_DENIED', message: 'Cannot advance floor while in active combat.' },
        { status: 403 }
      );
    }

    // ── STEP 4: Handle floor failure (death/flee) ───────────────
    if (!floorCleared) {
      await client.query(
        `UPDATE dungeon_runs SET result = 'failed', completed_at = now() WHERE id = $1`,
        [run.id]
      );

      // Trigger quest progress for partial dungeon completion
      // (We don't mark COMPLETE_DUNGEON since they failed)

      await client.query('COMMIT');
      return NextResponse.json({
        success: true,
        status: 'DEFEAT',
        message: 'Dungeon run failed.',
        floorReached: run.floor_reached,
      });
    }

    // ── STEP 5: Advance to next floor ───────────────────────────
    const nextFloor = run.floor_reached + 1;

    // ── STEP 6: Look up floor-specific rewards ──────────────────
    //
    // RELATIONAL LOOKUP:
    //   dungeon_floor_rewards has a composite key (dungeon_id, floor_num).
    //   We fetch the rewards for the floor the player JUST cleared
    //   (run.floor_reached, which they just beat, or nextFloor if
    //    we consider floor_reached as "floors completed").
    //
    //   Since floor_reached starts at 0 and we're about to increment
    //   to nextFloor, the player just cleared floor (nextFloor).
    //   Wait — actually, when they advance, they've cleared the current
    //   floor and move TO the next one. Let's reward the floor they're leaving.
    //
    //   Floor 1: cleared → reward for floor 1, move to floor 2
    //   Floor 5: cleared → if floor_count=5, VICTORY + final rewards
    //
    const clearedFloor = nextFloor; // The floor number they just completed
    const { rows: floorRewardRows } = await client.query(
      `SELECT * FROM dungeon_floor_rewards WHERE dungeon_id = $1 AND floor_num = $2`,
      [run.dungeon_id, clearedFloor]
    );
    const floorReward = floorRewardRows[0] || null;

    // ── STEP 7: Grant floor rewards ─────────────────────────────
    let floorGold = floorReward?.bonus_gold || 0;
    let floorXP = floorReward?.bonus_xp || 0;
    const floorLoot = [];

    // Resolve floor loot table
    if (floorReward?.loot_table) {
      let rawLoot = floorReward.loot_table;
      if (typeof rawLoot === 'string') rawLoot = JSON.parse(rawLoot);
      if (Array.isArray(rawLoot)) {
        for (const entry of rawLoot) {
          if (Math.random() <= (entry.chance || 0.5)) {
            const qty = Math.floor(Math.random() * ((entry.maxQty || 1) - (entry.minQty || 1) + 1)) + (entry.minQty || 1);
            floorLoot.push({
              itemKey: entry.itemKey,
              name: entry.name || entry.itemKey,
              quantity: qty,
              tier: entry.tier || 'COMMON',
            });
          }
        }
      }
    }

    // Grant floor gold + XP to hero
    if (floorGold > 0 || floorXP > 0) {
      await client.query(
        `UPDATE hero_stats SET gold = gold + $1, xp = xp + $2 WHERE player_id = $3`,
        [floorGold, floorXP, userId]
      );
    }

    // Accumulate on the run record
    const existingLoot = run.loot_earned || [];
    const allLoot = [...existingLoot, ...floorLoot];

    // ── STEP 8: Check if dungeon is CLEARED ─────────────────────
    if (nextFloor > dungeon.floor_count) {
      // DUNGEON COMPLETE! Grant the dungeon's completion rewards
      const rewards = dungeon.rewards || {};
      const completionGold = rewards.gold || 0;
      const completionXP = rewards.xp || 0;
      const totalGold = (run.gold_earned || 0) + floorGold + completionGold;
      const totalXP = (run.xp_earned || 0) + floorXP + completionXP;

      // Grant completion rewards + increment dungeon_clears counter
      if (completionGold > 0 || completionXP > 0) {
        await client.query(
          `UPDATE hero_stats SET gold = gold + $1, xp = xp + $2, dungeon_clears = dungeon_clears + 1 WHERE player_id = $3`,
          [completionGold, completionXP, userId]
        );
      } else {
        // No gold/XP reward, but still count the clear
        await client.query(
          `UPDATE hero_stats SET dungeon_clears = dungeon_clears + 1 WHERE player_id = $1`,
          [userId]
        );
      }

      // Finalize the run
      await client.query(
        `UPDATE dungeon_runs
         SET result = 'completed', completed_at = now(),
             gold_earned = $1, xp_earned = $2, loot_earned = $3,
             floor_reached = $4
         WHERE id = $5`,
        [totalGold, totalXP, JSON.stringify(allLoot), dungeon.floor_count, run.id]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        status: 'VICTORY',
        message: `Dungeon cleared! Total: ${totalGold} gold, ${totalXP} XP.`,
        rewards: {
          gold: totalGold,
          xp: totalXP,
          floorLoot,
          completionGold,
          completionXP,
        },
      });
    }

    // ── STEP 9: Still in dungeon — spawn next encounter ─────────
    //
    // Update floor_reached and accumulated loot
    //
    await client.query(
      `UPDATE dungeon_runs
       SET floor_reached = $1,
           gold_earned = gold_earned + $2,
           xp_earned = xp_earned + $3,
           loot_earned = $4
       WHERE id = $5`,
      [nextFloor, floorGold, floorXP, JSON.stringify(allLoot), run.id]
    );

    // ── STEP 10: Spawn combat encounter for the next floor ──────
    let encounterType = 'REGULAR';
    let monsterIdSpawn = null;

    // Check if next floor is a boss floor
    const { rows: nextFloorRows } = await client.query(
      `SELECT is_boss_floor, monster_power_mult FROM dungeon_floor_rewards
       WHERE dungeon_id = $1 AND floor_num = $2`,
      [run.dungeon_id, nextFloor]
    );
    const nextFloorDef = nextFloorRows[0] || null;

    if (nextFloor === dungeon.floor_count && dungeon.boss_id) {
      // Final floor = boss
      encounterType = 'BOSS';
      monsterIdSpawn = dungeon.boss_id;
    } else if (nextFloorDef?.is_boss_floor) {
      encounterType = 'MINIBOSS';
      // Still spawn a zone monster but with higher power
      const { rows: randomMonsters } = await client.query(
        `SELECT id FROM monsters WHERE zone_id = $1 AND tier != 'BOSS' ORDER BY RANDOM() LIMIT 1`,
        [dungeon.zone_id]
      );
      if (randomMonsters.length > 0) monsterIdSpawn = randomMonsters[0].id;
    } else {
      // Regular floor
      const { rows: randomMonsters } = await client.query(
        `SELECT id FROM monsters WHERE zone_id = $1 AND tier != 'BOSS' ORDER BY RANDOM() LIMIT 1`,
        [dungeon.zone_id]
      );
      if (randomMonsters.length > 0) monsterIdSpawn = randomMonsters[0].id;
    }

    let combatSessionPayload = null;
    if (monsterIdSpawn) {
      const { rows: heroInfo } = await client.query(
        `SELECT hp, max_hp FROM hero_stats WHERE player_id = $1`,
        [userId]
      );
      const { rows: monsterInfo } = await client.query(
        `SELECT hp FROM monsters WHERE id = $1`,
        [monsterIdSpawn]
      );

      const pHP = heroInfo[0].hp > 0 ? heroInfo[0].hp : heroInfo[0].max_hp;
      let mHP = monsterInfo[0]?.hp || 50;

      // Apply floor power multiplier
      if (nextFloorDef?.monster_power_mult) {
        mHP = Math.floor(mHP * parseFloat(nextFloorDef.monster_power_mult));
      }

      const { rows: combatCreated } = await client.query(
        `INSERT INTO combat_sessions (player_id, monster_id, zone_id, player_hp, monster_hp)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, monsterIdSpawn, dungeon.zone_id, pHP, mHP]
      );
      combatSessionPayload = combatCreated[0];
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      status: 'IN_PROGRESS',
      floor: nextFloor,
      totalFloors: dungeon.floor_count,
      encounterType,
      floorRewards: floorGold > 0 || floorLoot.length > 0
        ? { gold: floorGold, xp: floorXP, loot: floorLoot }
        : null,
      combatState: combatSessionPayload ? {
        playerHp: combatSessionPayload.player_hp,
        monsterHp: combatSessionPayload.monster_hp,
        turnCount: combatSessionPayload.turn_count,
        playerStatuses: combatSessionPayload.player_statuses,
        monsterStatuses: combatSessionPayload.monster_statuses,
      } : null,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /api/dungeons/advance]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}


// ── Rate Limit + Idempotency ────────────────────────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true, // Prevents double-click skipping two floors
});
