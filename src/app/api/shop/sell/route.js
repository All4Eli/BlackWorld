// ═══════════════════════════════════════════════════════════════════
// POST /api/shop/sell — Sell an inventory item
// ═══════════════════════════════════════════════════════════════════
// Client sends: { inventoryId: "uuid", quantity?: 1 }
// Server validates ownership, calculates sell price from the item
// catalog, and atomically removes + grants gold.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as InventoryDal from '@/lib/db/dal/inventory';

/**
 * POST /api/shop/sell
 *
 * Body: { inventoryId: "uuid", quantity?: 1 }
 *
 * Server determines sell price from the items catalog (sell_price column).
 * The client does NOT send a price — server-authoritative.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { inventoryId, quantity = 1 } = body;

    if (!inventoryId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'inventoryId is required.' },
        { status: 400 }
      );
    }

    if (quantity < 1 || quantity > 9999) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Quantity must be between 1 and 9999.' },
        { status: 400 }
      );
    }

    const { data, error } = await InventoryDal.sellItem(userId, inventoryId, quantity);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('not found')) status = 404;
      if (msg.includes('locked') || msg.includes('equipped')) status = 403;
      if (msg.includes('cannot be sold')) status = 403;

      return NextResponse.json({ error: 'SELL_FAILED', message: msg }, { status });
    }

    // Fetch fresh inventory so UI can sync after the sold item is removed
    const { data: inventoryData } = await InventoryDal.getCharacterInventory(userId);

    return NextResponse.json({
      success: true,
      goldEarned: data.goldEarned,
      goldTotal: data.goldTotal,
      updatedHero: { gold: data.goldTotal },
      inventory: inventoryData || [],
    });
  } catch (err) {
    console.error('[POST /api/shop/sell]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'shop_buy',   // same rate limit as buying
  idempotency: true,
});
