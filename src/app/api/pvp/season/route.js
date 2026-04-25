// ═══════════════════════════════════════════════════════════════════
// GET /api/pvp/season — Fetch current season info + player stats
// ═══════════════════════════════════════════════════════════════════
//
// This route was already clean (no hero_data mutations).
// The refactor wraps it with withMiddleware and replaces the
// legacy DAL import path with the normalized pool imports.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne } from '@/lib/db/pool';


/**
 * @param {Request} req
 * @param {{ userId: string }} ctx — injected by withMiddleware after JWT auth
 */
async function handleGet(req, { userId }) {
  try {
    // ── 1. Get or create current season ───────────────────────
    //
    // sqlOne() is a convenience wrapper that returns a single row
    // instead of an array. It calls sql() internally and returns
    // data[0] (the first row) or null if no rows matched.
    //
    // ORDER BY created_at DESC → get the MOST RECENT active season.
    // LIMIT 1 → we only want one row (the current season).
    let { data: season } = await sqlOne(
      `SELECT * FROM pvp_seasons WHERE is_active = true
       ORDER BY created_at DESC LIMIT 1`
    );

    // If no season exists, auto-create Season 1.
    // This is a development convenience — in production, seasons
    // would be created by an admin or cron job.
    if (!season) {
      const { data: newSeason } = await sqlOne(
        `INSERT INTO pvp_seasons
           (season_number, name, is_active, starts_at, ends_at, rewards)
         VALUES
           (1, 'Season of Blood', true, NOW(), NOW() + interval '30 days',
            '{"gold": 5000, "blood_stones": 100, "title": "Blood Champion"}')
         RETURNING *`
      );
      season = newSeason;
    }

    // ── 2. Get player's seasonal stats ────────────────────────
    //
    // ON CONFLICT DO NOTHING: if the row already exists (the player
    // has previously been in this season), the INSERT silently does
    // nothing and RETURNING returns null. That's fine — we then
    // query the existing row below.
    let { data: seasonStats } = await sqlOne(
      `SELECT * FROM pvp_season_stats
       WHERE player_id = $1 AND season_id = $2`,
      [userId, season?.id]
    );

    if (!seasonStats && season) {
      // Create a fresh seasonal stats row for this player
      const { data: newStats } = await sqlOne(
        `INSERT INTO pvp_season_stats (player_id, season_id)
         VALUES ($1, $2)
         ON CONFLICT (player_id, season_id) DO NOTHING
         RETURNING *`,
        [userId, season.id]
      );
      seasonStats = newStats || {
        wins: 0, losses: 0, elo: 1000,
        rank_tier: 'Bronze', peak_elo: 1000,
      };
    }

    // ── 3. Fetch season leaderboard (top 20) ──────────────────
    //
    // This query JOINs three tables:
    //   pvp_season_stats (ss) → players (p) → hero_stats (h)
    //
    // ORDER BY ss.elo DESC: highest Elo players appear first.
    // LIMIT 20: cap the response size for frontend performance.
    const { data: rankings } = await sql(
      `SELECT ss.*, p.username, h.level
       FROM pvp_season_stats ss
       JOIN players p ON ss.player_id = p.clerk_user_id
       JOIN hero_stats h ON ss.player_id = h.player_id
       WHERE ss.season_id = $1
       ORDER BY ss.elo DESC
       LIMIT 20`,
      [season?.id]
    );

    // ── 4. Calculate time remaining ───────────────────────────
    //
    // new Date(season.ends_at) converts the PostgreSQL timestamp
    // into a JS Date object.
    // .getTime() returns milliseconds since Unix epoch.
    // Math.max(0, ...) prevents negative values (season ended).
    // Math.floor(ms / 86400000) converts ms to days.
    const endsAt = season?.ends_at ? new Date(season.ends_at) : null;
    const timeRemaining = endsAt ? Math.max(0, endsAt.getTime() - Date.now()) : 0;
    const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      season: { ...season, daysRemaining },
      myStats: seasonStats || {
        wins: 0, losses: 0, elo: 1000, rank_tier: 'Bronze',
      },
      rankings: rankings || [],
    });
  } catch (err) {
    console.error('[PVP SEASON ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


// GET — auth only, no rate limit (read-only leaderboard query)
export const GET = withMiddleware(handleGet, {
  rateLimit: null,
  idempotency: false,
});
