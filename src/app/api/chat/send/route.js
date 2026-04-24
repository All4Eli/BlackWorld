// ═══════════════════════════════════════════════════════════════════
// POST /api/chat/send — Broadcast Global Server Chat
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne } from '@/lib/db/pool';

/**
 * POST /api/chat/send
 * 
 * Body: { message: "string" }
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Message is required.' }, { status: 400 });
    }

    // 1. Sanitize text by stripping tags
    const sanitized = message.replace(/<[^>]*>?/gm, '').trim();
    if (sanitized.length === 0) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Message cannot be empty.' }, { status: 400 });
    }
    // Cap length to prevent DB bloat
    const cappedMessage = sanitized.slice(0, 200);

    // 2. Fetch authenticated username securely (Ignoring any client-spoofed name)
    const { data: user } = await sqlOne(
        `SELECT username FROM players WHERE clerk_user_id = $1`,
        [userId]
    );

    if (!user) {
        return NextResponse.json({ error: 'NOT_FOUND', message: 'Player record not found.' }, { status: 404 });
    }

    // 3. Insert securely into the PostgreSQL layer. Supabase Realtime will broadcast the INSERT automatically.
    const { data: chatRow, error } = await sqlOne(
        `INSERT INTO global_chat (player_id, username, message, channel) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [userId, user.username, cappedMessage, 'global']
    );

    if (error) throw error;

    return NextResponse.json({ success: true, delivered: true });

  } catch (err) {
    console.error('[POST /api/chat/send]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Chat system offline.' },
      { status: 500 }
    );
  }
}

// ── Rate Limit ──
// Use the 'chat' throttle bucket to enforce strict anti-spam
export const POST = withMiddleware(handlePost, {
  rateLimit: 'chat',
  idempotency: false // Idempotency is not required for chat messages as duplicate sends are fine just rate limited
});
