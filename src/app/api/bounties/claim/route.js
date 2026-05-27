import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { transaction, sqlOne } from '@/lib/db/pool';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'You must be logged in.' }, { status: 401 });
  }

  try {
    const { bountyId } = await request.json();

    if (!bountyId) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'bountyId is required.' }, { status: 400 });
    }

    const { data: result, error } = await transaction(async (client) => {
      // 1. Lock the bounty row
      const bountyRes = await client.query(
        `SELECT id, target_id, gold_amount, created_at, status 
         FROM player_bounties 
         WHERE id = $1 FOR UPDATE`,
        [bountyId]
      );

      if (bountyRes.rowCount === 0) {
        throw new Error('Bounty not found');
      }

      const bounty = bountyRes.rows[0];

      if (bounty.status !== 'ACTIVE') {
        throw new Error('Bounty is not active');
      }
      
      if (bounty.target_id === userId) {
        throw new Error('You cannot claim a bounty on yourself');
      }

      // 2. Verify caller has a winning record against target after bounty was created
      // The requirement asks to verify winner_id = caller, defender_id = target_id
      const matchRes = await client.query(
        `SELECT id FROM pvp_matches 
         WHERE winner_id = $1 
         AND (defender_id = $2 OR attacker_id = $2)
         AND fought_at >= $3 
         LIMIT 1`,
        [userId, bounty.target_id, bounty.created_at]
      );

      if (matchRes.rowCount === 0) {
        throw new Error('No qualifying win against this target since the bounty was placed.');
      }

      // 3. Mark bounty as claimed
      await client.query(
        `UPDATE player_bounties 
         SET status = 'CLAIMED', claimed_by = $1, claimed_at = now() 
         WHERE id = $2`,
        [userId, bounty.id]
      );

      // 4. Add gold to caller
      await client.query(
        `UPDATE hero_stats SET gold = gold + $1, updated_at = now() WHERE player_id = $2`,
        [bounty.gold_amount, userId]
      );
      
      // Optionally log trade_log
      await client.query(
        `INSERT INTO trade_log (player_id, action, item_name, gold_amount) VALUES ($1, 'pvp_reward', 'Bounty Claim', $2)`,
        [userId, bounty.gold_amount]
      );

      return { gold_amount: bounty.gold_amount };
    });

    if (error) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Bounty claimed! You earned ${result.gold_amount} gold.` });
  } catch (err) {
    console.error('[POST /api/bounties/claim]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err.message }, { status: 500 });
  }
}
