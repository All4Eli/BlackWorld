import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { transaction, sqlOne } from '@/lib/db/pool';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'You must be logged in.' }, { status: 401 });
  }

  try {
    const { targetId, goldAmount } = await request.json();

    if (!targetId || !goldAmount || isNaN(goldAmount) || goldAmount <= 0) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Invalid target or gold amount.' }, { status: 400 });
    }
    
    if (targetId === userId) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Cannot place a bounty on yourself.' }, { status: 400 });
    }

    const { data: targetPlayer } = await sqlOne(
      `SELECT clerk_user_id FROM players WHERE clerk_user_id = $1`,
      [targetId]
    );

    if (!targetPlayer) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Target player not found.' }, { status: 404 });
    }

    const { data: result, error } = await transaction(async (client) => {
      // Deduct gold
      const res = await client.query(
        `UPDATE hero_stats SET gold = gold - $1, updated_at = now() WHERE player_id = $2 AND gold >= $1 RETURNING gold`,
        [goldAmount, userId]
      );

      if (res.rowCount === 0) {
        throw new Error('Insufficient gold');
      }

      // Insert bounty
      const bountyRes = await client.query(
        `INSERT INTO player_bounties (target_id, setter_id, gold_amount, status) VALUES ($1, $2, $3, 'ACTIVE') RETURNING id`,
        [targetId, userId, goldAmount]
      );
      
      return bountyRes.rows[0];
    });

    if (error) {
      if (error.message === 'Insufficient gold') {
        return NextResponse.json({ error: 'BAD_REQUEST', message: 'Insufficient gold.' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, bountyId: result.id });
  } catch (err) {
    console.error('[POST /api/bounties/place]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}
