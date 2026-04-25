// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Inventory & Equipment DAL
// ═══════════════════════════════════════════════════════════════════
// All queries that read or mutate the `inventory`, `equipment`,
// and `items` (catalog) tables.
//
// Schema overview:
//   items      — Static catalog (54 items). Read-only from the API.
//   inventory  — Per-player item instances (enhancement, rolled stats, qty).
//   equipment  — Join table: (player_id, slot) → inventory_id.
//
// Design rules:
//   1. Server-authoritative: all ownership/level checks happen HERE,
//      never on the client.
//   2. equipItem and unequipItem are transactional to prevent duping.
//   3. Items are identified by inventory.id (instance), not items.id (catalog).
// ═══════════════════════════════════════════════════════════════════

import { sql, sqlOne, transaction } from '@/lib/db/pool';

// ─────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────

/** Valid equipment slots (matches CHECK constraint on equipment table) */
const VALID_SLOTS = new Set([
  'mainHand', 'offHand', 'body', 'head',
  'ring1', 'ring2', 'amulet', 'boots',
]);

/**
 * Map of slot groups: items with slot=ring can go in ring1 OR ring2.
 * All other slots map directly.
 * @type {Object<string, string>}
 */
const ITEM_SLOT_TO_EQUIP_SLOT = {
  mainHand: ['mainHand'],
  offHand:  ['offHand'],
  body:     ['body'],
  head:     ['head'],
  ring:     ['ring1', 'ring2'],
  amulet:   ['amulet'],
  boots:    ['boots'],
};


// ═════════════════════════════════════════════════════════════════
//  ITEM CATALOG — Static definitions (read-only)
// ═════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ItemDef
 * @property {string} id          - UUID
 * @property {string} key         - Unique slug (e.g. 'bone_shard_dagger')
 * @property {string} name        - Display name
 * @property {string} type        - WEAPON|ARMOR|ACCESSORY|CONSUMABLE|MATERIAL|TOME|CURRENCY
 * @property {string|null} slot   - Equipment slot (null for non-equippables)
 * @property {string} tier        - COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC|CELESTIAL
 * @property {string} description
 * @property {Object} base_stats  - { dmg, def, hp, crit, lifesteal, ... }
 * @property {number} buy_price
 * @property {number} sell_price
 * @property {number} level_required
 * @property {boolean} is_stackable
 * @property {boolean} is_tradeable
 */

/**
 * Look up an item definition by its unique key slug.
 *
 * @param {string} itemKey - e.g. 'bone_shard_dagger'
 * @returns {Promise<{ data: ItemDef|null, error: Error|null }>}
 */
export function getItemByKey(itemKey) {
  return sqlOne(`SELECT * FROM items WHERE key = $1`, [itemKey]);
}

/**
 * Look up an item definition by its UUID.
 *
 * @param {string} itemId - UUID
 * @returns {Promise<{ data: ItemDef|null, error: Error|null }>}
 */
export function getItemById(itemId) {
  return sqlOne(`SELECT * FROM items WHERE id = $1`, [itemId]);
}

/**
 * Fetch all items available at or below a given level.
 * Used for shop filtering and loot table resolution.
 *
 * @param {number} maxLevel
 * @param {string} [type] - Optional filter by type (WEAPON, ARMOR, etc.)
 * @returns {Promise<{ data: ItemDef[]|null, count: number, error: Error|null }>}
 */
export function getItemsByLevel(maxLevel, type) {
  if (type) {
    return sql(
      `SELECT * FROM items WHERE level_required <= $1 AND type = $2 ORDER BY level_required, tier`,
      [maxLevel, type]
    );
  }
  return sql(
    `SELECT * FROM items WHERE level_required <= $1 ORDER BY level_required, tier`,
    [maxLevel]
  );
}


// ═════════════════════════════════════════════════════════════════
//  INVENTORY — Per-player item instances
// ═════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} InventoryRow
 * @property {string} id            - UUID of the inventory instance
 * @property {string} player_id     - Owner
 * @property {string} item_id       - FK to items catalog
 * @property {string|null} custom_name
 * @property {string|null} custom_tier
 * @property {number} enhancement   - Enhancement level (+0 to +20)
 * @property {Object} rolled_stats  - Instance-specific stat modifications
 * @property {number} quantity
 * @property {boolean} is_locked    - Cannot be sold/traded while true
 * @property {string} acquired_at
 */

