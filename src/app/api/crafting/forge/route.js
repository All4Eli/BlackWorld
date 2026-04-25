// ═══════════════════════════════════════════════════════════════════
// POST /api/crafting/forge — Craft an item from a recipe
// ═══════════════════════════════════════════════════════════════════
//
// JSONB ERADICATION — WHAT CHANGED:
//
//   OLD CODE (race condition):
//     1. Read hero_data blob
//     2. Loop through heroData.artifacts looking for type === 'item'
//     3. Remove the first one it finds (not even matching the recipe!)
//     4. Push a hand-built object into heroData.artifacts
//     5. Write the entire blob back
//
//   PROBLEMS:
//     • Consumed a RANDOM material, not the correct recipe ingredients
//     • Two concurrent crafts could both read the same blob and both
//       "consume" the same material — only one actually disappears
//     • The crafted item was a raw JS object with `id: 'crafted_' + Date.now()`,
//       not a proper inventory row linked to the items catalog
//
//   NEW CODE (correct & atomic):
//     1. Read the recipe from crafting_recipes (includes ingredients JSONB)
//     2. Inside a SINGLE transaction:
//        a) FOR UPDATE lock the player's gold (hero_stats)
//        b) For EACH ingredient in the recipe:
//           - Look up the item_id from the items catalog
//           - Lock the player's inventory row for that item
//           - Decrement quantity (or DELETE if quantity reaches 0)
//        c) Deduct gold cost
//        d) Roll the success/fail chance
//        e) If success: INSERT the result item into inventory
//     3. Everything succeeds or everything rolls back
//
// TRANSACTION MECHANICS:
//
//   We use our `transaction()` wrapper from pool.js, which:
//     const client = await pool.connect();
//     await client.query('BEGIN');
//     const result = await callback(client);
//     await client.query('COMMIT');
//     client.release();
//
//   All queries within the callback share the same `client`,
//   which means they run in the SAME PostgreSQL transaction.
//   If any query throws, the wrapper catches it, runs ROLLBACK,
//   and returns { error }.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction } from '@/lib/db/pool';
import * as InventoryDal from '@/lib/db/dal/inventory';


