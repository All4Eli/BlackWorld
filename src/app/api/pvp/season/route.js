import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql, sqlOne } from '@/lib/dal';

// GET /api/pvp/season — get current season info + player seasonal stats
export async function GET(req) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get or create current season
    let { data: season } = await sqlOne(
      `SELECT * FROM pvp_seasons WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );

    if (!season) {
      // Auto-create Season 1
      const { data: newSeason } = await sqlOne(
        `INSERT INTO pvp_seasons (season_number, name, is_active, starts_at, ends_at, rewards)
         VALUES (1, 'Season of Blood', true, NOW(), NOW() + interval '30 days',
                 '{"gold": 5000, "blood_stones": 100, "title": "Blood Champion"}')
         RETURNING *`
      );
      season = newSeason;
    }

    // Get player's seasonal stats
    let { data: seasonStats } = await sqlOne(
      `SELECT * FROM pvp_season_stats WHERE player_id = $1 AND season_id = $2`,
      [userId, season?.id]
    );

    if (!seasonStats && season) {
      const { data: newStats } = await sqlOne(
        `INSERT INTO pvp_season_stats (player_id, season_id)
         VALUES ($1, $2)
         ON CONFLICT (player_id, season_id) DO NOTHING
         RETURNING *`,
        [userId, season.id]
      );
      seasonStats = newStats || { wins: 0, losses: 0, elo: 1000, rank_tier: 'Bronze', peak_elo: 1000 };
    }

    // Get top 20 players for season leaderboard
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

    // Calculate time remaining
    const endsAt = season?.ends_at ? new Date(season.ends_at) : null;
    const timeRemaining = endsAt ? Math.max(0, endsAt.getTime() - Date.now()) : 0;
    const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      season: {
        ...season,
        daysRemaining,
      },
      myStats: seasonStats || { wins: 0, losses: 0, elo: 1000, rank_tier: 'Bronze' },
      rankings: rankings || [],
    });
  } catch (err) {
    console.error('[PVP SEASON ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
