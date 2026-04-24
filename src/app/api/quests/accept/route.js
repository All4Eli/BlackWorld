// ═══════════════════════════════════════════════════════════════════
// POST /api/quests/accept — Accept an available quest
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as QuestDal from '@/lib/db/dal/quests';

/**
 * POST /api/quests/accept
 *
 * Body: { questKey: "story_first_blood" }
 *
 * Server validates level, prerequisites, and duplicate acceptance.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { questKey } = body;

    // Backward compatibility: some old legacy UI might send full quest object
    // Extract the key if they send { quest: { id: "story_..." } } 
    const keyToUse = questKey || (body.quest && body.quest.id) || (body.quest && body.quest.key);

    if (!keyToUse) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'questKey is required.' },
        { status: 400 }
      );
    }

    const { data: acceptedQuest, error } = await QuestDal.startQuest(userId, keyToUse);

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
  } catch (err) {
    console.error('[POST /api/quests/accept]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true,
});
