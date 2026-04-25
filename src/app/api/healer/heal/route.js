// ═══════════════════════════════════════════════════════════════════
// POST /api/healer/heal — Restore HP to max for a gold cost
// ═══════════════════════════════════════════════════════════════════
//
// MIDDLEWARE LIFECYCLE:
//   1. withMiddleware intercepts the request BEFORE handlePost runs.
//   2. It calls auth() to extract userId from the __bw_sess cookie.
//   3. It checks the 'heal' rate limit (10 req/min) to prevent
//      macro abuse (e.g., a bot spamming heal to stay alive).
//   4. Only THEN does it call handlePost(request, { userId }).
//
// JSONB CLEANUP:
//   OLD: Response spread hero_data blob into the response payload.
//   NEW: Response returns only the specific fields the client needs.
//        hero_data is never read or written.
//
// ECONOMIC SAFETY:
//   The UPDATE query uses a WHERE clause with TWO conditions:
//     gold >= $1 AND hp < max_hp
//   This means if gold was already spent by a concurrent request,
//   the WHERE fails, RETURNING returns 0 rows, and we detect it.
//   This is called "optimistic concurrency control" — the database
//   itself enforces the business rule, not a JS if-statement.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';

/** Fixed heal cost in gold (could move to server_config table later) */
const HEAL_COST = 20;

/**
 * @param {Request} request
 * @param {{ userId: string }} ctx - Injected by middleware after JWT verification
 */
async function handlePost(request, { userId }) {

  // ── 1. Read ONLY the columns we need (NO hero_data) ───────────
  //
  // We need hp to check if dead or already full,
  // max_hp to know the heal target,
  // gold to check if the player can afford it.
  const { data: hero, error: heroErr } = await sqlOne(
    `SELECT hp, max_hp, gold FROM hero_stats WHERE player_id = $1`,
    [userId]
  );

  if (heroErr || !hero) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  // ── 2. Server-side validation ─────────────────────────────────
  //
  // These checks run BEFORE the UPDATE query. They're fast-fail
  // guards that give descriptive error messages to the client.
  // The UPDATE below has its own WHERE guards as a second layer.
  if (hero.hp <= 0) {
    return NextResponse.json(
      { error: 'You are dead. Use Revive instead.' },
      { status: 400 }
    );
  }

  if (hero.hp >= hero.max_hp) {
    return NextResponse.json(
      { error: 'Already at full health.' },
      { status: 400 }
    );
  }

  if (hero.gold < HEAL_COST) {
    return NextResponse.json(
      { error: `Need ${HEAL_COST} gold to heal.` },
      { status: 400 }
    );
  }

  // ── 3. Atomic UPDATE with server-side guards ──────────────────
  //
  // SET hp = max_hp        → Heal to full in one expression.
  //     gold = gold - $1   → Deduct cost using SQL arithmetic.
  //                          This is atomic: two concurrent requests
  //                          both decrement from the row's CURRENT
  //                          value, never a stale JS variable.
  //
  // WHERE player_id = $2
  //   AND gold >= $1       → Second layer: if a concurrent request
  //                          already spent the gold, this WHERE
  //                          fails and RETURNING returns nothing.
  //   AND hp < max_hp      → Prevents double-heal edge case.
  //
  // RETURNING hp, max_hp, gold → Returns the NEW values after the
  //   UPDATE, so we can send them to the client without a second query.
  const { data: updated, error: updateErr } = await sqlOne(
    `UPDATE hero_stats
     SET hp = max_hp,
         gold = gold - $1,
         updated_at = NOW()
     WHERE player_id = $2
       AND gold >= $1
       AND hp < max_hp
     RETURNING hp, max_hp, gold`,
    [HEAL_COST, userId]
  );

  if (updateErr) throw updateErr;

  // If RETURNING gave us nothing, the WHERE conditions failed.
  // This means a concurrent request already changed the state.
  if (!updated) {
    return NextResponse.json(
      { error: 'Heal failed — state changed. Refresh and try again.' },
      { status: 409 }
    );
  }

  // ── 4. Return ONLY the fields the client needs ────────────────
  //
  // OLD: { ...heroRow.hero_data, ...updated } — leaked the entire blob
  // NEW: Explicit field list. The client knows exactly what to expect.
  return NextResponse.json({
    success: true,
    cost: HEAL_COST,
    updatedHero: {
      hp: updated.hp,
      maxHp: updated.max_hp,   // camelCase to match PlayerContext field
      gold: updated.gold,
    },
  });
}


// ── Export: rate-limited at 10 heals per minute ─────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'heal',
  idempotency: false, // Healing is naturally idempotent (hp = max_hp is stable)
});
