import { Players, Composite } from '@/lib/dal';
import { createSessionToken } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'crypto';

const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export async function POST(req) {
  try {
    const { token, mode } = await req.json();

    if (!token) {
      return NextResponse.json({ error: 'Google token is required.' }, { status: 400 });
    }

    // Verify the Google token
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      return NextResponse.json({ error: 'Invalid Google token.' }, { status: 401 });
    }

    const { email, sub: googleId, name, given_name } = payload;

    // Check if player exists
    let { data: player, error: lookupError } = await Players.getByEmail(email);

    if (mode === 'register') {
      if (player) {
         return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 });
      }

      // Generate a clerk_user_id equivalent to remain compatible with legacy DAL
      const clerkUserId = `user_${randomUUID().replace(/-/g, '')}`;
      
      // Use given name or default if null
      const username = given_name || name || email.split('@')[0];

      // Password hash is null because they use OAuth
      const createRes = await Composite.registerPlayer(clerkUserId, email, null, username);
      if (!createRes || createRes.error) {
        return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 });
      }
      player = createRes; // Composite.registerPlayer returns the player row directly or has {error}

    } else {
      // Login mode
      if (!player) {
         return NextResponse.json({ error: 'Account not found. Please sign up first.' }, { status: 404 });
      }
    }

    // Update last login
    await Players.updateLastLogin(player.clerk_user_id);

    // Mint session
    const sessionToken = await createSessionToken(player.clerk_user_id);
    const response = NextResponse.json({ success: true });

    response.cookies.set('__bw_sess', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return response;
  } catch (err) {
    console.error('[GOOGLE AUTH CRASH]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
