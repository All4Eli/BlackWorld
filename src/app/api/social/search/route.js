import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/pool';

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const { data, error } = await sql(
    `SELECT p.clerk_user_id, p.username, h.level
     FROM players p
     LEFT JOIN hero_stats h ON p.clerk_user_id = h.player_id
     WHERE p.username ILIKE $1 AND p.deleted_at IS NULL
     LIMIT 10`,
    [`%${q}%`]
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ results: data || [] });
}
