// ═══════════════════════════════════════════════════════════════════
// POST /api/auction/buy — Purchase an active auction listing
// ═══════════════════════════════════════════════════════════════════
//
// JSONB ERADICATION — THE FULL STORY:
//
//   OLD CODE (race condition):
//     1. Read composite.stats.hero_data (a JSONB blob)
//     2. Push the purchased item into heroData.artifacts (a JS array)
//     3. UPDATE hero_stats SET hero_data = $1 (overwrite the entire blob)
//
//   WHY THIS BREAKS:
//     If Player A and Player B both buy items at the exact same moment:
//       • Both read hero_data = { artifacts: [sword] }
//       • A pushes shield → { artifacts: [sword, shield] }
//       • B pushes helm   → { artifacts: [sword, helm] }
//       • A writes first  → DB has [sword, shield]
//       • B writes second → DB has [sword, helm]  ← shield is GONE
//     This is a classic "lost update" race condition.
//
//   NEW CODE (no race condition):
//     Instead of splicing arrays in a JSONB blob, we transfer
//     ownership of the `inventory` row by UPDATE-ing its player_id.
//     Each inventory row is an independent SQL row with its own lock.
//     Two concurrent purchases on DIFFERENT items never conflict.
//     Two concurrent purchases on the SAME item are serialized by
//     FOR UPDATE row locking.
//
// ROW-LEVEL LOCKING (FOR UPDATE) EXPLAINED:
//
//   When we do: SELECT * FROM auction_listings WHERE id = $1 FOR UPDATE
//   PostgreSQL does the following:
//     1. Finds the row matching id = $1
//     2. Acquires an EXCLUSIVE ROW LOCK on that specific row
//     3. Any OTHER transaction that tries to SELECT ... FOR UPDATE
//        on the SAME row will BLOCK (wait) until our transaction
//        either COMMITs or ROLLBACKs.
//     4. Regular SELECTs (without FOR UPDATE) are NOT blocked —
//        they read the old version (MVCC snapshot isolation).
//
//   This means: if Player A and Player B both try to buy the same
//   auction at the same millisecond:
//     • A's transaction locks the auction row first
//     • B's transaction WAITS at the FOR UPDATE line
//     • A completes (sets status = 'sold'), COMMITs
//     • B's FOR UPDATE finally runs, but now status = 'sold'
//     • B's WHERE status = 'active' fails → 0 rows → 409 response
//
//   Result: exactly ONE player gets the item. No duplicates.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction } from '@/lib/db/pool';
import * as InventoryDal from '@/lib/db/dal/inventory';


