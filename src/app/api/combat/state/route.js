// ═══════════════════════════════════════════════════════════════════
// GET /api/combat/state — Fetch active combat session
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';

async function handleGet(request, { userId }) {
  try {
    const { data: session } = await sqlOne(
      `SELECT * FROM combat_sessions WHERE player_id = $1`,
      [userId]
    );

    if (!session) {
      return NextResponse.json({ active: false });
    }

    // Fetch the static monster data for display
    const { data: monster } = await sqlOne(
      `SELECT * FROM monsters WHERE id = $1`,
      [session.monster_id]
    );

    return NextResponse.json({
      active: true,
      session,
      monster
    });

  } catch (err) {
    console.error('[GET /api/combat/state]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}

export const GET = withMiddleware(handleGet);
