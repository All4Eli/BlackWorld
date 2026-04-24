import { Players } from '@/lib/dal';
import { createSessionToken } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { scryptSync, timingSafeEqual } from 'crypto';

function verifyPassword(storedHash, inputPassword) {
  const [salt, hash] = storedHash.split(':');
  const inputHash = scryptSync(inputPassword, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(inputHash, 'hex'));
}

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    // Look up the user by email using DAL
    const { data: player, error: lookupError } = await Players.getByEmail(email);

    if (!player || lookupError) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (!player.password_hash) {
      return NextResponse.json({ error: 'This account was created via an external provider. Password login is not available.' }, { status: 401 });
    }

    // Verify password with timing-safe comparison
    const valid = verifyPassword(player.password_hash, password);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Update last login
    await Players.updateLastLogin(player.clerk_user_id);

    // Mint session
    const token = await createSessionToken(player.clerk_user_id);
    const response = NextResponse.json({ success: true });

    response.cookies.set('__bw_sess', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return response;
  } catch (err) {
    console.error('[LOGIN CRASH]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

