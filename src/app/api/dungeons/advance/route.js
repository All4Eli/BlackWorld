// ═══════════════════════════════════════════════════════════════════
// POST /api/dungeons/advance — Ascend to the next floor
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as DungeonDal from '@/lib/db/dal/dungeons';

/**
 * POST /api/dungeons/advance
 *
 * Body: { floorCleared: boolean }
 *
 * Progresses the dungeon run if the previous encounter was cleared.
 * If the final floor is reached, it automatically allocates the rewards.
 * It will implicitly throw a 400 ERROR if an active combat session is still present.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const floorCleared = body.floorCleared ?? true; // Assume true unless specified otherwise (e.g. fled)

    const { data: step, error } = await DungeonDal.advanceDungeonFloor(userId, floorCleared);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('Not found') || msg.includes('No active dungeon')) status = 404;
      if (msg.includes('active combat')) status = 403; // Bumping someone violating game sequence

      return NextResponse.json({ error: 'ADVANCE_DENIED', message: msg }, { status });
    }

    // SANITIZATION: Send the safe UI structure
    // If the dungeon is finished:
    if (step.status === 'VICTORY' || step.status === 'DEFEAT') {
        return NextResponse.json({
            success: true,
            status: step.status,
            message: step.message,
            rewards: step.rewards || null
        });
    }

    // Otherwise, we are IN_PROGRESS and spawned a new combat encounter
    return NextResponse.json({
      success: true,
      status: 'IN_PROGRESS',
      floor: step.floor,
      totalFloors: step.totalFloors,
      encounterType: step.encounterType,
      // Minimal combat session data to display the fight frame
      combatState: step.combatSession ? {
          playerHp: step.combatSession.player_hp,
          monsterHp: step.combatSession.monster_hp,
          turnCount: step.combatSession.turn_count,
          playerStatuses: step.combatSession.player_statuses,
          monsterStatuses: step.combatSession.monster_statuses
      } : null
    });

  } catch (err) {
    console.error('[POST /api/dungeons/advance]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

// ── Rate Limit ──
export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true, // Idempotency is very useful here so a double-click doesn't skip two floors.
});