/**
 * @typedef {InventoryRow & ItemDef} InventoryItem
 * Joined inventory instance + item catalog definition.
 * Item catalog fields are prefixed when there are name collisions.
 */

/**
 * Fetch a player's full inventory with item catalog details joined in.
 * Returns every item instance the player owns, with its catalog definition.
 *
 * @param {string} playerId - The player's clerk_user_id
 * @returns {Promise<{ data: InventoryItem[]|null, count: number, error: Error|null }>}
 */
export function getCharacterInventory(playerId) {
  return sql(
    `SELECT
       inv.id             AS inventory_id,
       inv.player_id,
       inv.item_id,
       inv.custom_name,
       inv.custom_tier,
       inv.enhancement,
       inv.rolled_stats,
       inv.quantity,
       inv.is_locked,
       inv.acquired_at,
       i.key              AS item_key,
       i.name             AS item_name,
       i.type             AS item_type,
       i.slot             AS item_slot,
       i.tier             AS item_tier,
       i.description      AS item_description,
       i.base_stats,
       i.buy_price,
       i.sell_price,
       i.level_required,
       i.is_stackable,
       i.is_tradeable
     FROM inventory inv
     JOIN items i ON inv.item_id = i.id
     WHERE inv.player_id = $1
     ORDER BY i.type, i.tier DESC, i.name`,
    [playerId]
  );
}

/**
 * Fetch a single inventory row by its UUID, with ownership check.
 * Returns null if the item doesn't exist or doesn't belong to the player.
 *
 * @param {string} playerId
 * @param {string} inventoryId - UUID of the inventory row
 * @returns {Promise<{ data: InventoryItem|null, error: Error|null }>}
 */
export function getInventoryItem(playerId, inventoryId) {
  return sqlOne(
    `SELECT
       inv.*, i.*,
       inv.id AS inventory_id
     FROM inventory inv
     JOIN items i ON inv.item_id = i.id
     WHERE inv.id = $1 AND inv.player_id = $2`,
    [inventoryId, playerId]
  );
}

/**
 * Add an item to a player's inventory.
 * If the item is stackable AND the player already owns one, increase quantity.
 * Otherwise, create a new inventory row.
 * Wrapped in a transaction for atomicity.
 *
 * @param {string} playerId
 * @param {string} itemKey    - The item catalog key (e.g. 'charred_bone')
 * @param {number} [quantity=1] - How many to add
 * @param {Object} [rolledStats={}] - Optional instance-specific stat rolls
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export async function addItem(playerId, itemKey, quantity = 1, rolledStats = {}) {
  return transaction(async (client) => {
    // 1. Look up the item catalog entry
    const { rows: itemRows } = await client.query(
      `SELECT id, is_stackable, max_stack FROM items WHERE key = $1`,
      [itemKey]
    );

    if (itemRows.length === 0) {
      throw new Error(`Item not found in catalog: ${itemKey}`);
    }

    const item = itemRows[0];

    // 2. If stackable, try to stack onto existing inventory row
    if (item.is_stackable) {
      const { rows: existing } = await client.query(
        `SELECT id, quantity FROM inventory
         WHERE player_id = $1 AND item_id = $2 AND is_locked = false
         LIMIT 1 FOR UPDATE`,
        [playerId, item.id]
      );

      if (existing.length > 0) {
        const newQty = Math.min(existing[0].quantity + quantity, item.max_stack || 99);
        const { rows: updated } = await client.query(
          `UPDATE inventory SET quantity = $1 WHERE id = $2 RETURNING *`,
          [newQty, existing[0].id]
        );
        return updated[0];
      }
    }

    // 3. Create a new inventory instance
    const { rows: inserted } = await client.query(
      `INSERT INTO inventory (player_id, item_id, quantity, rolled_stats)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [playerId, item.id, quantity, JSON.stringify(rolledStats)]
    );

    return inserted[0];
  });
}

/**
 * Remove items from a player's inventory.
 * For stackables: decrements quantity. If quantity reaches 0, deletes the row.
 * For non-stackables: deletes the row.
 * Validates ownership before removal. Blocks removal of locked items.
 *
 * @param {string} playerId
 * @param {string} inventoryId - UUID of the inventory row
 * @param {number} [quantity=1] - How many to remove (for stackables)
 * @returns {Promise<{ data: { removed: boolean, remaining: number }, error: Error|null }>}
 */
