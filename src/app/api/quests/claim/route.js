// ═══════════════════════════════════════════════════════════════════
// POST /api/quests/claim — Claim rewards for a completed quest
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as QuestDal from '@/lib/db/dal/quests';

/**
 * POST /api/quests/claim
 *
 * Body: { questId: "story_first_blood" } (Actually the questKey is expected)
 *
 * Server validates completion status and grants gold, XP, and items
 * atomically in a single transaction.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    
    // Backward compatibility: legacy code sent the quest's key as 'questId'
    // in the JSON body payload.
    const questKey = body.questId || body.questKey;

    if (!questKey) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'questId/questKey is required.' },
        { status: 400 }
      );
    }

    const { data: rewardData, error } = await QuestDal.claimQuestReward(userId, questKey);

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
        items: rewardData.reward_items
      },
      updatedStats: {
        gold: rewardData.hero_gold,
        xp: rewardData.hero_xp
      }
    });
  } catch (err) {
    console.error('[POST /api/quests/claim]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true, // Prevents accidental double-claiming of rewards
});
