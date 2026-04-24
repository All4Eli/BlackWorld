import { Players, Composite } from '@/lib/dal';
import { createSessionToken } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { scryptSync, randomBytes } from 'crypto';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export async function POST(req) {
  try {
    const { email, password, username } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json({ error: 'Email, password, and username are required.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    // Check if email already exists
    const { data: existing, error: verificationError } = await Players.getByEmail(email);

    if (verificationError) {
      console.error('[VERIFICATION ERROR]', verificationError);
      return NextResponse.json({ error: 'Database verification failed: ' + verificationError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    // Generate a unique internal user ID (replaces clerk_user_id)
    const userId = `user_${randomUUID().replace(/-/g, '')}`;
    const passwordHash = hashPassword(password);

    // Insert the new player safely across identity & hero tables
    const { error: insertError } = await Composite.registerPlayer(userId, email, passwordHash, username);

    if (insertError) {
      console.error('[REGISTER ERROR]', insertError);
      return NextResponse.json({ error: 'Failed to create account: ' + (insertError.message || JSON.stringify(insertError)) }, { status: 500 });
    }

    // Mint session
    const token = await createSessionToken(userId);
    const response = NextResponse.json({ success: true, userId });

    response.cookies.set('__bw_sess', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return response;
  } catch (err) {
    console.error('[REGISTER CRASH]', err);
    return NextResponse.json({ error: 'Internal server error: ' + err.message + ' | Stack: ' + err.stack.split('\n')[0] }, { status: 500 });
  }
}