async function handlePost(request, { userId }) {
  const { auctionId } = await request.json();

  if (!auctionId) {
    return NextResponse.json({ error: 'Missing auction ID.' }, { status: 400 });
  }

  // ── All steps inside a single transaction ─────────────────────
  //
  // transaction() from pool.js does:
  //   const client = await pool.connect();
  //   await client.query('BEGIN');
  //   ... your code ...
  //   await client.query('COMMIT');  // or ROLLBACK on error
  //   client.release();
  //
  // The `client` passed to our callback is a DEDICATED connection
  // from the pool. All queries on `client` within this callback
  // run in the SAME PostgreSQL transaction. This means:
  //   • They share the same snapshot of data
  //   • They share the same locks
  //   • They all succeed or all fail together (atomicity)
  const { data, error } = await transaction(async (client) => {

    // ── STEP 1: Lock and fetch the auction ──────────────────────
    //
    // FOR UPDATE acquires an exclusive row lock.
    // We also check status = 'active' AND expires_at >= NOW()
    // to ensure the auction hasn't been sold or expired.
    const { rows: auctionRows } = await client.query(
      `SELECT al.*, al.inventory_id
       FROM auction_listings al
       WHERE al.id = $1
         AND al.status = 'active'
         AND al.expires_at >= NOW()
       FOR UPDATE`,
      [auctionId]
    );

    if (auctionRows.length === 0) {
      throw new Error('Auction not found or no longer active.');
    }

    const auction = auctionRows[0];
    const price = auction.buyout_price || auction.price;

    // ── STEP 2: Prevent buying own auction ──────────────────────
    if (auction.seller_id === userId) {
      throw new Error('Cannot buy your own auction.');
    }

    // ── STEP 3: Lock buyer's hero_stats and check gold ──────────
    //
    // FOR UPDATE on hero_stats prevents two concurrent purchases
    // from both seeing "enough gold" and both succeeding.
    // Only one will proceed; the other will wait and then see
    // the decremented balance.
    const { rows: buyerRows } = await client.query(
      `SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [userId]
    );

    if (buyerRows.length === 0) throw new Error('Player not found.');

    const buyerGold = buyerRows[0].gold;
    if (buyerGold < price) {
      throw new Error(`Insufficient gold: have ${buyerGold}, need ${price}.`);
    }

    // ── STEP 4: Fetch Sovereign's Auction Tax Rate ──────────────
    //
    // The Sovereign (elected player) can set an auction_tax_modifier
    // via the Politics system. Base tax is 5%. The modifier scales it:
    //   modifier 1.0 = 5% tax (default)
    //   modifier 0.5 = 2.5% tax (Sovereign lowered it)
    //   modifier 1.5 = 7.5% tax (Sovereign raised it)
    //
    // Tax is deducted from the seller's payout, not added to the buyer.
    const { rows: taxRows } = await client.query(
      `SELECT value FROM server_config WHERE key = 'auction_tax_modifier'`
    );
    const taxModifier = taxRows.length > 0 ? parseFloat(taxRows[0].value) || 1.0 : 1.0;
    const taxRate = 0.05 * taxModifier;  // Base 5% * Sovereign modifier
    const taxAmount = Math.floor(price * taxRate);
    const sellerPayout = price - taxAmount;

    // ── STEP 5: Transfer ownership of the inventory row ─────────
    if (auction.inventory_id) {
      await client.query(
        `UPDATE inventory
         SET player_id = $1,
             is_locked = false,
             acquired_at = NOW()
         WHERE id = $2`,
        [userId, auction.inventory_id]
      );
    }

    // ── STEP 6: Deduct gold from buyer ──────────────────────────
    await client.query(
      `UPDATE hero_stats SET gold = gold - $1, updated_at = NOW()
       WHERE player_id = $2`,
      [price, userId]
    );

    // ── STEP 7: Credit gold to seller (net of tax) ──────────────
    //
    // The seller receives price minus the Sovereign's tax.
    // This ensures the tax is a true gold sink or Sovereign revenue.
    await client.query(
      `UPDATE hero_stats SET gold = gold + $1, updated_at = NOW()
       WHERE player_id = $2`,
      [sellerPayout, auction.seller_id]
    );

    // ── STEP 8: Mark auction as sold ────────────────────────────
    const { rows: updatedAuction } = await client.query(
      `UPDATE auction_listings
       SET status = 'sold', buyer_id = $1
       WHERE id = $2
       RETURNING *`,
      [userId, auctionId]
    );

    // ── STEP 9: Write to trade_log for audit trail ──────────────
    await client.query(
      `INSERT INTO trade_log (player_id, action, item_name, gold_amount, metadata)
       VALUES ($1, 'auction_buy', $2, $3, $4)`,
      [
        userId,
        auction.item_data?.name || 'Unknown',
        -price,
        JSON.stringify({ auction_id: auctionId, seller_id: auction.seller_id, tax: taxAmount }),
      ]
    );
    await client.query(
      `INSERT INTO trade_log (player_id, action, item_name, gold_amount, metadata)
       VALUES ($1, 'auction_sell', $2, $3, $4)`,
      [
        auction.seller_id,
        auction.item_data?.name || 'Unknown',
        sellerPayout,
        JSON.stringify({ auction_id: auctionId, buyer_id: userId, tax: taxAmount }),
      ]
    );

    // ── STEP 10: Fetch buyer's updated state for frontend ───────
    const { rows: updatedHero } = await client.query(
      `SELECT gold, hp, max_hp, level, bank_balance
       FROM hero_stats WHERE player_id = $1`,
      [userId]
    );
    const h = updatedHero[0];

    return {
      auction: updatedAuction[0],
      taxAmount,
      sellerPayout,
      updatedHero: {
        gold: h.gold,
        hp: h.hp,
        maxHp: h.max_hp,
        level: h.level,
        bankBalance: h.bank_balance,
      },
    };
  });

  if (error) {
    const msg = error.message;
    // Map known errors to appropriate HTTP status codes
    if (msg.includes('not found') || msg.includes('no longer active')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('own auction')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes('Insufficient gold')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch fresh inventory for the buyer so purchased item appears
  let inventory = [];
  if (!error) {
    const { data: invData } = await InventoryDal.getCharacterInventory(userId);
    inventory = invData || [];
  }

  return NextResponse.json({ success: true, ...data, inventory });
}


// ── Export: rate-limited + idempotent ────────────────────────────
//
// idempotency: true means the client MUST send an X-Idempotency-Key
// header. If the same key is sent twice (e.g., user double-clicks
// "Buy"), the second request returns the cached response from the
// first, preventing the player from being charged twice.
export const POST = withMiddleware(handlePost, {
  rateLimit: 'auction_buy',
  idempotency: true,
});
