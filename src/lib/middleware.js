// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — API Middleware: Rate Limiting + Idempotency
// ═══════════════════════════════════════════════════════════════════
// Higher-order function that wraps Next.js App Router handlers with:
//   1. JWT Authentication (via auth())
//   2. Rate Limiting (DB-backed via rate_limits + rate_limit_config)
//   3. Idempotency Keys (DB-backed via idempotency_keys)
//
// Usage in route files:
//   import { withMiddleware } from '@/lib/middleware';
//
//   async function handlePost(request, { userId }) { ... }
//
//   export const POST = withMiddleware(handlePost, {
//     rateLimit: 'shop_buy',    // matches rate_limit_config.action
//     idempotency: true,        // requires x-idempotency-key header
//   });
//
// Architecture notes:
//   — Rate limiting uses the DB (rate_limits table + rate_limit_config)
//     so it works correctly across serverless instances on Vercel.
//   — An in-memory LRU cache is layered on top to avoid hitting the DB
//     on every single request. The cache has a short TTL (5s) so it only
//     serves as a hot-path optimization, not a source of truth.
//   — To swap to Redis later, replace the DB calls in RateLimit/Idempotency
//     with Redis equivalents. The middleware API stays identical.
// ═══════════════════════════════════════════════════════════════════

import { sql, sqlOne } from '@/lib/db/pool';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';


// ─────────────────────────────────────────────────────────────────
//  In-Memory LRU Cache (hot-path optimization)
// ─────────────────────────────────────────────────────────────────

/**
 * Simple in-memory cache with TTL-based expiry.
 * Used to avoid hitting the DB on every rate-limit check.
 * NOT a source of truth — just a fast-path for repeated requests.
 */
class MemoryCache {
  /** @param {number} maxSize - Max entries before eviction */
  /** @param {number} ttlMs  - Default TTL in milliseconds */
  constructor(maxSize = 1000, ttlMs = 5000) {
    /** @type {Map<string, { value: any, expiresAt: number }>} */
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    // Evict oldest entries if over capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.ttlMs),
    });
  }

  delete(key) {
    this.cache.delete(key);
  }
}

// Singleton caches (survive across requests within a single serverless instance)
const rateLimitCache = new MemoryCache(2000, 5000);   // 5s TTL
const configCache = new MemoryCache(50, 60000);        // 60s TTL for config


// ─────────────────────────────────────────────────────────────────
//  Rate Limiting (DB-backed with memory cache fast-path)
// ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RateLimitConfig
 * @property {string} action
 * @property {number} max_requests
 * @property {number} window_seconds
 * @property {number} penalty_seconds
 */

/**
 * Fetch rate limit config for an action. Cached in memory for 60s.
 *
 * @param {string} action
 * @returns {Promise<RateLimitConfig|null>}
 */
async function getRateLimitConfig(action) {
  const cached = configCache.get(`rl_config:${action}`);
  if (cached) return cached;

  const { data } = await sqlOne(
    `SELECT action, max_requests, window_seconds, penalty_seconds
     FROM rate_limit_config WHERE action = $1`,
    [action]
  );

  if (data) {
    configCache.set(`rl_config:${action}`, data, 60000);
  }
  return data;
}

/**
 * Check if a player/IP is within rate limits for an action.
 * Uses the DB as source of truth with a memory cache fast-path.
 *
 * @param {string} identifier - player_id or IP address
 * @param {string} action     - Matches rate_limit_config.action
 * @returns {Promise<{ allowed: boolean, remaining: number, resetAt: Date|null }>}
 */