export async function removeItem(playerId, inventoryId, quantity = 1) {
  return transaction(async (client) => {
    // Lock the row and verify ownership
    const { rows } = await client.query(
      `SELECT id, quantity, is_locked, item_id FROM inventory
       WHERE id = $1 AND player_id = $2
       FOR UPDATE`,
      [inventoryId, playerId]
    );

    if (rows.length === 0) {
      throw new Error('Item not found in your inventory');
    }

    const inv = rows[0];

    if (inv.is_locked) {
      throw new Error('Cannot remove a locked item (currently equipped or in trade)');
    }

    // Check if item is equipped
    const { rows: equipped } = await client.query(
      `SELECT slot FROM equipment WHERE inventory_id = $1 AND player_id = $2`,
      [inventoryId, playerId]
    );

    if (equipped.length > 0) {
      throw new Error(`Cannot remove: item is equipped in slot '${equipped[0].slot}'`);
    }

    // Handle quantity
    if (inv.quantity > quantity) {
      const { rows: updated } = await client.query(
        `UPDATE inventory SET quantity = quantity - $1 WHERE id = $2 RETURNING quantity`,
        [quantity, inventoryId]
      );
      return { removed: true, remaining: updated[0].quantity };
    } else {
      await client.query(`DELETE FROM inventory WHERE id = $1`, [inventoryId]);
      return { removed: true, remaining: 0 };
    }
  });
}


// ═════════════════════════════════════════════════════════════════
//  EQUIPMENT — Slot management
// ═════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} EquipmentSlot
 * @property {string} player_id
 * @property {string} slot         - mainHand|offHand|body|head|ring1|ring2|amulet|boots
 * @property {string} inventory_id - FK to inventory
 * @property {string} equipped_at
 */

/**
 * Fetch all currently equipped items for a player.
 * Joins with inventory and items catalog to return full item details per slot.
 *
 * @param {string} playerId
 * @returns {Promise<{ data: Object[]|null, count: number, error: Error|null }>}
 */
export function getEquipment(playerId) {
  return sql(
    `SELECT
       e.slot,
       e.equipped_at,
       inv.id             AS inventory_id,
       inv.enhancement,
       inv.rolled_stats,
       inv.custom_name,
       inv.custom_tier,
       i.key              AS item_key,
       i.name             AS item_name,
       i.type             AS item_type,
       i.slot             AS item_slot,
       i.tier             AS item_tier,
       i.base_stats,
       i.level_required,
       i.description
     FROM equipment e
     JOIN inventory inv ON e.inventory_id = inv.id
     JOIN items i ON inv.item_id = i.id
     WHERE e.player_id = $1
     ORDER BY e.slot`,
    [playerId]
  );
}

/**
 * Equip an item from inventory into a specific equipment slot.
 *
 * Server-authoritative validation:
 *   1. Verifies the player OWNS the item (inventory.player_id matches)
 *   2. Verifies the player meets the level requirement (hero_stats.level >= items.level_required)
 *   3. Verifies the item's catalog slot is compatible with the target slot
 *   4. If the target slot is occupied, swaps the items (unequips old, equips new)
 *   5. Locks the newly equipped item (is_locked = true)
 *
 * Entire operation is wrapped in a transaction with row locking.
 *
 * @param {string} playerId
 * @param {string} inventoryId - UUID of the inventory item to equip
 * @param {string} slot        - Target slot (e.g. 'mainHand', 'ring1')
 * @returns {Promise<{ data: { equipped: Object, unequipped: Object|null }|null, error: Error|null }>}
 */
