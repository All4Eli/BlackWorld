// ═══════════════════════════════════════════════════════════════════
// POST /api/auction/list — List an inventory item for sale
// ═══════════════════════════════════════════════════════════════════
//
// JSONB ERADICATION:
//
//   OLD CODE:
//     1. Read hero_data JSONB blob
//     2. Find item in heroData.artifacts[] by array index
//     3. Splice it out: hero.artifacts.splice(itemIdx, 1)
//     4. INSERT into auctions table with item metadata
//     5. UPDATE hero_stats SET hero_data = (modified blob)
//
//   PROBLEMS:
//     • Race condition: two concurrent list requests could both
//       read the same artifacts array, both find the same item,
//       and both list it — creating a DUPLICATE auction.
//     • The JSONB blob has no concept of "ownership" or "locking"
//       per individual item. Everything is one big string.
//
//   NEW CODE:
//     1. Lock the inventory row with FOR UPDATE (prevents concurrent access)
//     2. Verify ownership (player_id matches)
//     3. Mark the item as is_locked = true (can't be equipped/sold/traded)
//     4. INSERT into auction_listings WITH inventory_id FK
//     5. No hero_data is read or written at any point
//
//   The item STAYS in the inventory table with is_locked = true.
//   If the auction expires without a buyer, we simply unlock it.
//   If it sells, the buyer route does UPDATE inventory SET player_id.
//   The item's entire lifecycle is tracked via SQL rows, not JSON arrays.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction, sqlOne } from '@/lib/db/pool';
import * as InventoryDal from '@/lib/db/dal/inventory';