async function handlePost(request, { userId }) {
  const { recipeId } = await request.json();

  if (!recipeId) {
    return NextResponse.json({ error: 'Missing recipe ID.' }, { status: 400 });
  }

  // ── Atomic crafting transaction ─────────────────────────────
  const { data, error } = await transaction(async (client) => {

    // ── STEP 1: Fetch the recipe definition ─────────────────────
    //
    // FOR SHARE locks the recipe row so it can't be modified
    // mid-craft (e.g., an admin changing ingredients).
    // FOR SHARE is a weaker lock than FOR UPDATE — it allows
    // other FOR SHARE reads but blocks FOR UPDATE writes.
    const { rows: recipeRows } = await client.query(
      `SELECT * FROM crafting_recipes WHERE id = $1 AND is_active = true FOR SHARE`,
      [recipeId]
    );

    if (recipeRows.length === 0) {
      throw new Error('Recipe not found or inactive.');
    }

    const recipe = recipeRows[0];

    // ── STEP 2: Parse the ingredients list ──────────────────────
    //
    // recipe.ingredients is a JSONB column stored as:
    //   [{ "item_key": "charred_bone", "qty": 3 },
    //    { "item_key": "grave_silk",   "qty": 1 }]
    //
    // PostgreSQL stores JSONB in a decomposed binary format.
    // When the `pg` driver reads it, it automatically parses
    // it into a native JS array — no JSON.parse() needed.
    const ingredients = recipe.ingredients || [];

    if (ingredients.length === 0) {
      throw new Error('Recipe has no ingredients defined.');
    }

    // ── STEP 3: Lock and verify gold ────────────────────────────
    //
    // FOR UPDATE acquires an exclusive row lock on the player's
    // hero_stats row. This prevents concurrent crafts from
    // both seeing "enough gold" and double-spending.
    const { rows: heroRows } = await client.query(
      `SELECT gold, level FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [userId]
    );

    if (heroRows.length === 0) throw new Error('Player not found.');
    const hero = heroRows[0];

    // Check level requirement (recipe.level_required defaults to 1)
    if (hero.level < (recipe.level_required || 1)) {
      throw new Error(
        `Level ${recipe.level_required} required to craft ${recipe.name}.`
      );
    }

    // gold_cost can be stored as a top-level column OR inside result_data JSONB.
    // The recipes table has a `gold_cost` column (used by GET /api/crafting/recipes),
    // but some recipes might store it in result_data instead. Check BOTH.
    const goldCost = recipe.gold_cost || recipe.result_data?.gold_cost || 0;

    if (goldCost > 0 && hero.gold < goldCost) {
      throw new Error(`Not enough gold: have ${hero.gold}, need ${goldCost}.`);
    }

    // ── STEP 4: Consume each ingredient from inventory ──────────
    //
    // For each ingredient, we:
    //   a) Look up its UUID from the items catalog (by key)
    //   b) Lock the player's inventory row FOR UPDATE
    //   c) Verify they own enough quantity
    //   d) Decrement or DELETE the row
    //
    // WHY FOR UPDATE ON EACH ROW?
    //   If two crafts run simultaneously and both need 3 charred_bone,
    //   the first one locks the row, decrements from 10 → 7, commits.
    //   The second one then sees 7 (not 10) and decrements to 4.
    //   Without FOR UPDATE, both would see 10 and both decrement to 7,
    //   effectively only consuming 3 total instead of 6.
    for (const ingredient of ingredients) {
      // a) Resolve item_key → item catalog UUID
      const { rows: itemRows } = await client.query(
        `SELECT id FROM items WHERE key = $1`,
        [ingredient.item_key]
      );

      if (itemRows.length === 0) {
        throw new Error(`Unknown ingredient: ${ingredient.item_key}`);
      }

      const itemId = itemRows[0].id;

      // b) Lock the player's inventory row for this material
      //
      // We filter by is_locked = false to skip items that are
      // currently equipped or listed on the auction house.
      const { rows: invRows } = await client.query(
        `SELECT id, quantity FROM inventory
         WHERE player_id = $1 AND item_id = $2 AND is_locked = false
         LIMIT 1 FOR UPDATE`,
        [userId, itemId]
      );

      if (invRows.length === 0) {
        throw new Error(
          `Missing material: ${ingredient.item_key} (need ${ingredient.qty})`
        );
      }

      const inv = invRows[0];

      if (inv.quantity < ingredient.qty) {
        throw new Error(
          `Not enough ${ingredient.item_key}: have ${inv.quantity}, need ${ingredient.qty}`
        );
      }

      // c) Decrement or delete
      //
      // If the player has exactly the required quantity, DELETE
      // the row entirely (no zero-quantity ghost rows).
      // Otherwise, decrement using SQL arithmetic:
      //   quantity = quantity - $1
      // This is atomic — the subtraction happens at the DB level.
      if (inv.quantity === ingredient.qty) {
        await client.query(`DELETE FROM inventory WHERE id = $1`, [inv.id]);
      } else {
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1 WHERE id = $2`,
          [ingredient.qty, inv.id]
        );
      }
    }

    // ── STEP 5: Deduct gold cost ────────────────────────────────
    if (goldCost > 0) {
      await client.query(
        `UPDATE hero_stats SET gold = gold - $1, updated_at = NOW()
         WHERE player_id = $2`,
        [goldCost, userId]
      );
    }

    // ── STEP 6: Success/fail roll ───────────────────────────────
    //
    // success_chance is stored in result_data JSONB, e.g.:
    //   result_data: { "success_chance": 0.85, "gold_cost": 500 }
    // Default to 100% if not specified (guaranteed craft).
    const successChance = recipe.result_data?.success_chance ?? 1.0;
    const forgeSuccess = Math.random() <= successChance;

    let craftedItem = null;

    if (forgeSuccess && recipe.result_item_key) {
      // ── STEP 7: Grant the crafted item ──────────────────────
      //
      // Look up the result item from the catalog, then insert
      // a new inventory row owned by the player.
      //
      // If the result item is stackable (e.g., flasks), we try
      // to stack onto an existing row first.
      const { rows: resultItem } = await client.query(
        `SELECT id, is_stackable, max_stack FROM items WHERE key = $1`,
        [recipe.result_item_key]
      );

      if (resultItem.length === 0) {
        // Catalog item doesn't exist yet — log but don't crash
        console.warn(`[CRAFT] result_item_key '${recipe.result_item_key}' not in catalog`);
      } else {
        const item = resultItem[0];

        // Try stacking for stackable items (potions, materials)
        if (item.is_stackable) {
          const { rows: existing } = await client.query(
            `SELECT id, quantity FROM inventory
             WHERE player_id = $1 AND item_id = $2 AND is_locked = false
             LIMIT 1 FOR UPDATE`,
            [userId, item.id]
          );

          if (existing.length > 0) {
            const newQty = Math.min(
              existing[0].quantity + 1,
              item.max_stack || 99
            );
            const { rows: updated } = await client.query(
              `UPDATE inventory SET quantity = $1 WHERE id = $2 RETURNING *`,
              [newQty, existing[0].id]
            );
            craftedItem = updated[0];
          }
        }

        // If not stacked (non-stackable, or no existing row), create new
        if (!craftedItem) {
          const { rows: inserted } = await client.query(
            `INSERT INTO inventory (player_id, item_id, quantity)
             VALUES ($1, $2, 1) RETURNING *`,
            [userId, item.id]
          );
          craftedItem = inserted[0];
        }
      }
    }

    // ── STEP 8: Increment items_crafted counter on success ──────
    if (forgeSuccess && craftedItem) {
      await client.query(
        `UPDATE hero_stats SET items_crafted = items_crafted + 1 WHERE player_id = $1`,
        [userId]
      );
    }

    // ── STEP 9: Fetch updated hero state for frontend ───────────
    const { rows: updatedHeroRows } = await client.query(
      `SELECT gold, hp, max_hp, level, items_crafted FROM hero_stats WHERE player_id = $1`,
      [userId]
    );
    const h = updatedHeroRows[0];

    return {
      forgeSuccess,
      recipeName: recipe.name,
      craftedItem,
      // Map DB snake_case → camelCase for PlayerContext shallow merge
      updatedHero: {
        gold: h.gold,
        hp: h.hp,
        maxHp: h.max_hp,
        level: h.level,
        itemsCrafted: h.items_crafted,
      },
    };
  });

  // ── Handle transaction errors ───────────────────────────────
  if (error) {
    const msg = error.message;
    if (msg.includes('not found') || msg.includes('inactive')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('Not enough') || msg.includes('Missing') || msg.includes('Level')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch fresh inventory outside the transaction so the frontend
  // can sync its material list (consumed ingredients disappear)
  let inventory = [];
  if (!error) {
    const { data: invData } = await InventoryDal.getCharacterInventory(userId);
    inventory = invData || [];
  }

  return NextResponse.json({ success: true, ...data, inventory });
}


// ── Export: rate-limited + idempotent ────────────────────────────
//
// 'craft' rate limit = 15 req/min (already in rate_limit_config).
// Idempotency prevents double-crafts from network retries —
// critical because crafting DESTROYS materials permanently.
export const POST = withMiddleware(handlePost, {
  rateLimit: 'craft',
  idempotency: true,
});
