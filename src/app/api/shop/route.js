// ═══════════════════════════════════════════════════════════════════
// GET  /api/shop — Fetch NPC shop inventory
// POST /api/shop — Purchase an item from the shop
// ═══════════════════════════════════════════════════════════════════
// Shop items come from the database (npc_shop_inventory → items catalog).
// No more server-side random generation or client-trusted prices.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { auth } from '@/lib/auth';
import * as InventoryDal from '@/lib/db/dal/inventory';
import * as HeroDal from '@/lib/db/dal/hero';
import { sql } from '@/lib/db/pool';

/**
 * GET /api/shop?npcKey=shadow_merchant
 *
 * Returns the shop inventory for a specific NPC, filtered by the
 * player's level. All items come from the `npc_shop_inventory`
 * → `items` catalog join.
 */
export async function GET(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'You must be logged in.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const npcKey = searchParams.get('npcKey') || 'merchant_kael';

  // Fetch player level for filtering
  const { data: hero } = await HeroDal.getHeroStats(userId);
  const playerLevel = hero?.level || 1;

  // Fetch shop inventory from DB
  const { data: shopItems, error } = await sql(
    `SELECT
       i.id              AS item_id,
       i.key             AS item_key,
       i.name,
       i.type,
       i.slot,
       i.tier,
       i.description,
       i.base_stats,
       i.level_required,
       COALESCE(nsi.price_override, i.buy_price) AS price,
       i.sell_price,
       nsi.stock
     FROM npc_shop_inventory nsi
     JOIN items i ON nsi.item_id = i.id
     JOIN npcs n ON nsi.npc_id = n.id
     WHERE n.key = $1
       AND i.level_required <= $2
     ORDER BY nsi.sort_order, i.level_required, i.tier`,
    [npcKey, playerLevel]
  );

  if (error) {
    console.error('[GET /api/shop]', error.message);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load shop.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    npcKey,
    playerLevel,
    playerGold: hero?.gold || 0,
    items: shopItems || [],
  });
}


/**
 * POST /api/shop — Purchase an item
 *
 * Body: { itemKey: "bone_shard_dagger", quantity?: 1 }
 *
 * Server validates gold, level, and item existence.
 * Uses InventoryDal.purchaseItem for atomic gold deduction + item grant.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { itemKey, quantity = 1 } = body;

    if (!itemKey) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'itemKey is required.' },
        { status: 400 }
      );
    }

    if (quantity < 1 || quantity > 99) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Quantity must be between 1 and 99.' },
        { status: 400 }
      );
    }

    const { data, error } = await InventoryDal.purchaseItem(userId, itemKey, quantity);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('not found')) status = 404;
      if (msg.includes('Insufficient gold')) status = 403;
      if (msg.includes('Level')) status = 403;

      return NextResponse.json({ error: 'PURCHASE_FAILED', message: msg }, { status });
    }

    // ── Fetch fresh inventory for UI sync ──────────────────────
    //
    // The frontend's ItemShopView needs the updated inventory list
    // so the purchased item appears instantly without a page reload.
    // We also return updatedHero with the new gold balance for
    // shallow-merge into PlayerContext.
    const { data: inventoryData } = await InventoryDal.getCharacterInventory(userId);

    return NextResponse.json({
      success: true,
      purchased: {
        itemKey: data.item.item_key,
        itemName: data.item.item_name,
        quantity,
      },
      goldSpent: data.goldSpent,
      goldRemaining: data.goldRemaining,
      updatedHero: { gold: data.goldRemaining },
      inventory: inventoryData || [],
    });
  } catch (err) {
    console.error('[POST /api/shop]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'shop_buy',
  idempotency: true,
});
