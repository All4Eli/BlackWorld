// ═══════════════════════════════════════════════════════════════════
// /api/shop/premium — Blood Stone Premium Shop
// ═══════════════════════════════════════════════════════════════════
//
// PREMIUM CURRENCY ARCHITECTURE:
//
//   Blood Stones are BlackWorld's premium currency. They are earned
//   through daily logins, seasonal rewards, and (eventually) real
//   money purchases via Stripe. They are spent in this shop.
//
//   WHY STRICT TRANSACTIONS?
//     Premium currency is the most abuse-sensitive system in any
//     game. A bug here means:
//       • Players duplicate premium items (infinite value)
//       • Players lose paid currency (refund liability)
//       • Double-charges create support tickets and chargebacks
//
//   DEFENSE LAYERS:
//     1. FOR UPDATE row lock on hero_stats → prevents concurrent
//        purchases from seeing the same balance
//     2. Idempotency tokens → network retries return the cached
//        result instead of re-executing the transaction
//     3. blood_stone_transactions audit log → every deduction is
//        recorded with the exact balance_after, creating a tamper-
//        evident chain
//     4. WHERE blood_stones >= $cost guard → even inside the
//        transaction, the UPDATE has a server-side check
//
// ── GET vs POST ────────────────────────────────────────────────
//
//   GET  → Fetch the shop catalog + player's current balance
//          (no auth via middleware — uses manual auth for the GET)
//   POST → Execute a purchase (idempotent, rate-limited)
//
// ── CATALOG SOURCE ─────────────────────────────────────────────
//
//   The authoritative catalog is the PREMIUM_CATALOG object in
//   @/lib/db/dal/premium.js, which is derived from BS_SHOP_ITEMS
//   in @/lib/packs.js. We do NOT query the premium_store DB table
//   for in-game BS purchases — that table is for real-money Stripe
//   products (blood stone packs, bundles, etc.).
//
//   The BS_SHOP_ITEMS are items you spend blood stones ON.
//   The premium_store rows are products you spend dollars ON.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { auth } from '@/lib/auth';
import { sqlOne } from '@/lib/db/pool';
import { BS_SHOP_ITEMS } from '@/lib/packs';
import { purchasePremiumItem, getBloodStoneInfo } from '@/lib/db/dal/premium';


/**
 * GET /api/shop/premium — Fetch the premium shop catalog + balance
 *
 * Returns:
 *   { bloodStones, gold, catalog, donator, donatorExpires, subscriptionActive }
 *
 * No middleware wrapping on GET (read-only, no rate limit needed).
 * We use manual auth() instead because withMiddleware expects POST bodies.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Fetch player balance ──────────────────────────────────
    //
    // COALESCE(blood_stones, 0): if the column is NULL (legacy
    // player who predates the blood_stones column), treat as 0.
    const { data: hero } = await sqlOne(
      `SELECT COALESCE(blood_stones, 0) AS blood_stones,
              COALESCE(gold, 0) AS gold
       FROM hero_stats WHERE player_id = $1`,
      [userId]
    );

    // ── Build catalog from server-side BS_SHOP_ITEMS ──────────
    //
    // BS_SHOP_ITEMS is the authoritative list of items purchasable
    // with Blood Stones. Each has: key, name, cost, desc, category.
    // We do NOT query premium_store for this — that table holds
    // real-money products (Stripe checkout items).
    const catalog = BS_SHOP_ITEMS.map(item => ({
      key: item.key,
      name: item.name,
      price_stones: item.cost,
      description: item.desc,
      category: item.category,
    }));

    // ── Fetch donator/subscription info (graceful fallback) ───
    //
    // These columns may not exist yet on all deployments.
    // Use a try/catch to gracefully degrade.
    let donator = false;
    let donatorExpires = null;
    let subscriptionActive = false;
    try {
      const info = await getBloodStoneInfo(userId);
      donator = info.donator;
      donatorExpires = info.donatorExpires;
      subscriptionActive = info.subscriptionActive;
    } catch {
      // Columns may not exist yet — degrade gracefully
    }

    return NextResponse.json({
      bloodStones: hero?.blood_stones ?? 0,
      gold: hero?.gold ?? 0,
      catalog,
      donator,
      donatorExpires,
      subscriptionActive,
    });
  } catch (err) {
    console.error('[GET /api/shop/premium]', err);
    return NextResponse.json(
      { bloodStones: 0, gold: 0, catalog: [] },
      { status: 200 }
    );
  }
}


/**
 * POST /api/shop/premium — Purchase a premium item with Blood Stones
 *
 * Request body: { itemKey: "protection_scroll" }
 *
 * This function is wrapped by withMiddleware which:
 *   1. Verifies the JWT → extracts userId
 *   2. Checks rate limits (action: 'premium', 5 req/min)
 *   3. Enforces idempotency (same X-Idempotency-Key returns
 *      the cached result instead of re-executing)
 *
 * PURCHASE FLOW:
 *   1. Validate itemKey against server-side PREMIUM_CATALOG
 *   2. Lock hero_stats row with FOR UPDATE (prevents concurrent buys)
 *   3. Verify blood_stones >= cost
 *   4. Deduct blood_stones atomically
 *   5. Grant the purchased effect (item, buff, stat reset, etc.)
 *   6. Log to blood_stone_transactions for audit trail
 *
 * RACE CONDITION PREVENTION:
 *   If a player fires 10 requests to buy a 50-BS item with 50 BS:
 *     Request 1: Locks row, reads 50, deducts → 0, commits
 *     Request 2-10: Lock row, read 0, throw "Insufficient" → rejected
 *   Exactly ONE purchase succeeds. The other 9 fail atomically.
 *
 * @param {Request} request
 * @param {{ userId: string }} ctx — injected by middleware
 */
