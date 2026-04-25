// ═══════════════════════════════════════════════════════════════════
// POST /api/healer/flask — Buy a crimson flask for gold
// ═══════════════════════════════════════════════════════════════════
//
// FLASK OVERFLOW PREVENTION:
//   The UPDATE WHERE clause now includes `AND flasks < max_flasks`.
//   This is the second layer of defense (after the JS pre-check).
//
//   Without it, two concurrent requests could both pass the JS
//   check (flasks=2, max=3 → passes), then both UPDATEs succeed
//   (flasks becomes 4, exceeding max_flasks).
//
//   With the WHERE guard, the second request's WHERE fails because
//   flasks is already 3 (= max_flasks), and RETURNING returns 0 rows.
//
// LEAST(flasks + 1, max_flasks):
//   Even if the WHERE guard is somehow bypassed, LEAST acts as a
//   mathematical clamp — flasks can NEVER exceed max_flasks.
//   Belt AND suspenders.
//
// RATE LIMITING:
//   withMiddleware enforces auth + 'heal' rate limit (10/min).
//   This prevents macro-clicking bots from overwhelming the route.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';

/** Fixed flask cost in gold */
const FLASK_COST = 50;

/**
 * @param {Request} request
 * @param {{ userId: string }} ctx - Injected by middleware after JWT verification
 */
async function handlePost(request, { userId }) {
  // ── 1. Pre-check current state ──────────────────────────────
  const { data: heroRow, error: pError } = await sqlOne(
    'SELECT gold, flasks, max_flasks FROM hero_stats WHERE player_id = $1',
    [userId]
  );
  if (pError || !heroRow) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  const maxFlasks = heroRow.max_flasks || 3;

  if ((heroRow.gold || 0) < FLASK_COST) {
    return NextResponse.json({ error: `Need ${FLASK_COST} gold to buy a flask.` }, { status: 400 });
  }

  if ((heroRow.flasks || 0) >= maxFlasks) {
    return NextResponse.json({ error: 'Already carrying max flasks.' }, { status: 400 });
  }

  // ── 2. Atomic UPDATE with OVERFLOW GUARD ────────────────────
  //
  // SET flasks = LEAST(flasks + 1, max_flasks):
  //   Mathematical clamp. Even in the impossible case that the
  //   WHERE guard is bypassed, flasks can never exceed max_flasks.
  //
  // WHERE gold >= $1 AND flasks < max_flasks:
  //   Two guards:
  //     gold >= $1       → prevents spending gold you don't have
  //     flasks < max_flasks → prevents flask overflow on concurrent requests
  //
  //   If a concurrent request already incremented flasks to max,
  //   this WHERE fails and RETURNING returns nothing. We catch it below.
  const { data: updated, error: updateErr } = await sqlOne(
    `UPDATE hero_stats
     SET gold = gold - $1,
         flasks = LEAST(flasks + 1, max_flasks),
         updated_at = NOW()
     WHERE player_id = $2
       AND gold >= $1
       AND flasks < max_flasks
     RETURNING gold, flasks, max_flasks`,
    [FLASK_COST, userId]
  );

  if (updateErr) throw updateErr;

  if (!updated) {
    return NextResponse.json(
      { error: 'Purchase failed — state changed. Try again.' },
      { status: 409 }
    );
  }

  // ── 3. Return ONLY changed fields for shallow merge ─────────
  return NextResponse.json({
    success: true,
    cost: FLASK_COST,
    updatedHero: {
      gold: updated.gold,
      flasks: updated.flasks,
      maxFlasks: updated.max_flasks,
    },
  });
}


// ── Export: rate-limited to prevent spam-buying ──────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'heal',
  idempotency: false,
});
