import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as LairsDal from '@/lib/db/dal/lairs';
import * as HeroDal from '@/lib/db/dal/hero';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const { lairType, customName } = await request.json();
    if (!lairType) return NextResponse.json({ error: 'BAD_REQUEST', message: 'Missing lair type' }, { status: 400 });

    const { data: newLair, error } = await LairsDal.buyLairTransactional(userId, lairType, customName || null);
    if (error) {
      if (error.message === 'INVALID_LAIR_TYPE') return NextResponse.json({ error: 'BAD_REQUEST', message: 'Invalid lair type' }, { status: 400 });
      if (error.message === 'INSUFFICIENT_FUNDS') return NextResponse.json({ error: 'INSUFFICIENT_FUNDS', message: 'Not enough gold' }, { status: 400 });
      if (error.message === 'HERO_NOT_FOUND') return NextResponse.json({ error: 'NOT_FOUND', message: 'Hero not found' }, { status: 404 });
      throw error;
    }

    return NextResponse.json({ success: true, lair: newLair });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}
