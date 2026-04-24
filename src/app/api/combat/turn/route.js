// ═══════════════════════════════════════════════════════════════════
// POST /api/combat/turn — Process one single combat round
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as CombatDal from '@/lib/db/dal/combat';

/**
 * POST /api/combat/turn
 *
 * Body: { action: "ATTACK" | "USE_FLASK" | "FLEE" }
 *
 * This route is hyper-optimized and locked down against macro abuse.
 * It passes intent directly to the engine and returns ONLY safe, sanitized
 * view-state data for the client UI.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { action } = body;

    const validActions = ['ATTACK', 'USE_FLASK', 'FLEE'];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Unknown combat action.' },
        { status: 400 }
      );
    }

    const { data: engineResult, error } = await CombatDal.processTurn(userId, action);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('No active combat')) status = 404;
      if (msg.includes('flask')) status = 403;

      return NextResponse.json({ error: 'COMBAT_ERROR', message: msg }, { status });
    }

    // SANITIZATION: Never pass the raw engine variables down to the client.
    // The client only needs the combat log array, HP values, and if the fight is over.
    return NextResponse.json({
      success: true,
      isOver: engineResult.isOver,
      result: engineResult.result,     // 'VICTORY', 'DEFEAT', 'FLED', or null
      log: engineResult.log,           // Array of parsed lines for rendering
      rewards: engineResult.rewards,   // E.g., { gold: 15, xp: 20 }
      penalties: engineResult.penalties,
      
      // Sanitized active state
      state: {
        playerHp: engineResult.state.player_hp,
        monsterHp: engineResult.state.monster_hp,
        turnCount: engineResult.state.turn_count,
        playerStatuses: engineResult.state.player_statuses,
        monsterStatuses: engineResult.state.monster_statuses
      }
    });

  } catch (err) {
    console.error('[POST /api/combat/turn]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

// ── Strict Anti-Macro Rate Limit ──
// We apply the rateLimit action 'combat'. Based on the GDD and rate_limit_config
// this corresponds to ~60 actions per minute (1 per second max).
export const POST = withMiddleware(handlePost, {
  rateLimit: 'combat', 
  idempotency: false, // Turn resolution naturally shifts state; repeating is fine, but limited
});
