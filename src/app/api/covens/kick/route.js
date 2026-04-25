// ═══════════════════════════════════════════════════════════════════
// POST /api/covens/kick — Remove a member from your Coven
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';

async function handlePost(request, { userId }) {
  const { targetUserId } = await request.json();

  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing target player ID.' }, { status: 400 });
  }

  // 1. Fetch initiator's coven membership
  const { data: myMembership } = await sqlOne(
    `SELECT cm.coven_id, cm.role, c.leader_id
     FROM coven_members cm
     JOIN covens c ON c.id = cm.coven_id
     WHERE cm.player_id = $1`,
    [userId]
  );

  if (!myMembership) {
    return NextResponse.json({ error: 'You are not in a coven.' }, { status: 403 });
  }

  const isLeader = myMembership.role === 'leader' || myMembership.leader_id === userId;
  const isOfficer = myMembership.role === 'officer';

  if (!isLeader && !isOfficer) {
    return NextResponse.json({ error: 'Insufficient permissions to kick members.' }, { status: 403 });
  }

  // 2. Fetch target's membership
  const { data: targetMembership } = await sqlOne(
    `SELECT coven_id, role FROM coven_members WHERE player_id = $1 AND coven_id = $2`,
    [targetUserId, myMembership.coven_id]
  );

  if (!targetMembership) {
    return NextResponse.json({ error: 'Target member is not in your coven.' }, { status: 404 });
  }

  // 3. Prevent kicking the leader
  if (targetUserId === myMembership.leader_id) {
    return NextResponse.json({ error: 'Cannot kick the Coven leader.' }, { status: 403 });
  }

  // 4. Officers cannot kick other Officers
  if (!isLeader && targetMembership.role === 'officer') {
    return NextResponse.json({ error: 'Only the Leader can kick Officers.' }, { status: 403 });
  }

  // 5. Remove member
  await sqlOne(
    `DELETE FROM coven_members WHERE coven_id = $1 AND player_id = $2 RETURNING player_id`,
    [myMembership.coven_id, targetUserId]
  );

  return NextResponse.json({ success: true, message: 'Member exiled successfully.' });
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true,
});
