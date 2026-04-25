// ═══════════════════════════════════════════════════════════════════
// GET /api/pvp/stats — Fetch the player's PvP stats + opponent list
// ═══════════════════════════════════════════════════════════════════
//
// JSONB ERADICATION:
//   This route was already mostly clean — it JOINed hero_stats and
//   pvp_stats directly. The only change is wrapping it with
//   withMiddleware for auth enforcement and removing the manual
//   auth() call.
//
// NO RATE LIMIT on GET (read-only, cheap queries).
// Auth is still enforced by withMiddleware — the handler only runs
// after JWT verification succeeds.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql } from '@/lib/db/pool';
import * as HeroDal from '@/lib/db/dal/hero';


/**
 * @param {Request} req
 * @param {{ userId: string }} ctx — injected by withMiddleware after JWT auth
 */
async function handleGet(req, { userId }) {
  try {
    // ── 1. Fetch current player's PvP stats ───────────────────
    //
    // This query uses a single table (pvp_stats) with no JOINs.
    // COALESCE provides defaults for new players who don't yet
    // have a pvp_stats row (the LEFT JOIN in step 2 handles that
    // for opponents, but for the current player we query directly).
    //
    // If no row exists, `stats` will be null, and we return
    // a default object in the response.
    let stats = null;
    try {
      const { data } = await sql(
        `SELECT wins, losses, elo_rating, rank_tier, win_streak, best_streak, is_active
         FROM pvp_stats WHERE player_id = $1`,
        [userId]
      );
      // sql() returns an array of rows. We want the first (and only) one.
      // Map to the frontend field names for backward compat with ArenaHub.jsx
      const row = data?.[0];
      if (row) {
        stats = {
          arena_wins: row.wins,
          arena_losses: row.losses,
          elo_rating: row.elo_rating,
          rank_tier: row.rank_tier,
          win_streak: row.win_streak,
          best_streak: row.best_streak,
          is_active: row.is_active,
        };
      }
    } catch (_) { /* pvp_stats table may not exist */ }

    // ── 2. Fetch opponent list ────────────────────────────────
    //
    // This JOIN chain connects three tables:
    //   players (p) → hero_stats (h) → pvp_stats (ps)
    //
    // LEFT JOIN pvp_stats: we use LEFT JOIN (not INNER JOIN) because
    // some players may not have a pvp_stats row yet. LEFT JOIN
    // returns ALL rows from the left table (players) and NULL
    // for any unmatched right-side columns (pvp_stats).
    //
    // COALESCE(ps.elo_rating, 1000): replaces NULL with 1000
    // for players without a pvp_stats row.
    //
    // WHERE p.clerk_user_id != $1: excludes the current player
    // from the opponent list (can't duel yourself).
    const { data: allPlayers } = await sql(
      `SELECT
         p.clerk_user_id AS id,
         p.username,
         h.level,
         COALESCE(ps.elo_rating, 1000)   AS elo_rating,
         COALESCE(ps.rank_tier, 'bronze') AS rank_tier,
         COALESCE(ps.is_active, false)    AS pvp_flag
       FROM players p
       JOIN hero_stats h ON p.clerk_user_id = h.player_id
       LEFT JOIN pvp_stats ps ON p.clerk_user_id = ps.player_id
       WHERE p.clerk_user_id != $1
         AND h.hp > 0
       ORDER BY COALESCE(ps.is_active, false) DESC, COALESCE(ps.elo_rating, 1000) DESC
       LIMIT 20`,
      [userId]
    );

    // ── 3. Build response ─────────────────────────────────────
    //
    // Array.map() transforms each raw SQL row into the shape
    // the frontend expects. This is a pure data transformation —
    // no DB calls happen inside .map().
    //
    // Arrow function breakdown:
    //   p => ({ ... })
    //   The `p` parameter is one row from the allPlayers array.
    //   The parenthesized return ({ }) creates a new object.
    //   p.elo_rating comes from the COALESCE in the SQL query,
    //   so it's always a number (never null).
    return NextResponse.json({
      stats: stats || {
        arena_wins: 0, arena_losses: 0, elo_rating: 1000,
        win_streak: 0, best_streak: 0, is_active: false,
      },
      players: (allPlayers || []).map(p => ({
        id: p.id,
        username: p.username,
        level: p.level,
        pvp_flag: p.pvp_flag,
        pvp_stats: {
          elo_rating: p.elo_rating,
          rank_tier: p.rank_tier,
        },
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


// GET — auth only, no rate limit (read-only query)
export const GET = withMiddleware(handleGet, {
  rateLimit: null,
  idempotency: false,
});
