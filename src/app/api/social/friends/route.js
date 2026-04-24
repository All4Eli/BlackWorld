import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql, sqlOne } from '@/lib/dal';

// GET /api/social/friends — list friends + pending requests
export async function GET(req) {
  try {
    const userId = await auth(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get accepted friends
    const { data: friends } = await sql(
      `SELECT f.*, p.username, h.level, h.gold,
              CASE WHEN f.player_id = $1 THEN f.friend_id ELSE f.player_id END as friend_user_id
       FROM friends f
       JOIN players p ON (CASE WHEN f.player_id = $1 THEN f.friend_id ELSE f.player_id END) = p.clerk_user_id
       JOIN hero_stats h ON p.clerk_user_id = h.player_id
       WHERE (f.player_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
       ORDER BY p.username`,
      [userId]
    );

    // Get pending requests (incoming)
    const { data: incoming } = await sql(
      `SELECT f.*, p.username, h.level
       FROM friends f
       JOIN players p ON f.player_id = p.clerk_user_id
       JOIN hero_stats h ON f.player_id = h.player_id
       WHERE f.friend_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    // Get sent requests
    const { data: outgoing } = await sql(
      `SELECT f.*, p.username, h.level
       FROM friends f
       JOIN players p ON f.friend_id = p.clerk_user_id
       JOIN hero_stats h ON f.friend_id = h.player_id
       WHERE f.player_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    return NextResponse.json({ friends: friends || [], incoming: incoming || [], outgoing: outgoing || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/social/friends — send/accept/decline/remove
export async function POST(req) {
  try {
    const userId = await auth(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, targetUsername, targetId } = await req.json();

    switch (action) {
      case 'send': {
        if (!targetUsername) return NextResponse.json({ error: 'Username required' }, { status: 400 });

        const { data: target } = await sqlOne(
          'SELECT clerk_user_id FROM players WHERE username = $1 AND deleted_at IS NULL',
          [targetUsername]
        );
        if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
        if (target.clerk_user_id === userId) return NextResponse.json({ error: 'Cannot add yourself' }, { status: 400 });

        // Check if already friends or pending
        const { data: existing } = await sqlOne(
          `SELECT * FROM friends
           WHERE (player_id = $1 AND friend_id = $2) OR (player_id = $2 AND friend_id = $1)`,
          [userId, target.clerk_user_id]
        );
        if (existing) {
          if (existing.status === 'accepted') return NextResponse.json({ error: 'Already friends' }, { status: 400 });
          if (existing.status === 'pending') return NextResponse.json({ error: 'Request already pending' }, { status: 400 });
          if (existing.status === 'blocked') return NextResponse.json({ error: 'Cannot send request' }, { status: 400 });
        }

        await sqlOne(
          'INSERT INTO friends (player_id, friend_id) VALUES ($1, $2) RETURNING *',
          [userId, target.clerk_user_id]
        );

        // Notify them
        await sql(
          `INSERT INTO notifications (player_id, type, message, metadata)
           VALUES ($1, 'friend_request', $2, $3)`,
          [target.clerk_user_id, 'You received a friend request!', JSON.stringify({ from: userId })]
        );

        return NextResponse.json({ success: true, message: `Friend request sent to ${targetUsername}` });
      }

      case 'accept': {
        if (!targetId) return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
        const { data: updated } = await sqlOne(
          `UPDATE friends SET status = 'accepted' WHERE player_id = $2 AND friend_id = $1 AND status = 'pending' RETURNING *`,
          [userId, targetId]
        );
        if (!updated) return NextResponse.json({ error: 'No pending request found' }, { status: 404 });
        return NextResponse.json({ success: true, message: 'Friend request accepted!' });
      }

      case 'decline': {
        if (!targetId) return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
        await sql('DELETE FROM friends WHERE player_id = $2 AND friend_id = $1 AND status = \'pending\'', [userId, targetId]);
        return NextResponse.json({ success: true, message: 'Friend request declined' });
      }

      case 'remove': {
        if (!targetId) return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
        await sql(
          'DELETE FROM friends WHERE (player_id = $1 AND friend_id = $2) OR (player_id = $2 AND friend_id = $1)',
          [userId, targetId]
        );
        return NextResponse.json({ success: true, message: 'Friend removed' });
      }

      case 'block': {
        if (!targetId) return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
        await sql(
          `INSERT INTO friends (player_id, friend_id, status) VALUES ($1, $2, 'blocked')
           ON CONFLICT (player_id, friend_id) DO UPDATE SET status = 'blocked'`,
          [userId, targetId]
        );
        return NextResponse.json({ success: true, message: 'Player blocked' });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