async function handlePost(request, { userId }) {
  const { inventoryId, buyoutPrice } = await request.json();

  // ── Input validation ──────────────────────────────────────────
  if (!inventoryId) {
    return NextResponse.json({ error: 'Missing inventory item ID.' }, { status: 400 });
  }

  if (!buyoutPrice || buyoutPrice <= 0) {
    return NextResponse.json({ error: 'Price must be greater than zero.' }, { status: 400 });
  }

  // ── Atomic transaction ────────────────────────────────────────
  //
  // Why a transaction?
  //   We need to lock the inventory row AND insert the auction listing.
  //   If the auction insert fails (e.g., unique constraint), we need
  //   the lock to be released. A transaction guarantees both operations
  //   succeed together or neither does.
  const { data, error } = await transaction(async (client) => {

    // ── STEP 1: Lock the inventory row ──────────────────────────
    //
    // FOR UPDATE acquires an exclusive row lock on this specific row.
    // If another transaction is already locking this row (e.g.,
    // the player is trying to equip it simultaneously), we WAIT
    // until that transaction finishes.
    //
    // We JOIN with items to get the display metadata (name, type,
    // tier) that we'll store on the auction listing for search/display.
    const { rows: invRows } = await client.query(
      `SELECT
         inv.id AS inventory_id,
         inv.player_id,
         inv.item_id,
         inv.is_locked,
         inv.enhancement,
         inv.rolled_stats,
         inv.quantity,
         i.name   AS item_name,
         i.type   AS item_type,
         i.tier   AS item_tier,
         i.is_tradeable
       FROM inventory inv
       JOIN items i ON inv.item_id = i.id
       WHERE inv.id = $1 AND inv.player_id = $2
       FOR UPDATE OF inv`,
      [inventoryId, userId]
    );

    if (invRows.length === 0) {
      throw new Error('Item not found in your inventory.');
    }

    const item = invRows[0];

    // ── STEP 2: Validation checks ───────────────────────────────
    if (item.is_locked) {
      throw new Error('Item is locked (currently equipped or in a trade).');
    }

    if (!item.is_tradeable) {
      throw new Error(`${item.item_name} cannot be traded.`);
    }

    // ── STEP 3: Check not equipped ──────────────────────────────
    const { rows: equipped } = await client.query(
      `SELECT 1 FROM equipment WHERE inventory_id = $1`,
      [inventoryId]
    );

    if (equipped.length > 0) {
      throw new Error('Cannot list: item is currently equipped.');
    }

    // ── STEP 4: Lock the item ───────────────────────────────────
    //
    // is_locked = true prevents the item from being:
    //   • Equipped (equipItem checks is_locked)
    //   • Sold to NPC (sellItem checks is_locked)
    //   • Listed on another auction (this check above)
    //
    // The item stays in the player's inventory but is "frozen"
    // until the auction resolves.
    await client.query(
      `UPDATE inventory SET is_locked = true WHERE id = $1`,
      [inventoryId]
    );

    // ── STEP 5: Fetch Sovereign tax modifier for listing fee ─────
    //
    // The listing fee is 5% of the buyout price, scaled by the
    // Sovereign's auction_tax_modifier. This mirrors the buy-side tax.
    const { rows: taxRows } = await client.query(
      `SELECT value FROM server_config WHERE key = 'auction_tax_modifier'`
    );
    const taxModifier = taxRows.length > 0 ? parseFloat(taxRows[0].value) || 1.0 : 1.0;
    const listingFee = Math.ceil(buyoutPrice * 0.05 * taxModifier);

    // ── STEP 6: Deduct listing fee from seller's gold ───────────
    //
    // Lock the seller's hero_stats to prevent concurrent gold ops
    const { rows: heroCheckRows } = await client.query(
      `SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [userId]
    );
    if (heroCheckRows.length === 0) throw new Error('Player not found.');
    if (heroCheckRows[0].gold < listingFee) {
      throw new Error(`Not enough gold for listing fee: have ${heroCheckRows[0].gold}, need ${listingFee}.`);
    }

    await client.query(
      `UPDATE hero_stats SET gold = gold - $1, updated_at = NOW() WHERE player_id = $2`,
      [listingFee, userId]
    );

    // ── STEP 7: Fetch the seller's display name ────────────────
    const { rows: playerRows } = await client.query(
      `SELECT username FROM players WHERE clerk_user_id = $1`,
      [userId]
    );
    const sellerName = playerRows[0]?.username || 'Unknown';

    // ── STEP 8: Insert the auction listing ─────────────────────
    const { rows: auctionRows } = await client.query(
      `INSERT INTO auction_listings
         (seller_id, seller_name, inventory_id, item_data, price, buyout_price)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [
        userId,
        sellerName,
        inventoryId,
        JSON.stringify({
          name: item.item_name,
          type: item.item_type,
          tier: item.item_tier,
          enhancement: item.enhancement,
          rolled_stats: item.rolled_stats,
        }),
        buyoutPrice,
      ]
    );

    // ── STEP 9: Write to trade_log ─────────────────────────────
    await client.query(
      `INSERT INTO trade_log (player_id, action, item_name, gold_amount, metadata)
       VALUES ($1, 'sell', $2, $3, $4)`,
      [
        userId,
        item.item_name,
        -listingFee,
        JSON.stringify({ auction_id: auctionRows[0].id, buyout_price: buyoutPrice }),
      ]
    );

    // ── STEP 10: Fetch updated hero state for frontend ──────────
    const { rows: heroRows } = await client.query(
      `SELECT gold, bank_balance, hp, max_hp, level
       FROM hero_stats WHERE player_id = $1`,
      [userId]
    );
    const h = heroRows[0];

    return {
      auction: auctionRows[0],
      listingFee,
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
    if (msg.includes('locked') || msg.includes('equipped') || msg.includes('traded')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch fresh inventory after listing (item is now locked)
  let inventory = [];
  if (!error) {
    const { data: invData } = await InventoryDal.getCharacterInventory(userId);
    inventory = invData || [];
  }

  return NextResponse.json({ success: true, ...data, inventory });
}


// ── Export: rate-limited + idempotent ────────────────────────────
//
// Idempotency prevents double-listing if the user double-clicks.
// The X-Idempotency-Key header ensures the second request returns
// the cached response from the first, not a duplicate listing.
export const POST = withMiddleware(handlePost, {
  rateLimit: 'auction_list',
  idempotency: true,
});
