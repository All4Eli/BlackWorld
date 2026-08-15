// ═══════════════════════════════════════════════════════════════════
// Gym API Route Handler — GET & POST /api/gym
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import {
  getGymTrainings,
  trainGym,
  tickPlayerResources,
  checkJailStatus
} from '@/lib/db/dal/expansion';

async function handleGet(request, { userId }) {
  try {
    const { data: hero } = await tickPlayerResources(userId);
    const { data: trainings, error: err } = await getGymTrainings();

    if (err) {
      return NextResponse.json({ error: 'Failed to fetch gym trainings' }, { status: 500 });
    }

    const jailStatus = checkJailStatus(hero);

    return NextResponse.json({
      success: true,
      trainings: trainings || [],
      energy: hero?.energy ?? 100,
      max_energy: hero?.max_energy ?? 100,
      stats: {
        str: hero?.str ?? 10,
        def: hero?.def ?? 10,
        spd: hero?.spd ?? 10,
        dex: hero?.dex ?? 10
      },
      jail_status: jailStatus
    });
  } catch (err) {
    console.error('[GET /api/gym]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handlePost(request, { userId }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { trainingId, statType } = body || {};

    if (!trainingId && !statType) {
      return NextResponse.json({ error: 'Either trainingId or statType is required' }, { status: 400 });
    }

    const result = await trainGym(userId, { trainingId, statType });

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
    console.error('[POST /api/gym]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withMiddleware(handleGet, { requireAuth: true });
export const POST = withMiddleware(handlePost, { requireAuth: true, rateLimit: 'gym' });
