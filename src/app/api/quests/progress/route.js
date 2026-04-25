// ═══════════════════════════════════════════════════════════════════
// POST /api/quests/progress — Increment quest progress after combat
// ═══════════════════════════════════════════════════════════════════
//
// DATA FLOW (Combat System → Quest Progress → QuestLog UI):
//
//   1. Player kills a monster in combat. The combat resolution
//      handler calls:
//        POST /api/quests/progress
//        Body: { event: "KILL_ENEMIES", zoneId: "bone_crypts", count: 1 }
//
//   2. This endpoint finds ALL active player_quests whose
//      objective_type matches the event. For each match:
//        a) Increment progress_count by the event count
//        b) If progress >= objective_target → set status = 'ready_to_turn_in'
//        c) Return which quests were updated
//
//   3. QuestLog.jsx polls or re-fetches, showing the updated
//      progress fractions [ 3 / 5 ] and enabling "Claim" buttons.
//
// SQL FOCUS — CONDITIONAL UPDATE WITH JOIN:
//
//   UPDATE player_quests pq
//   SET progress = LEAST(pq.progress + $3, q.objective_target)
//   FROM quests q
//   WHERE pq.quest_id = q.id
//     AND pq.player_id = $1
//     AND pq.status = 'active'
//     AND q.objective_type = $2
//
//   BREAKDOWN:
//     - UPDATE ... SET ... FROM: PostgreSQL allows JOINing another table
//       in an UPDATE. We join quests (q) to access objective_target.
//     - LEAST(pq.progress + $3, q.objective_target): Clamps progress
//       so it never exceeds the target. Without this, killing 3 extra
//       enemies would show [ 8 / 5 ] which is confusing.
//     - WHERE pq.status = 'active': Only increment quests that are
//       in-progress. Completed/claimed quests are untouched.
//     - AND q.objective_type = $2: Only quests whose objective matches
//       the event type (KILL_ENEMIES, KILL_BOSS, etc.)
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, transaction } from '@/lib/db/pool';


// ── Valid event types (must match quests.objective_type enum) ────
const VALID_EVENTS = [
  'KILL_ENEMIES',
  'KILL_BOSS',
  'SLAY_MONSTERS',
  'SLAY_BOSS',
  'COMPLETE_DUNGEON',
  'GOLD_EARNED',
  'GATHER_RESOURCES',
  'ENHANCE_ITEM',
  'PVP_WIN',
  'AUCTION_SELL',
];


// ─────────────────────────────────────────────────────────────────
//  POST /api/quests/progress
// ─────────────────────────────────────────────────────────────────
//
// Body: {
//   event: "KILL_ENEMIES",     ← What happened
//   count: 1,                  ← How many (default 1)
//   zoneId: "bone_crypts",     ← Optional zone filter
//   monsterId: "uuid",         ← Optional specific monster
// }
//
// Returns: {
//   updatedQuests: [{ questId, title, progress, target, status }],
//   readyToClaim: [{ questId, title }]
// }
//
async function handlePost(req, { userId }) {
  const { event, count = 1, zoneId, monsterId } = await req.json();

  if (!event || !VALID_EVENTS.includes(event)) {
    return NextResponse.json({
      error: `Invalid event. Must be one of: ${VALID_EVENTS.join(', ')}`,
    }, { status: 400 });
  }

  // ── Execute inside a transaction ──────────────────────────────
  //
  // WHY a transaction?
  //   We need to:
  //     1. Increment progress on matching quests
  //     2. Transition completed quests to 'ready_to_turn_in'
  //   Both must happen atomically — if step 2 fails, we don't want
  //   step 1 to have already committed partial state.
  //
  const { data: result, error: txErr } = await transaction(async (client) => {

    // ── STEP 1: Find active quests matching this event ──────────
    //
    // JOIN player_quests (pq) with quests (q) to access:
    //   - q.objective_type (does it match our event?)
    //   - q.objective_target (how many kills are needed?)
    //   - q.zone_id (optional zone restriction)
    //
    // FOR UPDATE locks the player_quests rows so concurrent
    // progress events don't cause lost updates.
    //
    // EXPLANATION OF THE ZONE FILTER:
    //   (q.zone_id IS NULL OR q.zone_id = $3)
    //   This handles two cases:
    //     a) zone_id IS NULL → quest applies to ALL zones (daily/weekly)
    //     b) zone_id = $3 → quest only counts kills in this specific zone
    //
    const matchQuery = `
      SELECT pq.id AS pq_id, pq.progress, pq.status,
             q.id AS quest_id, q.title, q.objective_target, q.objective_type, q.zone_id
      FROM player_quests pq
      JOIN quests q ON q.id = pq.quest_id
      WHERE pq.player_id = $1
        AND pq.status = 'active'
        AND q.objective_type = $2
        AND (q.zone_id IS NULL OR q.zone_id = $3)
      FOR UPDATE OF pq
    `;

    const matchRes = await client.query(matchQuery, [userId, event, zoneId || '']);

    if (matchRes.rows.length === 0) {
      // No matching quests — this is fine, just return empty
      return { updatedQuests: [], readyToClaim: [] };
    }

    // ── STEP 2: Increment progress on each matching quest ───────
    //
    // For each matched quest, we update progress and check if
    // it should transition to 'ready_to_turn_in'.
    //
    // LEAST(progress + $2, objective_target):
    //   Prevents progress from exceeding the target.
    //   Example: target=5, current=4, count=3 → LEAST(7, 5) = 5
    //
    const updatedQuests = [];
    const readyToClaim = [];

    for (const row of matchRes.rows) {
      const newProgress = Math.min(row.progress + count, row.objective_target);
      const isComplete = newProgress >= row.objective_target;
      // STATUS ALIGNMENT:
      //   Must be 'completed', NOT 'ready_to_turn_in'.
      //   The player_quests CHECK constraint only allows:
      //     'active', 'completed', 'claimed', 'abandoned'
      //   And the DAL claimQuestReward() checks status === 'completed'.
      const newStatus = isComplete ? 'completed' : 'active';

      await client.query(
        `UPDATE player_quests
         SET progress = $2,
             status = $3,
             completed_at = CASE WHEN $3 = 'completed' AND completed_at IS NULL THEN now() ELSE completed_at END
         WHERE id = $1`,
        [row.pq_id, newProgress, newStatus]
      );

      updatedQuests.push({
        questId:  row.quest_id,
        title:    row.title,
        progress: newProgress,
        target:   row.objective_target,
        status:   newStatus,
      });

      if (isComplete) {
        readyToClaim.push({
          questId: row.quest_id,
          title:   row.title,
        });
      }
    }

    return { updatedQuests, readyToClaim };
  });

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...result });
}


// ─────────────────────────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────────────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest_progress',
  idempotency: false, // Progress is intentionally additive per event
});
