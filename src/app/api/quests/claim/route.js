// ═══════════════════════════════════════════════════════════════════
// POST /api/quests/claim — Claim rewards for a completed quest
// ═══════════════════════════════════════════════════════════════════
//
// DOUBLE-CLAIM PREVENTION:
//   The daily quest path now uses SELECT ... FOR UPDATE on hero_stats
//   before reading daily_quests JSONB. This serializes concurrent
//   claim requests so only one can read claimed=false at a time.
//
// STATUS ALIGNMENT:
//   The progress route sets status to 'completed' (matching the
//   player_quests CHECK constraint). The DAL claimQuestReward()
//   checks status === 'completed'. These now match.
//
// MIDDLEWARE:
//   Wrapped with withMiddleware for auth + rate limiting.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction } from '@/lib/db/pool';

/**
 * @param {Request} req
 * @param {{ userId: string }} ctx - Injected by middleware
 */
async function handlePost(req, { userId }) {
  const body = await req.json();
  const questId = body.questId || body.questKey;

  if (!questId) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'questId is required.' },
      { status: 400 }
    );
  }

  // ── Daily quest claim path ────────────────────────────────────
  //
  // Daily quests are stored as JSONB on hero_stats.daily_quests.
  // We need to:
  //   1. Lock the hero_stats row (FOR UPDATE) to serialize concurrent claims
  //   2. Read the daily_quests array and find the quest
  //   3. Verify it's completed and not already claimed
  //   4. Grant rewards atomically within the same transaction
  //   5. Mark as claimed in the JSONB array
  //
  if (questId.match(/^q\d+_\d{4}-\d{2}-\d{2}$/)) {
    const { data: result, error: txErr } = await transaction(async (client) => {
      // STEP 1: Lock hero_stats row to prevent double-claim
      const { rows: heroRows } = await client.query(
        `SELECT hp, gold, xp, level, daily_quests
         FROM hero_stats
         WHERE player_id = $1
         FOR UPDATE`,
        [userId]
      );

      if (heroRows.length === 0) throw new Error('Hero not found.');
      const hero = heroRows[0];
      const dailyQuests = hero.daily_quests || [];

      // STEP 2: Find the quest
      const quest = dailyQuests.find(q => q.id === questId);
      if (!quest) throw new Error('Quest not found.');

      // STEP 3: Verify status
      if (quest.claimed) {
        throw new Error('Already claimed.');
      }
      if ((quest.progress || 0) < (quest.target || 0)) {
        throw new Error(
          `Quest not complete (${quest.progress || 0}/${quest.target}).`
        );
      }

      // STEP 4: Grant rewards within this transaction
      const rewardGold = quest.reward?.gold || 0;
      const rewardXP = quest.reward?.xp || 0;

      const { rows: updatedHero } = await client.query(
        `UPDATE hero_stats
         SET gold = gold + $1,
             xp = xp + $2,
             updated_at = NOW()
         WHERE player_id = $3
         RETURNING gold, xp, level, hp, max_hp`,
        [rewardGold, rewardXP, userId]
      );

      // STEP 5: Mark quest as claimed in JSONB
      const updatedDaily = dailyQuests.map(q =>
        q.id === questId ? { ...q, claimed: true } : q
      );

      await client.query(
        `UPDATE hero_stats SET daily_quests = $1 WHERE player_id = $2`,
        [JSON.stringify(updatedDaily), userId]
      );

      const uh = updatedHero[0];
      return {
        reward: { gold: rewardGold, xp: rewardXP, items: [] },
        updatedHero: {
          gold: uh.gold,
          xp: uh.xp,
          level: uh.level,
          hp: uh.hp,
          maxHp: uh.max_hp,
        },
      };
    });

    if (txErr) {
      const msg = txErr.message;
      const status = msg.includes('not found') ? 404
                   : msg.includes('Already') ? 403
                   : msg.includes('not complete') ? 400
                   : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json({ success: true, ...result });
  }

  // ── DB quest claim path ───────────────────────────────────────
  try {
    const QuestDal = await import('@/lib/db/dal/quests');
    const { data: rewardData, error } = await QuestDal.claimQuestReward(userId, questId);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('not found')) status = 404;
      if (msg.includes('not finished') || msg.includes('already been claimed')) status = 403;
      return NextResponse.json({ error: 'CLAIM_FAILED', message: msg }, { status });
    }

    return NextResponse.json({
      success: true,
      reward: {
        gold: rewardData.reward_gold,
        xp: rewardData.reward_xp,
        items: rewardData.reward_items,
      },
      updatedHero: {
        gold: rewardData.hero_gold,
        xp: rewardData.hero_xp,
      },
    });
  } catch (dbErr) {
    console.error('[QUEST CLAIM DB ERROR]', dbErr.message);
    return NextResponse.json({
      error: 'CLAIM_FAILED',
      message: 'Quest system not available yet.',
    }, { status: 404 });
  }
}


// ── Export: rate-limited to prevent spam-claiming ────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest_progress',
  idempotency: false,
});
