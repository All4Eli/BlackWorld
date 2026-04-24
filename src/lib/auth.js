import { cookies } from 'next/headers';
import * as jose from 'jose';

// In production, this MUST be a strong secret.
const JWT_SECRET = process.env.JWT_SECRET || 'blackworld_super_secret_dev_key_only';
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

/**
 * Mocks the Clerk auth() function exactly.
 * Reads the HTTPOnly '__bw_sess' cookie natively and decrypts it.
 * @returns {Promise<{userId: string | null}>}
 */
export async function auth() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('__bw_sess')?.value;

        if (!token) {
            return { userId: null };
        }

        const { payload } = await jose.jwtVerify(token, encodedSecret);
        
        return { userId: payload.userId };
    } catch (err) {
        console.error('[AUTH ERROR]', err.message);
        return { userId: null };
    }
}

/**
 * Creates a signed JWT natively.
 */
export async function createSessionToken(userId) {
    const jwt = await new jose.SignJWT({ userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(encodedSecret);
    return jwt;
}