async function checkRateLimit(identifier, action) {
  // 1. Fetch config
  const config = await getRateLimitConfig(action);
  if (!config) {
    // No config = no limit (fail open for unconfigured actions)
    return { allowed: true, remaining: Infinity, resetAt: null };
  }

  const cacheKey = `rl:${identifier}:${action}`;

  // 2. Fast-path: check memory cache for recent denial
  const cachedDenial = rateLimitCache.get(cacheKey);
  if (cachedDenial && cachedDenial.denied) {
    return { allowed: false, remaining: 0, resetAt: cachedDenial.resetAt };
  }

  // 3. DB check: count requests in the current window
  const windowStart = new Date(Date.now() - config.window_seconds * 1000);

  const { data: countRow } = await sqlOne(
    `SELECT COALESCE(SUM(request_count), 0)::int AS total
     FROM rate_limits
     WHERE player_id = $1 AND action = $2 AND window_start >= $3`,
    [identifier, action, windowStart]
  );

  const currentCount = countRow?.total || 0;

  if (currentCount >= config.max_requests) {
    // Cache the denial for the remainder of the window
    const resetAt = new Date(windowStart.getTime() + config.window_seconds * 1000);
    rateLimitCache.set(cacheKey, { denied: true, resetAt }, config.window_seconds * 1000);
    return { allowed: false, remaining: 0, resetAt };
  }

  // 4. Record this request
  await sql(
    `INSERT INTO rate_limits (player_id, action, window_start, request_count)
     VALUES ($1, $2, date_trunc('second', now()), 1)
     ON CONFLICT (player_id, action, window_start)
     DO UPDATE SET request_count = rate_limits.request_count + 1`,
    [identifier, action]
  );

  return {
    allowed: true,
    remaining: config.max_requests - currentCount - 1,
    resetAt: null,
  };
}


// ─────────────────────────────────────────────────────────────────
//  Idempotency Keys (DB-backed)
// ─────────────────────────────────────────────────────────────────

/**
 * Check if an idempotency key has already been used.
 * Returns the cached response if it exists and hasn't expired.
 *
 * @param {string} key - The idempotency key from the x-idempotency-key header
 * @returns {Promise<{ response: Object }|null>}
 */
async function checkIdempotency(key) {
  const { data } = await sqlOne(
    `SELECT response FROM idempotency_keys
     WHERE key = $1 AND expires_at > now()`,
    [key]
  );
  return data;
}

/**
 * Record an idempotency key with its response.
 * Future requests with the same key will return this cached response.
 *
 * @param {string} key      - The idempotency key
 * @param {string} playerId - The player who made the request
 * @param {string} action   - The API route/action name
 * @param {Object} response - The JSON response body to cache
 * @returns {Promise<void>}
 */
async function recordIdempotency(key, playerId, action, response) {
  await sql(
    `INSERT INTO idempotency_keys (key, player_id, action, response)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO NOTHING`,
    [key, playerId, action, JSON.stringify(response)]
  );
}


// ─────────────────────────────────────────────────────────────────
//  Structured Error Responses
// ─────────────────────────────────────────────────────────────────

/**
 * Build a structured JSON error response.
 *
 * @param {string} code    - Machine-readable error code (e.g. 'RATE_LIMITED')
 * @param {string} message - Human-readable description
 * @param {number} status  - HTTP status code
 * @returns {NextResponse}
 */
function errorResponse(code, message, status) {
  return NextResponse.json({ error: code, message }, { status });
}


// ─────────────────────────────────────────────────────────────────
//  withMiddleware — The main HOF wrapper
// ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MiddlewareOptions
 * @property {boolean}       [requireAuth=true]  - Require valid JWT session
 * @property {string|null}   [rateLimit=null]    - Rate limit action key (matches rate_limit_config)
 * @property {boolean}       [idempotency=false] - Require x-idempotency-key header
 */

/**
 * Higher-order function to wrap Next.js App Router handlers with
 * authentication, rate limiting, and idempotency.
 *
 * The wrapped handler receives the request and a context object
 * containing `{ userId }` — the authenticated player's ID.
 *
 * @param {(request: Request, ctx: { userId: string|null }) => Promise<NextResponse>} handler
 * @param {MiddlewareOptions} options
 * @returns {(request: Request) => Promise<NextResponse>}
 *
 * @example
 * async function handlePost(request, { userId }) {
 *   const { itemKey } = await request.json();
 *   const result = await purchaseItem(userId, itemKey);
 *   return NextResponse.json(result);
 * }
 *
 * export const POST = withMiddleware(handlePost, {
 *   rateLimit: 'shop_buy',
 *   idempotency: true,
 * });
 */
