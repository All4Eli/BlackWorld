// ═══════════════════════════════════════════════════════════════════
// /api/covens — GET list + POST create (legacy route, still active)
// ═══════════════════════════════════════════════════════════════════
//
// NOTE: /api/covens/create also exists as a separate route using
// CovensDal. This legacy route is still consumed by CovenView.jsx
// for the "Found a Coven" flow. Both routes must work correctly.
//
// FIXES:
//   1. Removed WHERE deleted_at IS NULL (column doesn't exist).
//   2. POST now uses a transaction for atomic gold-check + deduct.
//   3. Wrapped with withMiddleware for auth + rate limiting.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne, transaction } from '@/lib/db/pool';


// ── GET: List all covens (public directory) ─────────────────────
async function handleGet() {
  const { data, error } = await sql(`
    SELECT c.id, c.name, c.tag, c.description, c.leader_id,
           (SELECT COUNT(*) FROM coven_members cm WHERE cm.coven_id = c.id) as member_count
    FROM covens c
    ORDER BY member_count DESC
    LIMIT 50
  `);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ covens: data || [] });
}


// ── POST: Found a new coven (1000g cost) ────────────────────────
async function handlePost(request, { userId }) {
  const { name, tag, description } = await request.json();

  // Fast validations
  if (!name || name.length < 3 || name.length > 32) {
    return NextResponse.json({ error: 'Name must be 3-32 characters.' }, { status: 400 });
  }
  if (!tag || tag.length < 2 || tag.length > 5) {
    return NextResponse.json({ error: 'Tag must be 2-5 characters.' }, { status: 400 });
  }

  const { data: result, error: txErr } = await transaction(async (client) => {
    // 1. Lock hero_stats to atomically check + deduct gold
    const { rows: heroRows } = await client.query(
      `SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`, [userId]
    );
    if (heroRows.length === 0) throw new Error('Player not found.');
    if (heroRows[0].gold < 1000) throw new Error('Not enough gold.');

    // 2. Check not already in a coven
    const { rows: existingMember } = await client.query(
      `SELECT coven_id FROM coven_members WHERE player_id = $1`, [userId]
    );
    if (existingMember.length > 0) throw new Error('You are already in a Coven.');

    // 3. Create the coven
    const { rows: covenRows } = await client.query(
      `INSERT INTO covens (name, tag, leader_id, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, tag.toUpperCase(), userId, description || '']
    );
    const newCoven = covenRows[0];

    // 4. Add leader as member
    await client.query(
      `INSERT INTO coven_members (coven_id, player_id, role) VALUES ($1, $2, 'leader')`,
      [newCoven.id, userId]
    );

    // 5. Deduct gold
    const { rows: updatedHero } = await client.query(
      `UPDATE hero_stats SET gold = gold - 1000 WHERE player_id = $1 RETURNING gold`,
      [userId]
    );

    return {
      coven: newCoven,
      updatedHero: {
        gold: updatedHero[0].gold,
        coven: {
          id: newCoven.id,
          name: newCoven.name,
          tag: newCoven.tag,
          role: 'leader',
        },
      },
    };
  });

  if (txErr) {
    const msg = txErr.message;
    if (msg.includes('unique') || msg.includes('23505')) {
      return NextResponse.json({ error: 'A Coven with that name or tag already exists.' }, { status: 400 });
    }
    const status = msg.includes('Not enough') ? 400
                 : msg.includes('already') ? 409
                 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({
    coven: result.coven,
    updatedHero: result.updatedHero,
  });
}


// ── Exports ─────────────────────────────────────────────────────
// GET is public (coven directory listing)
// POST is auth'd + rate limited + idempotent (expensive action)
export const GET  = withMiddleware(handleGet,  { rateLimit: null });
export const POST = withMiddleware(handlePost, { rateLimit: 'quest', idempotency: true });
