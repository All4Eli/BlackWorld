// ═══════════════════════════════════════════════════════════════════
// POST /api/dungeons/start — Initialize a new dungeon run
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as DungeonDal from '@/lib/db/dal/dungeons';

/**
 * POST /api/dungeons/start
 *
 * Body: { dungeonId: "uuid" }
 *
 * Exclusively responsible for locking the DB to ensure cooldown validations
 * and preventing multiple concurrent dungeon runs. 
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { dungeonId } = body;

    if (!dungeonId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'dungeonId is required.' },
        { status: 400 }
      );
    }

    const { data: run, error } = await DungeonDal.startDungeonRun(userId, dungeonId);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('not found')) status = 404;
      if (msg.includes('cooldown') || msg.includes('requirement')) status = 403;
      if (msg.includes('active')) status = 409;

      return NextResponse.json({ error: 'DUNGEON_LOCKED', message: msg }, { status });
    }

    // Sanitization: don't leak DB IDs to the client unless necessary
    return NextResponse.json({
      success: true,
      runId: run.id,
      dungeonId: run.dungeon_id,
      floorReached: run.floor_reached,
      startedAt: run.started_at
    });

  } catch (err) {
    console.error('[POST /api/dungeons/start]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

// ── Rate Limit ──
// We use the 'quest' or generic limiter since dungeon entries are rare events, 
// unlike spammy combat.
export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true, // Crucial! We don't want someone entering the dungeon twice via network glitch
});
