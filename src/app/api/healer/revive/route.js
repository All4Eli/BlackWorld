// ═══════════════════════════════════════════════════════════════════
// POST /api/healer/revive — Resurrect from death for gold
// ═══════════════════════════════════════════════════════════════════
//
// ZOMBIE EXPLOIT PREVENTION:
//   The UPDATE WHERE clause now includes `AND hp <= 0`.
//   Without this, a concurrent revive request could fire after the
//   player is already alive (from the first revive), and the WHERE
//   would still pass (gold >= cost), deducting gold AGAIN without
//   providing any benefit (hp = max_hp on an already-alive player).
//
//   With `AND hp <= 0`, the second request's WHERE fails because
//   hp is already max_hp (from the first revive), and RETURNING
//   returns nothing. No double-charge possible.
//
// RATE LIMITING:
//   withMiddleware enforces auth + 'heal' rate limit (10/min).
//   This prevents macro-clicking bots from spamming revive.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';

/**
 * Revive cost scales with player level:
 *   Math.floor((level * 10) * 0.1) + 10
 *   Level 1: floor(1) + 10 = 11 gold
 *   Level 10: floor(10) + 10 = 20 gold
 *   Level 50: floor(50) + 10 = 60 gold
 *
 * This provides a mild gold sink that scales with progression.
 */
function calcReviveCost(level) {
  return Math.floor(((level || 1) * 10) * 0.1) + 10;
}

/**
 * @param {Request} request
 * @param {{ userId: string }} ctx - Injected by middleware after JWT verification
 */
async function handlePost(request, { userId }) {
  // ── 1. Pre-check current state ──────────────────────────────
  const { data: heroRow, error: heroErr } = await sqlOne(
    'SELECT hp, max_hp, gold, level FROM hero_stats WHERE player_id = $1',
    [userId]
  );

  if (heroErr || !heroRow) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  // ── 2. Zombie Guard (JS fast-fail) ─────────────────────────
  //   If the player is alive, they shouldn't use Revive.
  //   The heal route is for living players, revive is for dead ones.
  if (heroRow.hp > 0) {
    return NextResponse.json(
      { error: 'You are already alive.' },
      { status: 400 }
    );
  }

  const reviveCost = calcReviveCost(heroRow.level);

  if ((heroRow.gold || 0) < reviveCost) {
    return NextResponse.json(
      { error: `Need ${reviveCost} gold to revive.` },
      { status: 400 }
    );
  }

  // ── 3. Atomic UPDATE with ZOMBIE GUARD in WHERE ─────────────
  //
  // WHERE conditions:
  //   player_id = $2  → target the correct player
  //   gold >= $1      → can afford the revive cost
  //   hp <= 0         → ZOMBIE GUARD: player must actually be dead
  //
  // If a concurrent revive already brought hp to max_hp, this
  // WHERE fails because hp is no longer <= 0. No double-charge.
  const { data: updated, error: updateErr } = await sqlOne(
    `UPDATE hero_stats
     SET hp = max_hp,
         gold = gold - $1,
         updated_at = NOW()
     WHERE player_id = $2
       AND gold >= $1
       AND hp <= 0
     RETURNING hp, max_hp, gold`,
    [reviveCost, userId]
  );

  if (updateErr) throw updateErr;

  if (!updated) {
    return NextResponse.json(
      { error: 'Revive failed — state changed. Try again.' },
      { status: 409 }
    );
  }

  // ── 4. Return ONLY changed fields for shallow merge ─────────
  return NextResponse.json({
    success: true,
    cost: reviveCost,
    updatedHero: {
      hp: updated.hp,
      maxHp: updated.max_hp,
      gold: updated.gold,
    },
  });
}


// ── Export: rate-limited via 'heal' bucket ───────────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'heal',
  idempotency: false,
});