export async function equipItem(playerId, inventoryId, slot) {
  // 1. Validate slot name
  if (!VALID_SLOTS.has(slot)) {
    return { data: null, error: new Error(`Invalid equipment slot: ${slot}`) };
  }

  return transaction(async (client) => {
    // 2. Lock and fetch the inventory item + its catalog definition + player level
    const { rows: itemRows } = await client.query(
      `SELECT
         inv.id AS inventory_id,
         inv.player_id,
         inv.item_id,
         inv.is_locked,
         inv.enhancement,
         inv.rolled_stats,
         i.key AS item_key,
         i.name AS item_name,
         i.slot AS item_slot,
         i.type AS item_type,
         i.level_required,
         i.base_stats,
         h.level AS hero_level
       FROM inventory inv
       JOIN items i ON inv.item_id = i.id
       JOIN hero_stats h ON h.player_id = inv.player_id
       WHERE inv.id = $1 AND inv.player_id = $2
       FOR UPDATE OF inv`,
      [inventoryId, playerId]
    );

    if (itemRows.length === 0) {
      throw new Error('Item not found in your inventory');
    }

    const item = itemRows[0];

    // 2b. Verify item is not locked (equipped, listed on auction, or in trade)
    if (item.is_locked) {
      throw new Error(`${item.item_name} is currently locked (equipped or in trade). Unequip or cancel the listing first.`);
    }

    // 2c. Check for active auction listings — prevents equipping items on sale
    const { rows: auctionRows } = await client.query(
      `SELECT id FROM auctions
       WHERE inventory_id = $1 AND seller_id = $2 AND status = 'active'
       LIMIT 1`,
      [inventoryId, playerId]
    );
    if (auctionRows.length > 0) {
      throw new Error(`${item.item_name} is currently listed on the Auction House. Cancel the listing first.`);
    }

    // 3. Verify the item's catalog slot is compatible with the target slot
    if (!item.item_slot) {
      throw new Error(`${item.item_name} cannot be equipped (no slot defined)`);
    }

    const allowedSlots = ITEM_SLOT_TO_EQUIP_SLOT[item.item_slot];
    if (!allowedSlots || !allowedSlots.includes(slot)) {
      throw new Error(
        `${item.item_name} (slot: ${item.item_slot}) cannot go in equipment slot '${slot}'`
      );
    }

    // 4. Verify level requirement
    if (item.hero_level < item.level_required) {
      throw new Error(
        `Level ${item.level_required} required to equip ${item.item_name} (you are level ${item.hero_level})`
      );
    }

    // 5. Check if item is already equipped elsewhere
    const { rows: alreadyEquipped } = await client.query(
      `SELECT slot FROM equipment WHERE inventory_id = $1 AND player_id = $2`,
      [inventoryId, playerId]
    );

    if (alreadyEquipped.length > 0) {
      throw new Error(`This item is already equipped in slot '${alreadyEquipped[0].slot}'`);
    }

    // 6. Handle the currently occupied slot (swap)
    let unequippedItem = null;
    const { rows: currentSlot } = await client.query(
      `SELECT e.inventory_id, i.name AS item_name
       FROM equipment e
       JOIN inventory inv2 ON e.inventory_id = inv2.id
       JOIN items i ON inv2.item_id = i.id
       WHERE e.player_id = $1 AND e.slot = $2
       FOR UPDATE OF e`,
      [playerId, slot]
    );

    if (currentSlot.length > 0) {
      // Unlock the old item
      await client.query(
        `UPDATE inventory SET is_locked = false WHERE id = $1`,
        [currentSlot[0].inventory_id]
      );
      // Remove the old equipment binding
      await client.query(
        `DELETE FROM equipment WHERE player_id = $1 AND slot = $2`,
        [playerId, slot]
      );
      unequippedItem = {
        inventory_id: currentSlot[0].inventory_id,
        item_name: currentSlot[0].item_name,
        slot,
      };
    }

    // 7. Equip the new item
    await client.query(
      `INSERT INTO equipment (player_id, slot, inventory_id)
       VALUES ($1, $2, $3)`,
      [playerId, slot, inventoryId]
    );

    // 8. Lock the newly equipped item
    await client.query(
      `UPDATE inventory SET is_locked = true WHERE id = $1`,
      [inventoryId]
    );

    return {
      equipped: {
        inventory_id: inventoryId,
        item_name: item.item_name,
        slot,
        enhancement: item.enhancement,
        base_stats: item.base_stats,
        rolled_stats: item.rolled_stats,
      },
      unequipped: unequippedItem,
    };
  });
}

/**
 * Unequip an item from a specific slot, returning it to inventory.
 *
 * Server-authoritative:
 *   1. Verifies the slot is actually occupied
 *   2. Removes the equipment binding
 *   3. Unlocks the item in inventory (is_locked = false)
 *
 * Wrapped in a transaction.
 *
 * @param {string} playerId
 * @param {string} slot - The slot to clear (e.g. 'mainHand')
 * @returns {Promise<{ data: { unequipped: Object }|null, error: Error|null }>}
 */
