// ═══════════════════════════════════════════════════════════════════
// POST /api/auction/cancel — Cancel an active auction listing
// ═══════════════════════════════════════════════════════════════════
//
// When a seller cancels their listing:
//   1. Lock the auction row with FOR UPDATE (prevent race conditions)
//   2. Verify the caller is the seller AND status is 'active'
//   3. Unlock the inventory item (is_locked = false)
//   4. Set auction status = 'cancelled'
//
// EXPLOIT PREVENTION:
//   - The Cancel + Buy duplication glitch is prevented because:
//     a) Both cancel and buy lock the auction row with FOR UPDATE
//     b) Only one can proceed at a time
//     c) The second one sees status != 'active' and fails
//
// NOTE: The listing fee is NOT refunded on cancel.
// This is a deliberate gold sink to discourage market manipulation.
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

  const { data, error } = await transaction(async (client) => {

    // ── STEP 1: Lock the auction row ────────────────────────────
    //
    // FOR UPDATE ensures no concurrent buy or cancel can modify
    // this row until our transaction completes.
    const { rows: auctionRows } = await client.query(
      `SELECT * FROM auction_listings
       WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );

    if (auctionRows.length === 0) {
      throw new Error('Auction not found.');
    }

    const auction = auctionRows[0];

    // ── STEP 2: Verify ownership and status ─────────────────────
    //
    // STRICT STATE-MACHINE CHECK:
    //   - Only the seller can cancel their own listing
    //   - Only 'active' auctions can be cancelled
    //   - 'sold', 'expired', 'cancelled' are all terminal states
    if (auction.seller_id !== userId) {
      throw new Error('You can only cancel your own listings.');
    }

    if (auction.status !== 'active') {
      throw new Error(`Cannot cancel: auction is already '${auction.status}'.`);
    }

    // ── STEP 3: Unlock the inventory item ───────────────────────
    //
    // The item was locked (is_locked = true) when listed to prevent
    // equipping/selling while on auction. Now we release it.
    if (auction.inventory_id) {
      await client.query(
        `UPDATE inventory SET is_locked = false WHERE id = $1 AND player_id = $2`,
        [auction.inventory_id, userId]
      );
    }

    // ── STEP 4: Mark auction as cancelled ───────────────────────
    await client.query(
      `UPDATE auction_listings SET status = 'cancelled' WHERE id = $1`,
      [auctionId]
    );

    // ── STEP 5: Fetch updated hero state ────────────────────────
    const { rows: heroRows } = await client.query(
      `SELECT gold, bank_balance, hp, max_hp, level
       FROM hero_stats WHERE player_id = $1`,
      [userId]
    );
    const h = heroRows[0];

    return {
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
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('only cancel') || msg.includes('Cannot cancel')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('[AUCTION CANCEL ERROR]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch fresh inventory (item is now unlocked and usable again)
  let inventory = [];
  if (!error) {
    const { data: invData } = await InventoryDal.getCharacterInventory(userId);
    inventory = invData || [];
  }

  return NextResponse.json({ success: true, ...data, inventory });
}


export const POST = withMiddleware(handlePost, {
  rateLimit: 'auction_cancel',
  idempotency: true,
});
