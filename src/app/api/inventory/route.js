// ═══════════════════════════════════════════════════════════════════
// GET /api/inventory — Fetch player's full inventory
// ═══════════════════════════════════════════════════════════════════
//
// Returns all inventory rows JOINed with the items catalog.
// This is the SINGLE source of truth for what the player owns.
//
// The ArsenalView, ItemShopView (sell tab), EnhancementForge,
// AuctionView, and DashboardView equip modal all consume this.
//
// Each item includes:
//   - inventory_id (for equip/sell/enhance operations)
//   - item_key, item_name, item_type, item_slot, item_tier
//   - base_stats, enhancement, rolled_stats, quantity
//   - is_locked (true if equipped or listed on auction)
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as InventoryDal from '@/lib/db/dal/inventory';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'You must be logged in.' },
      { status: 401 }
    );
  }

  const { data: items, error } = await InventoryDal.getCharacterInventory(userId);

  if (error) {
    console.error('[GET /api/inventory]', error.message);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load inventory.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    items: items || [],
    count: (items || []).length,
  });
}