async function handlePost(request, { userId }) {
  const body = await request.json();
  const { itemKey } = body;

  // ── Input validation ──────────────────────────────────────────
  //
  // typeof itemKey !== 'string': ensures the client sent a string,
  // not a number, object, or null.
  if (!itemKey || typeof itemKey !== 'string') {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'itemKey (string) is required.' },
      { status: 400 }
    );
  }

  // ── Delegate to the Premium DAL ────────────────────────────────
  //
  // purchasePremiumItem() in @/lib/db/dal/premium.js handles:
  //   1. Catalog lookup (PREMIUM_CATALOG — built from BS_SHOP_ITEMS)
  //   2. FOR UPDATE row lock on hero_stats
  //   3. Balance verification
  //   4. Atomic deduction
  //   5. Effect granting (scrolls, buffs, stat resets, cosmetics)
  //   6. Audit trail logging to blood_stone_transactions
  //
  // It returns { data: { success, message, newBalance }, error }
  const { data, error } = await purchasePremiumItem(userId, itemKey);

  // ── Handle transaction errors ───────────────────────────────
  if (error) {
    const msg = error.message;
    if (msg.includes('Invalid premium item')) {
      return NextResponse.json({ error: 'NOT_FOUND', message: msg }, { status: 404 });
    }
    if (msg.includes('Insufficient') || msg.includes('insufficient')) {
      return NextResponse.json({ error: 'INSUFFICIENT_FUNDS', message: msg }, { status: 400 });
    }
    if (msg.includes('not found') || msg.includes('Hero not found')) {
      return NextResponse.json({ error: 'NOT_FOUND', message: msg }, { status: 404 });
    }
    if (msg.includes('Maximum')) {
      return NextResponse.json({ error: 'LIMIT_REACHED', message: msg }, { status: 400 });
    }
    console.error('[PREMIUM SHOP ERROR]', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'A critical error occurred.' },
      { status: 500 }
    );
  }

  // ── Return success payload ──────────────────────────────────
  //
  // data = { success, message, newBalance }
  //
  // The frontend (BloodStoneShop.jsx) reads:
  //   data.success → show success message
  //   data.purchasedItem → display name in success toast
  //   data.newBalance → updateHero({ bloodStones: data.newBalance })
  return NextResponse.json({
    success: true,
    purchasedItem: data.message,
    newBalance: data.newBalance,
    cost: BS_SHOP_ITEMS.find(i => i.key === itemKey)?.cost || 0,
  });
}


// ── Export: rate-limited + idempotent ────────────────────────────
//
// 'premium' rate limit = 5 req/min (prevents rapid purchase spam).
//
// Idempotency is THE most critical flag on this route:
//   If the player clicks "Buy" and their network drops, the browser
//   retries with the same X-Idempotency-Key header. Without
//   idempotency, the second request would execute a second purchase,
//   double-charging the player.
//
//   With idempotency enabled, the middleware checks:
//     1. Has this key been seen before?
//     2. If yes → return the cached response (no DB queries)
//     3. If no → execute the handler, cache the response
export const POST = withMiddleware(handlePost, {
  rateLimit: 'premium',
  idempotency: true,
});
