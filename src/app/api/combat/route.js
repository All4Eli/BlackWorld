// ═══════════════════════════════════════════════════════════════════
// Combat Main API Route Handler — POST /api/combat
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';
import { checkJailStatus } from '@/lib/db/dal/expansion';

async function handlePost(request, { userId }) {
  try {
    const { data: hero } = await sqlOne(`SELECT jail_until, jail_reason FROM hero_stats WHERE player_id = $1`, [userId]);
    const jailStatus = checkJailStatus(hero);
    if (jailStatus.in_jail) {
      return NextResponse.json({
        error: 'You are currently in the Dungeon (Jail)!',
        code: 'IN_DUNGEON',
        jail_until: hero.jail_until,
        jail_reason: hero.jail_reason,
        remaining_seconds: jailStatus.remaining_seconds
      }, { status: 403 });
    }

    return NextResponse.json({ success: true, message: 'Combat system active' }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/combat]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withMiddleware(handlePost, { requireAuth: true });
