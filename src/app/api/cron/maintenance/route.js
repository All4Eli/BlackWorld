// ═══════════════════════════════════════════════════════════════════
// GET /api/cron/maintenance — Automated server maintenance
// ═══════════════════════════════════════════════════════════════════
//
// PURPOSE:
//   This endpoint is called by Vercel Cron on a schedule (configured
//   in vercel.json). It runs three maintenance tasks:
//     1. refresh_leaderboards() — recalculates PvP rank tiers
//     2. expire_old_auctions()  — returns expired auction items
//     3. cleanup_expired_buffs()— deletes stale combat sessions
//
// SECURITY:
//   This route must NEVER be callable by regular users. It bypasses
//   normal auth (no JWT required) and instead verifies a shared
//   secret in the Authorization header.
//
//   On Vercel, cron jobs send:
//     Authorization: Bearer <CRON_SECRET>
//
//   The CRON_SECRET is stored as an environment variable in Vercel's
//   dashboard. It is a random string that only Vercel's cron
//   scheduler and our code know.
//
// WHY NOT withMiddleware?
//   withMiddleware enforces JWT auth (player sessions). Cron jobs
//   aren't players — they have no JWT. Instead, we use a simple
//   Bearer token comparison. This is the standard Vercel cron pattern.
//
// ─── HOW VERCEL CRON WORKS ──────────────────────────────────────
//
//   In vercel.json, you define:
//     {
//       "crons": [{
//         "path": "/api/cron/maintenance",
//         "schedule": "0 * * * *"    ← runs every hour at minute 0
//       }]
//     }
//
//   Vercel's scheduler makes a GET request to this route at the
//   specified cron schedule, automatically including the
//   Authorization header with the project's CRON_SECRET.
//
//   In development, you can test with:
//     curl -H "Authorization: Bearer <your-secret>" http://localhost:3000/api/cron/maintenance
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/pool';


export async function GET(request) {
  // ── STEP 1: Verify the cron secret ────────────────────────────
  //
  // request.headers.get('authorization') reads the HTTP header.
  // Headers are case-insensitive in HTTP, but the Web API
  // normalizes them to lowercase.
  //
  // The value looks like: "Bearer abc123secret"
  // We split on space and take the second element [1] to get
  // just the token, ignoring the "Bearer" prefix.
  //
  // JAVASCRIPT DETAIL — Optional chaining (?.):
  //   If request.headers.get('authorization') returns null,
  //   the ?. prevents calling .split() on null (which would throw).
  //   Instead, authToken becomes undefined, and the comparison
  //   below fails safely.
  const authHeader = request.headers.get('authorization');
  const authToken = authHeader?.split(' ')?.[1];

  // process.env.CRON_SECRET is set in Vercel's environment variables.
  // It's a random string like "whsk_cron_9f8a7b6c5d4e3f2a".
  // If it's not set, we reject ALL requests (fail-closed).
  //
  // SECURITY — Fail Closed:
  //   If CRON_SECRET is undefined (forgot to set it), the comparison
  //   undefined !== undefined is false... but we also check that
  //   CRON_SECRET is truthy. So if it's missing, we reject.
  if (!process.env.CRON_SECRET || authToken !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — invalid cron secret.' },
      { status: 401 }
    );
  }

  // ── STEP 2: Run maintenance tasks sequentially ────────────────
  //
  // We wrap each task in try/catch so a failure in one doesn't
  // prevent the others from running. Server maintenance should be
  // as resilient as possible.
  //
  // Each stored procedure was created in the migration:
  //   create_premium_store_and_maintenance_procs
  const results = {
    leaderboards: null,
    expiredAuctions: null,
    cleanedBuffs: null,
    errors: [],
  };

  // ── Task 1: Refresh leaderboard rank tiers ────────────────────
  //
  // refresh_leaderboards() recalculates pvp_stats.rank_tier
  // for every player based on their current elo_rating.
  // It uses IS DISTINCT FROM to skip rows that haven't changed,
  // minimizing write amplification.
  //
  // SELECT refresh_leaderboards():
  //   In PostgreSQL, you call a VOID function with SELECT.
  //   It returns a single row with a null value (since VOID).
  //   We don't need the return value — just the side effects.
  try {
    await sql(`SELECT refresh_leaderboards()`);
    results.leaderboards = 'ok';
  } catch (err) {
    results.leaderboards = 'failed';
    results.errors.push(`leaderboards: ${err.message}`);
    console.error('[CRON] refresh_leaderboards failed:', err.message);
  }

  // ── Task 2: Expire old auctions ───────────────────────────────
  //
  // expire_old_auctions() does two things:
  //   1. Unlocks inventory items (is_locked = false) for expired listings
  //   2. Sets listing status to 'expired'
  //   Returns the count of expired listings.
  //
  // SELECT expire_old_auctions() returns a single row like:
  //   { expire_old_auctions: 3 }
  // The [0] gets the first (only) row from the result array.
  try {
    const { data: expireResult } = await sql(`SELECT expire_old_auctions()`);
    // expireResult is an array of rows. The function returns
    // an INTEGER, so the result looks like:
    //   [{ expire_old_auctions: 5 }]
    // We extract the count from the first row.
    results.expiredAuctions = expireResult?.[0]?.expire_old_auctions ?? 0;
  } catch (err) {
    results.expiredAuctions = 'failed';
    results.errors.push(`auctions: ${err.message}`);
    console.error('[CRON] expire_old_auctions failed:', err.message);
  }

  // ── Task 3: Cleanup expired buffs / stale combat sessions ─────
  //
  // cleanup_expired_buffs() deletes combat_sessions rows that
  // are older than 24 hours. These represent abandoned fights.
  // Returns the count of deleted sessions.
  try {
    const { data: cleanResult } = await sql(`SELECT cleanup_expired_buffs()`);
    results.cleanedBuffs = cleanResult?.[0]?.cleanup_expired_buffs ?? 0;
  } catch (err) {
    results.cleanedBuffs = 'failed';
    results.errors.push(`buffs: ${err.message}`);
    console.error('[CRON] cleanup_expired_buffs failed:', err.message);
  }

  // ── STEP 3: Return results ────────────────────────────────────
  //
  // Vercel cron doesn't read the response body, but logging it
  // helps with debugging via Vercel's function logs dashboard.
  const allOk = results.errors.length === 0;

  console.log(
    `[CRON MAINTENANCE] leaderboards=${results.leaderboards} ` +
    `auctions=${results.expiredAuctions} buffs=${results.cleanedBuffs}`
  );

  return NextResponse.json({
    success: allOk,
    timestamp: new Date().toISOString(),
    ...results,
  }, { status: allOk ? 200 : 207 });
  // 207 Multi-Status: some tasks succeeded, some failed.
  // This is an HTTP standard for partial success.
}
