// ═══════════════════════════════════════════════════════════════════
// POST /api/pvp/toggle — Toggle PvP flag on/off
// ═══════════════════════════════════════════════════════════════════
//
// JSONB ERADICATION:
//
//   OLD CODE:
//     1. Called Composite.getFullPlayer(userId) → got hero_data blob
//     2. Response spread: { ...(composite.stats?.hero_data || {}) }
//     3. The toggle was a simple upsert into pvp_stats, but the
//        response payload contained the ENTIRE hero_data blob
//
//   NEW CODE:
//     1. UPSERT into pvp_stats (same as before — this was fine)
//     2. Response returns ONLY { success, flag } — no hero_data
//     3. No Composite.getFullPlayer call at all
//
// SQL — INSERT ... ON CONFLICT DO UPDATE (UPSERT):
//
//   This is PostgreSQL's way of saying "insert if new, update if exists":
//
//   INSERT INTO pvp_stats (player_id, is_active) VALUES ($1, $2)
//   ON CONFLICT (player_id) DO UPDATE SET is_active = EXCLUDED.is_active
//
//   Breakdown:
//     INSERT INTO ... VALUES ($1, $2)
//       → Try to insert a new row with player_id and is_active
//     ON CONFLICT (player_id)
//       → If a row with this player_id ALREADY EXISTS (violating
//         the UNIQUE constraint on player_id)...
//     DO UPDATE SET is_active = EXCLUDED.is_active
//       → ...then UPDATE the existing row instead.
//
//   EXCLUDED refers to the row that WOULD have been inserted.
//   So EXCLUDED.is_active = the $2 value we passed in.
//   This is cleaner than doing a SELECT-then-INSERT/UPDATE.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql } from '@/lib/db/pool';


/**
 * @param {Request} request
 * @param {{ userId: string }} ctx — injected by withMiddleware after JWT auth
 */
async function handlePost(request, { userId }) {
  const { flag } = await request.json();

  // ── Validate input ──────────────────────────────────────────
  //
  // typeof flag !== 'boolean' ensures the client sent exactly
  // true or false, not a string "true" or the number 1.
  // This prevents type coercion bugs where "true" evaluates
  // differently than true in different contexts.
  if (typeof flag !== 'boolean') {
    return NextResponse.json(
      { error: 'flag must be a boolean (true/false).' },
      { status: 400 }
    );
  }

  // ── UPSERT the PvP flag ─────────────────────────────────────
  const { error: upsertError } = await sql(
    `INSERT INTO pvp_stats (player_id, is_active)
     VALUES ($1, $2)
     ON CONFLICT (player_id) DO UPDATE SET is_active = EXCLUDED.is_active`,
    [userId, flag]
  );

  if (upsertError) {
    console.error('[PVP TOGGLE]', upsertError);
    return NextResponse.json({ error: 'Failed to toggle PvP.' }, { status: 500 });
  }

  // ── Response — returns updatedHero with pvp_flag for context merge ──
  //
  // ArenaHub calls updateHero(data.updatedHero) after toggling.
  // We return the minimal updatedHero object so PlayerContext stays in sync.
  return NextResponse.json({
    success: true,
    pvp_flag: flag,
    updatedHero: { pvp_flag: flag },
  });
}


// POST — auth enforced, no rate limit (toggle is infrequent)
export const POST = withMiddleware(handlePost, {
  rateLimit: null,
  idempotency: false,
});
