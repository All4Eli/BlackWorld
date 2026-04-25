// ═══════════════════════════════════════════════════════════════════
// POST /api/covens/join — Join an existing Coven
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne, transaction } from '@/lib/db/pool';

async function handlePost(request, { userId }) {
  const { covenId } = await request.json();

  if (!covenId) {
    return NextResponse.json({ error: 'Missing coven ID.' }, { status: 400 });
  }

  const { data: result, error: txErr } = await transaction(async (client) => {
    // 1. Check player isn't already in a coven
    const { rows: existing } = await client.query(
      `SELECT coven_id FROM coven_members WHERE player_id = $1`, [userId]
    );
    if (existing.length > 0) throw new Error('You are already in a Coven.');

    // 2. Lock coven row and check member limit
    const { rows: covenRows } = await client.query(
      `SELECT id, name, tag, max_members FROM covens WHERE id = $1 FOR UPDATE`, [covenId]
    );
    if (covenRows.length === 0) throw new Error('Coven not found.');
    const coven = covenRows[0];

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM coven_members WHERE coven_id = $1`, [covenId]
    );
    if (countRows[0].cnt >= coven.max_members) {
      throw new Error('Coven is full.');
    }

    // 3. Add member
    await client.query(
      `INSERT INTO coven_members (coven_id, player_id, role) VALUES ($1, $2, 'member')`,
      [covenId, userId]
    );

    return {
      coven: { id: coven.id, name: coven.name, tag: coven.tag, role: 'member' },
    };
  });

  if (txErr) {
    const msg = txErr.message;
    const status = msg.includes('already') ? 409
                 : msg.includes('not found') ? 404
                 : msg.includes('full') ? 400
                 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({
    success: true,
    coven: result.coven,
    updatedHero: { coven: result.coven },
  });
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest',
  idempotency: true,
});
