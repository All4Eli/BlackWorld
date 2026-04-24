// ═══════════════════════════════════════════════════════════════════
// POST /api/covens/create — Establish a new Guild
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as CovensDal from '@/lib/db/dal/covens';

/**
 * POST /api/covens/create
 * 
 * Body: { name: "Bloodletters", tag: "BLD", description: "PvP focused" }
 * Minimum creation cost is deducted safely inside the DAL.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { name, tag, description } = body;

    // Fast-fail validations
    if (!name || name.length < 2 || name.length > 32) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Name must be between 2 and 32 characters.' }, { status: 400 });
    }
    if (!tag || tag.length < 2 || tag.length > 4) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Tag must be between 2 and 4 characters.' }, { status: 400 });
    }

    const { data: newCoven, error } = await CovensDal.createCoven(userId, name, tag, description);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('Insufficient gold')) status = 403;
      if (msg.includes('already in a Coven')) status = 409;

      return NextResponse.json({ error: 'CREATION_FAILED', message: msg }, { status });
    }

    return NextResponse.json({
      success: true,
      coven: {
        id: newCoven.id,
        name: newCoven.name,
        tag: newCoven.tag,
        level: newCoven.level,
        treasury: newCoven.treasury
      }
    });

  } catch (err) {
    console.error('[POST /api/covens/create]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to create coven.' },
      { status: 500 }
    );
  }
}

// ── Rate Limit ──
export const POST = withMiddleware(handlePost, {
  rateLimit: 'quest', // A standard throttle mapped to limit frequent heavy actions
  idempotency: true,  // Prevent accidental 10,000 gold charges if user double-clicks!
});
