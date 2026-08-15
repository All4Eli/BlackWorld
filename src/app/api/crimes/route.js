// ═══════════════════════════════════════════════════════════════════
// Crimes API Route Handler — GET & POST /api/crimes
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import {
  getCrimes,
  commitCrime,
  tickPlayerResources,
  checkJailStatus
} from '@/lib/db/dal/expansion';

async function handleGet(request, { userId }) {
  try {
    const { data: hero } = await tickPlayerResources(userId);
    const { data: crimes, error: crimesErr } = await getCrimes();

    if (crimesErr) {
      return NextResponse.json({ error: 'Failed to fetch crimes list' }, { status: 500 });
    }

    const jailStatus = checkJailStatus(hero);

    return NextResponse.json({
      success: true,
      crimes: crimes || [],
      nerve: hero?.nerve ?? 10,
      max_nerve: hero?.max_nerve ?? 10,
      jail_status: jailStatus
    });
  } catch (err) {
    console.error('[GET /api/crimes]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { crimeId } = body || {};

    if (!crimeId) {
      return NextResponse.json({ error: 'crimeId is required' }, { status: 400 });
    }

    const result = await commitCrime(userId, crimeId);

    if (result.error) {
      const status = result.status || 400;
      if (result.error.code === 'IN_DUNGEON') {
        return NextResponse.json(
          {
            error: 'You are currently in the Dungeon (Jail)!',
            code: 'IN_DUNGEON',
            jail_until: result.error.jail_until,
            jail_reason: result.error.jail_reason,
            remaining_seconds: result.error.remaining_seconds
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: result.error.message || result.error },
        { status }
      );
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err) {
    console.error('[POST /api/crimes]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withMiddleware(handleGet, { requireAuth: true });
export const POST = withMiddleware(handlePost, { requireAuth: true, rateLimit: 'crimes' });