export async function unequipItem(playerId, slot) {
  if (!VALID_SLOTS.has(slot)) {
    return { data: null, error: new Error(`Invalid equipment slot: ${slot}`) };
  }

  return transaction(async (client) => {
    // 1. Find what's in the slot
    const { rows } = await client.query(
      `SELECT e.inventory_id, i.name AS item_name
       FROM equipment e
       JOIN inventory inv ON e.inventory_id = inv.id
       JOIN items i ON inv.item_id = i.id
       WHERE e.player_id = $1 AND e.slot = $2
       FOR UPDATE OF e`,
      [playerId, slot]
    );

    if (rows.length === 0) {
      throw new Error(`Nothing equipped in slot '${slot}'`);
    }

    const { inventory_id, item_name } = rows[0];

    // 2. Remove the equipment binding
    await client.query(
      `DELETE FROM equipment WHERE player_id = $1 AND slot = $2`,
      [playerId, slot]
    );

    // 3. Unlock the item
    await client.query(
      `UPDATE inventory SET is_locked = false WHERE id = $1`,
      [inventory_id]
    );

    return {
      unequipped: { inventory_id, item_name, slot },
    };
  });
}


// ═════════════════════════════════════════════════════════════════
//  COMPOSITE OPERATIONS
// ═════════════════════════════════════════════════════════════════

/**
 * Process loot drops after killing a monster.
 * Given a resolved loot table (from the combat resolver),
 * adds each dropped item to the player's inventory atomically.
 *
 * @param {string} playerId
 * @param {{ item_key: string, quantity: number }[]} drops
 *   Array of items that dropped (already resolved by the combat resolver
 *   using the monster's loot_table + Math.random() against drop_chance).
 * @returns {Promise<{ data: Object[]|null, error: Error|null }>}
 */
export async function grantLootDrops(playerId, drops) {
  if (!drops || drops.length === 0) {
    return { data: [], error: null };
  }

  return transaction(async (client) => {
    const granted = [];

    for (const drop of drops) {
      // Look up the catalog item
      const { rows: itemRows } = await client.query(
        `SELECT id, is_stackable, max_stack FROM items WHERE key = $1`,
        [drop.item_key]
      );

      if (itemRows.length === 0) {
        console.warn(`[LOOT] Skipping unknown item_key: ${drop.item_key}`);
        continue;
      }

      const item = itemRows[0];

      // If stackable, try to stack
      if (item.is_stackable) {
        const { rows: existing } = await client.query(
          `SELECT id, quantity FROM inventory
           WHERE player_id = $1 AND item_id = $2 AND is_locked = false
           LIMIT 1 FOR UPDATE`,
          [playerId, item.id]
        );

        if (existing.length > 0) {
          const newQty = Math.min(
            existing[0].quantity + drop.quantity,
            item.max_stack || 99
          );
          await client.query(
            `UPDATE inventory SET quantity = $1 WHERE id = $2`,
            [newQty, existing[0].id]
          );
          granted.push({ item_key: drop.item_key, quantity: drop.quantity, stacked: true });
          continue;
        }
      }

      // Create new inventory row
      await client.query(
        `INSERT INTO inventory (player_id, item_id, quantity)
         VALUES ($1, $2, $3)`,
        [playerId, item.id, drop.quantity]
      );
      granted.push({ item_key: drop.item_key, quantity: drop.quantity, stacked: false });
    }

    return granted;
  });
}

/**
 * Purchase an item from an NPC shop.
 * Server-authoritative: validates gold, level, and shop availability.
 * Deducts gold from hero_stats and adds item to inventory atomically.
 *
 * @param {string} playerId
 * @param {string} itemKey     - The catalog key of the item to buy
 * @param {number} [quantity=1]
 * @returns {Promise<{ data: { item: Object, goldSpent: number, goldRemaining: number }|null, error: Error|null }>}
 */
