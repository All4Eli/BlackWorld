import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as LairsDal from '@/lib/db/dal/lairs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { data: lair, error } = await LairsDal.getPlayerLair(userId);
  if (error) return NextResponse.json({ error: 'INTERNAL_ERROR', message: error.message }, { status: 500 });

  const { data: types } = await LairsDal.getLairTypes();

  return NextResponse.json({ lair: lair || null, types });
}
