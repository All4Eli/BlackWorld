// ═══════════════════════════════════════════════════════════════════
// POST /api/player/allocate — Spend unspent attribute points
// ═══════════════════════════════════════════════════════════════════
// Client sends intent: { str: 1, vit: 2 }
// Server validates available points and applies atomically.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as HeroDal from '@/lib/db/dal/hero';

/**
 * POST /api/player/allocate
 *
 * Body: { str?: number, def?: number, dex?: number, int?: number, vit?: number }
 *
 * Each field is the number of points to add to that stat.
 * Total must be <= hero_stats.unspent_points.
 *
 * Uses HeroDal.allocatePoints which locks the row with FOR UPDATE
 * to prevent concurrent allocations from doubling points.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { str, def, dex, int: intStat, vit } = body;

    const allocation = {};
    if (str) allocation.str = str;
    if (def) allocation.def = def;
    if (dex) allocation.dex = dex;
    if (intStat) allocation.int = intStat;
    if (vit) allocation.vit = vit;

    const totalPoints = Object.values(allocation).reduce((sum, v) => sum + v, 0);
    if (totalPoints <= 0) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'At least one stat point must be allocated.' },
        { status: 400 }
      );
    }

    const { data, error } = await HeroDal.allocatePoints(userId, allocation);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('Not enough points')) status = 403;
      if (msg.includes('negative')) status = 400;

      return NextResponse.json({ error: 'ALLOCATE_FAILED', message: msg }, { status });
    }

    return NextResponse.json({
      success: true,
      stats: {
        str: data.str,
        def: data.def,
        dex: data.dex,
        int: data.int,
        vit: data.vit,
        unspentPoints: data.unspent_points,
      },
    });
  } catch (err) {
    console.error('[POST /api/player/allocate]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'combat',
});