export async function purchaseItem(playerId, itemKey, quantity = 1) {
  return transaction(async (client) => {
    // 1. Fetch item catalog + verify it's buyable
    const { rows: itemRows } = await client.query(
      `SELECT * FROM items WHERE key = $1`, [itemKey]
    );
    if (itemRows.length === 0) throw new Error(`Item not found: ${itemKey}`);

    const item = itemRows[0];
    if (!item.buy_price) throw new Error(`${item.name} is not available for purchase`);

    const totalCost = item.buy_price * quantity;

    // 2. Lock hero_stats and check gold + level
    const { rows: heroRows } = await client.query(
      `SELECT gold, level FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [playerId]
    );
    if (heroRows.length === 0) throw new Error('Hero not found');

    const hero = heroRows[0];
    if (hero.gold < totalCost) {
      throw new Error(`Insufficient gold: have ${hero.gold}, need ${totalCost}`);
    }
    if (hero.level < item.level_required) {
      throw new Error(`Level ${item.level_required} required to buy ${item.name}`);
    }

    // 3. Deduct gold
    await client.query(
      `UPDATE hero_stats SET gold = gold - $1 WHERE player_id = $2`,
      [totalCost, playerId]
    );

    // 4. Grant item (stackable logic)
    let inventoryRow;
    if (item.is_stackable) {
      const { rows: existing } = await client.query(
        `SELECT id, quantity FROM inventory
         WHERE player_id = $1 AND item_id = $2 AND is_locked = false
         LIMIT 1 FOR UPDATE`,
        [playerId, item.id]
      );

      if (existing.length > 0) {
        const newQty = Math.min(existing[0].quantity + quantity, item.max_stack || 99);
        const { rows: updated } = await client.query(
          `UPDATE inventory SET quantity = $1 WHERE id = $2 RETURNING *`,
          [newQty, existing[0].id]
        );
        inventoryRow = updated[0];
      }
    }

    if (!inventoryRow) {
      const { rows: inserted } = await client.query(
        `INSERT INTO inventory (player_id, item_id, quantity)
         VALUES ($1, $2, $3) RETURNING *`,
        [playerId, item.id, quantity]
      );
      inventoryRow = inserted[0];
    }

    // 5. Fetch remaining gold
    const { rows: updatedHero } = await client.query(
      `SELECT gold FROM hero_stats WHERE player_id = $1`, [playerId]
    );

    return {
      item: { ...inventoryRow, item_name: item.name, item_key: item.key },
      goldSpent: totalCost,
      goldRemaining: updatedHero[0].gold,
    };
  });
}

/**
 * Sell an inventory item back for its sell_price.
 * Server-authoritative: validates ownership, checks not equipped/locked.
 * Adds gold to hero_stats and removes from inventory atomically.
 *
 * @param {string} playerId
 * @param {string} inventoryId - UUID of the inventory row
 * @param {number} [quantity=1] - For stackables, how many to sell
 * @returns {Promise<{ data: { goldEarned: number, goldTotal: number }|null, error: Error|null }>}
 */
export async function sellItem(playerId, inventoryId, quantity = 1) {
  return transaction(async (client) => {
    // 1. Lock and validate ownership
    const { rows } = await client.query(
      `SELECT inv.id, inv.quantity, inv.is_locked, i.sell_price, i.name
       FROM inventory inv
       JOIN items i ON inv.item_id = i.id
       WHERE inv.id = $1 AND inv.player_id = $2
       FOR UPDATE OF inv`,
      [inventoryId, playerId]
    );

    if (rows.length === 0) throw new Error('Item not found in your inventory');

    const inv = rows[0];
    if (inv.is_locked) throw new Error('Cannot sell: item is locked (equipped or in trade)');
    if (!inv.sell_price) throw new Error(`${inv.name} cannot be sold`);

    // Check not equipped
    const { rows: equipped } = await client.query(
      `SELECT 1 FROM equipment WHERE inventory_id = $1`, [inventoryId]
    );
    if (equipped.length > 0) throw new Error('Cannot sell: item is currently equipped');

    const sellQty = Math.min(quantity, inv.quantity);
    const goldEarned = inv.sell_price * sellQty;

    // 2. Remove or decrement
    if (inv.quantity > sellQty) {
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1 WHERE id = $2`,
        [sellQty, inventoryId]
      );
    } else {
      await client.query(`DELETE FROM inventory WHERE id = $1`, [inventoryId]);
    }

    // 3. Grant gold
    const { rows: updatedHero } = await client.query(
      `UPDATE hero_stats SET gold = gold + $1 WHERE player_id = $2 RETURNING gold`,
      [goldEarned, playerId]
    );

    return {
      goldEarned,
      goldTotal: updatedHero[0].gold,
    };
  });
}
