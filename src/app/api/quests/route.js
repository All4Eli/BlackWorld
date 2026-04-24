// ═══════════════════════════════════════════════════════════════════
// GET /api/quests — Fetch player's quest portfolio
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as QuestDal from '@/lib/db/dal/quests';
import * as HeroDal from '@/lib/db/dal/hero';

/**
 * GET /api/quests
 *
 * Returns the player's comprehensive quest state, including:
 * - Active quests
 * - Completed quests (ready to claim)
 * - Available quests (filtered by level/prerequisites)
 * - Daily and Weekly rotation (available + not completed/active today)
 */
export async function GET(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'You must be logged in.' },
      { status: 401 }
    );
  }

  try {
    const { data: hero } = await HeroDal.getHeroStats(userId);
    const level = hero?.level || 1;

    // Run DAL fetches concurrently
    const [
      activeReq,
      completedReq,
      availableReq,
      dailyReq,
      weeklyReq
    ] = await Promise.all([
      QuestDal.getActiveQuests(userId),
      QuestDal.getCompletedQuests(userId),
      QuestDal.getAvailableQuests(userId, level),
      QuestDal.getDailyQuests(userId, level),
      QuestDal.getWeeklyQuests(userId, level)
    ]);

    return NextResponse.json({
      quests: {
        active: activeReq.data || [],
        completed: completedReq.data || [],
        available: availableReq.data || [],
        daily: dailyReq.data || [],
        weekly: weeklyReq.data || []
      }
    });

  } catch (err) {
    console.error('[GET /api/quests]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}