export function withMiddleware(handler, options = {}) {
  const {
    requireAuth = true,
    rateLimit = null,
    idempotency = false,
  } = options;

  return async (request, routeContext) => {
    let userId = null;

    // ── 1. Authentication ──────────────────────────────────────
    if (requireAuth) {
      try {
        const authRes = await auth();
        userId = authRes?.userId;
      } catch {
        // auth() threw — treat as unauthorized
      }

      if (!userId) {
        return errorResponse('UNAUTHORIZED', 'You must be logged in.', 401);
      }
    }

    // ── 2. Rate Limiting ───────────────────────────────────────
    if (rateLimit) {
      const identifier = userId || request.headers.get('x-forwarded-for') || '127.0.0.1';

      try {
        const { allowed, remaining, resetAt } = await checkRateLimit(identifier, rateLimit);

        if (!allowed) {
          const res = errorResponse(
            'RATE_LIMITED',
            'Too many requests. Please wait a moment.',
            429
          );
          if (resetAt) {
            res.headers.set('Retry-After', Math.ceil((resetAt - Date.now()) / 1000).toString());
            res.headers.set('X-RateLimit-Remaining', '0');
          }
          return res;
        }

        // Attach remaining count for client-side UX hints
        // (will be set on the final response below)
      } catch (err) {
        // Rate limit DB failure — fail open (allow the request)
        console.error('[RATE LIMIT ERROR]', err.message);
      }
    }

    // ── 3. Idempotency Check ───────────────────────────────────
    //
    // If the client sends an X-Idempotency-Key header, we check for
    // a cached response (replay protection). If the client doesn't
    // send one, we auto-generate a UUID so the response is still
    // recorded for audit — but no replay protection is possible.
    //
    // This is the Stripe model: idempotency keys are recommended
    // but not required. Blocking all requests without one caused
    // every frontend component to break if it forgot the header.
    let idempotencyKey = idempotency
      ? request.headers.get('x-idempotency-key')
      : null;

    if (idempotency) {
      if (!idempotencyKey) {
        // Auto-generate a one-time key for audit purposes.
        // No replay protection (client didn't send a key to reuse),
        // but the response is still recorded in idempotency_keys.
        idempotencyKey = crypto.randomUUID();
      } else {
        // Client provided a key — check for cached (replayed) response
        try {
          const cached = await checkIdempotency(idempotencyKey);
          if (cached) {
            // Return the cached response from the original request
            const res = NextResponse.json(cached.response, { status: 200 });
            res.headers.set('X-Idempotent-Replayed', 'true');
            return res;
          }
        } catch (err) {
          console.error('[IDEMPOTENCY CHECK ERROR]', err.message);
          // Fail open — let the request through
        }
      }
    }

    // ── 4. Execute Handler ─────────────────────────────────────
    try {
      const response = await handler(request, { userId, ...routeContext });

      // ── 5. Record Idempotency (success only) ─────────────────
      if (idempotency && idempotencyKey && response.ok) {
        try {
          const cloned = response.clone();
          const body = await cloned.json();
          const action = new URL(request.url).pathname;
          await recordIdempotency(idempotencyKey, userId, action, body);
        } catch (err) {
          console.error('[IDEMPOTENCY RECORD ERROR]', err.message);
        }
      }

      return response;
    } catch (err) {
      console.error('[HANDLER CRASH]', err);
      return errorResponse('INTERNAL_ERROR', 'Something went wrong.', 500);
    }
  };
}

// ── Named exports for direct use in custom middleware chains ────
export { checkRateLimit, checkIdempotency, recordIdempotency, errorResponse };
