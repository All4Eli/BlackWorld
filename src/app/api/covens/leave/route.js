// ═══════════════════════════════════════════════════════════════════
// POST /api/covens/leave — Leave your current Coven
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';

async function handlePost(request, { userId }) {
  // 1. Fetch player's current coven membership
  const { data: membership } = await sqlOne(
    `SELECT cm.coven_id, cm.role, c.leader_id
     FROM coven_members cm
     JOIN covens c ON c.id = cm.coven_id
     WHERE cm.player_id = $1`,
    [userId]
  );

  if (!membership) {
    return NextResponse.json({ error: 'Not in a coven.' }, { status: 400 });
  }

  // Leaders cannot leave without transferring leadership
  if (membership.role === 'leader' || membership.leader_id === userId) {
    return NextResponse.json(
      { error: 'Leaders cannot leave. Disband or transfer leadership first.' },
      { status: 400 }
    );
  }

  // 2. Remove member
  await sqlOne(
    `DELETE FROM coven_members WHERE coven_id = $1 AND player_id = $2 RETURNING coven_id`,
    [membership.coven_id, userId]
  );

  return NextResponse.json({
    success: true,
    updatedHero: { coven: null },
  });
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true,
});
