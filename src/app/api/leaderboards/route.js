// ═══════════════════════════════════════════════════════════════════
// GET /api/leaderboards — Fetch Top 100 Players
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getLevelLeaderboard, getWealthLeaderboard, getPvPLeaderboard } from '@/lib/db/dal/leaderboards';

/**
 * GET /api/leaderboards?type=level
 * 
 * Fetches the requested leaderboard type.
 * Pulls from materialized views for near-zero latency reads.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'level';

    let result;

    switch (type) {
      case 'wealth':
        result = await getWealthLeaderboard();
        break;
      case 'pvp':
        result = await getPvPLeaderboard();
        break;
      case 'level':
      default:
        result = await getLevelLeaderboard();
        break;
    }

    if (result.error) throw result.error;

    return NextResponse.json({
      success: true,
      type,
      // The materialized views format the data into easy-to-read JSON shapes.
      leaderboard: result.data || []
    });

  } catch (err) {
    console.error('[GET /api/leaderboards]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch leaderboard.' },
      { status: 500 }
    );
  }
}
