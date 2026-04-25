// ═══════════════════════════════════════════════════════════════════
// POST /api/quests/accept — Accept an available quest
// ═══════════════════════════════════════════════════════════════════
//
// RACE CONDITION PREVENTION:
//   Daily quest acceptance now uses SELECT ... FOR UPDATE on hero_stats
//   before reading/writing daily_quests JSONB. This serializes
//   concurrent accept requests so only one can add the quest.
//
// MIDDLEWARE:
//   Wrapped with withMiddleware for auth + rate limiting.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as HeroDal from '@/lib/db/dal/hero';
import { transaction } from '@/lib/db/pool';

/**
 * @param {Request} req
 * @param {{ userId: string }} ctx - Injected by middleware
 */
async function handlePost(req, { userId }) {
  const body = await req.json();

  // Extract quest identifier
  const questKey = body.questKey || body.quest?.key;
  const questObj = body.quest; // Full quest object for daily quests

  // ── Daily quest path ──────────────────────────────────────────
  // Daily quests have IDs like "q1_2026-04-24" — they're locally generated,
  // not in the DB quests table. Accept by marking them on hero_stats.
  if (questObj && questObj.id && questObj.id.match(/^q\d+_\d{4}-\d{2}-\d{2}$/)) {
    const { data: result, error: txErr } = await transaction(async (client) => {
      // STEP 1: Lock hero_stats row to prevent concurrent acceptance
      const { rows: heroRows } = await client.query(
        `SELECT daily_quests FROM hero_stats
         WHERE player_id = $1
         FOR UPDATE`,
        [userId]
      );

      if (heroRows.length === 0) throw new Error('Hero not found.');

      const currentDaily = heroRows[0].daily_quests || [];

      // STEP 2: Check if already accepted
      const existing = currentDaily.find(q => q.id === questObj.id);
      if (existing && existing.accepted) {
        throw new Error('Quest already accepted.');
      }

      // STEP 3: Build updated array
      let updatedDaily;
      if (existing) {
        updatedDaily = currentDaily.map(q =>
          q.id === questObj.id ? { ...q, accepted: true } : q
        );
      } else {
        updatedDaily = [...currentDaily, { ...questObj, accepted: true, progress: 0 }];
      }

      // STEP 4: Write atomically
      await client.query(
        `UPDATE hero_stats SET daily_quests = $1 WHERE player_id = $2`,
        [JSON.stringify(updatedDaily), userId]
      );

      return { quest: { ...questObj, accepted: true } };
    });

    if (txErr) {
      const msg = txErr.message;
      const status = msg.includes('already') ? 409 : msg.includes('not found') ? 404 : 400;
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json({
      success: true,
      quest: result.quest,
    });
  }

  // ── DB quest path ─────────────────────────────────────────────
  // Try to use the QuestDal for database-backed quests
  if (questKey) {
    try {
      const QuestDal = await import('@/lib/db/dal/quests');
      const { data: acceptedQuest, error } = await QuestDal.startQuest(userId, questKey);

      if (error) {
        const msg = error.message;
        let status = 400;
        if (msg.includes('not found')) status = 404;
        if (msg.includes('already')) status = 409;
        if (msg.includes('Level') || msg.includes('prerequisite')) status = 403;

        return NextResponse.json({ error: 'ACCEPT_FAILED', message: msg }, { status });
      }

      return NextResponse.json({
        success: true,
        quest: acceptedQuest,
      });
    } catch (dbErr) {
      // quests table may not exist — treat as not found
      console.error('[QUEST ACCEPT DB ERROR]', dbErr.message);
      return NextResponse.json({
        error: 'ACCEPT_FAILED',
        message: 'Quest system not available yet.',
      }, { status: 404 });
    }
  }

  return NextResponse.json(
    { error: 'BAD_REQUEST', message: 'questKey or quest object is required.' },
    { status: 400 }
  );
}


// ── Export: rate-limited ─────────────────────────────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest_progress',
  idempotency: false,
});
