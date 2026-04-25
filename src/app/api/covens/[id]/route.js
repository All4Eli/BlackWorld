// ═══════════════════════════════════════════════════════════════════
// GET /api/covens/[id] — Fetch Coven details + roster
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne } from '@/lib/db/pool';

async function handleGet(request, { userId }) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  const id = segments[segments.length - 1];

  if (!id) return NextResponse.json({ error: 'Missing coven ID' }, { status: 400 });

  // 1. Fetch Coven data
  const { data: coven } = await sqlOne(
    `SELECT * FROM covens WHERE id = $1`, [id]
  );
  if (!coven) {
    return NextResponse.json({ error: 'Coven not found.' }, { status: 404 });
  }

  // 2. Fetch roster
  const { data: members } = await sql(
    `SELECT cm.player_id, cm.role, p.username, h.level
     FROM coven_members cm
     JOIN players p ON cm.player_id = p.clerk_user_id
     JOIN hero_stats h ON cm.player_id = h.player_id
     WHERE cm.coven_id = $1
     ORDER BY
       CASE cm.role WHEN 'leader' THEN 1 WHEN 'officer' THEN 2 ELSE 3 END,
       h.level DESC`,
    [id]
  );

  const roster = (members || []).map(m => ({
    clerk_user_id: m.player_id,
    username: m.username,
    level: m.level,
    coven_role: m.role,
  }));

  return NextResponse.json({ coven, roster });
}

export const GET = withMiddleware(handleGet, { rateLimit: null });
