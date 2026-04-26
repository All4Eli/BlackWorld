// ═══════════════════════════════════════════════════════════════════
// POST /api/equipment/equip — Equip or unequip an item
// ═══════════════════════════════════════════════════════════════════
// Client sends intent: { inventoryId, slot } to equip,
//                       { slot } (no inventoryId) to unequip.
// Server validates ownership, level, slot compat, and handles swap.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as InventoryDal from '@/lib/db/dal/inventory';

/**
 * POST /api/equipment/equip
 *
 * Body (equip):   { inventoryId: "uuid", slot: "mainHand" }
 * Body (unequip): { slot: "mainHand" }
 *
 * All validation happens server-side via the DAL:
 *   - Ownership check (inventory row belongs to player)
 *   - Level requirement (hero_stats.level >= items.level_required)
 *   - Slot compatibility (item's catalog slot matches target slot)
 *   - Swap handling (old item returned to inventory, unlocked)
 *
 * @param {Request} request
 * @param {{ userId: string }} ctx
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { inventoryId, slot } = body;

    if (!slot) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Equipment slot is required.' },
        { status: 400 }
      );
    }

    // ── Unequip (no inventoryId provided) ──
    if (!inventoryId) {
      const { data, error } = await InventoryDal.unequipItem(userId, slot);
      if (error) {
        return NextResponse.json(
          { error: 'UNEQUIP_FAILED', message: error.message },
          { status: 400 }
        );
      }

      // Return updated equipment for the client to sync
      const { data: equipment } = await InventoryDal.getEquipment(userId);

      return NextResponse.json({
        success: true,
        action: 'unequip',
        ...data,
        equipment: equipment || [],
      });
    }

    // ── Equip ──
    const { data, error } = await InventoryDal.equipItem(userId, inventoryId, slot);
    if (error) {
      // Determine appropriate status code from error message
      const msg = error.message;
      let status = 400;
      if (msg.includes('not found')) status = 404;
      if (msg.includes('Level') || msg.includes('cannot be equipped') || msg.includes('cannot go in')) status = 403;

      console.error('[EQUIP FAILED]', {
        userId,
        inventoryId,
        slot,
        error: msg,
        status,
      });

      return NextResponse.json({ error: 'EQUIP_FAILED', message: msg }, { status });
    }

    // Return updated equipment for the client to sync
    const { data: equipment } = await InventoryDal.getEquipment(userId);

    return NextResponse.json({
      success: true,
      action: 'equip',
      ...data,
      equipment: equipment || [],
    });
  } catch (err) {
    console.error('[POST /api/equipment/equip]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'combat',     // 60 req/min — equipment changes are frequent
  idempotency: true,       // prevent double-equip from network retries
});
