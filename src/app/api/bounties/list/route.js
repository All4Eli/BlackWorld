import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/pool';

export async function GET() {
  try {
    const { data: bounties, error } = await sql(
      `SELECT pb.id, pb.gold_amount, pb.status, pb.created_at, pb.target_id, pb.setter_id,
              tp.username AS target_name, sp.username AS setter_name
       FROM player_bounties pb
       JOIN players tp ON pb.target_id = tp.clerk_user_id
       JOIN players sp ON pb.setter_id = sp.clerk_user_id
       WHERE pb.status = 'ACTIVE'
       ORDER BY pb.gold_amount DESC, pb.created_at DESC`
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({ bounties: bounties || [] });
  } catch (err) {
    console.error('[GET /api/bounties/list]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}
