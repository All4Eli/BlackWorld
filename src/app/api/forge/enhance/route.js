// ═══════════════════════════════════════════════════════════════════
// POST /api/forge/enhance — Enhance an inventory item's power level
// ═══════════════════════════════════════════════════════════════════
//
// JSONB ERADICATION — WHAT CHANGED:
//
//   OLD CODE:
//     1. Read hero_data blob from hero_stats
//     2. Find the artifact in heroData.artifacts[] by artifactId
//     3. Mutate artifact.level in the JS array
//     4. On DESTROY: splice the artifact out of the array
//     5. Write the entire blob back: SET hero_data = $1
//
//   PROBLEMS:
//     • Race condition: two concurrent enhances on different items
//       would both read the same blob, modify different array indices,
//       and the second write would overwrite the first's changes.
//     • DESTROY deletes from a JS array but doesn't actually remove
//       any database row — the item just vanishes from the blob.
//     • No audit trail: no way to track what was enhanced or destroyed.
//
//   NEW CODE:
//     1. Lock the specific inventory row with FOR UPDATE
//     2. Read its `enhancement` column (an integer, default 0)
//     3. Roll success/fail
//     4. On SUCCESS: UPDATE inventory SET enhancement = $1
//     5. On DESTROY: DELETE FROM inventory WHERE id = $1
//     6. On DOWNGRADE: UPDATE inventory SET enhancement = GREATEST(0, enhancement - $1)
//     7. All inside a transaction, so gold deduction + outcome are atomic
//
// THE ENHANCEMENT TABLE:
//
//   This is the core game-design math for progression risk.
//   Each level has three probabilities that MUST sum to <= 1.0:
//     success: probability the enhancement succeeds
//     break:   probability the item is destroyed (on failure)
//     (implied): 1 - success - break = probability of "safe fail"
//
//   The table is intentionally defined in application code, not
//   the database, because it's game-design tuning data that
//   changes during balance patches, not user-mutable data.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction } from '@/lib/db/pool';
import * as InventoryDal from '@/lib/db/dal/inventory';


// ── Enhancement probability table (levels 1–20) ─────────────────
//
// Columns:
//   success — probability of leveling up
//   break   — probability of item destruction (only checked on fail)
//   gold    — gold cost to attempt this level
//   stones  — enhancement stones required (future: consume from inventory)
const ENHANCEMENT_TABLE = {
  1:  { success: 1.00, break: 0.00, gold: 100,    stones: 1 },
  2:  { success: 1.00, break: 0.00, gold: 200,    stones: 1 },
  3:  { success: 0.95, break: 0.00, gold: 350,    stones: 1 },
  4:  { success: 0.90, break: 0.00, gold: 500,    stones: 2 },
  5:  { success: 0.85, break: 0.00, gold: 750,    stones: 2 },
  6:  { success: 0.75, break: 0.05, gold: 1000,   stones: 3 },
  7:  { success: 0.65, break: 0.10, gold: 1500,   stones: 3 },
  8:  { success: 0.55, break: 0.15, gold: 2000,   stones: 4 },
  9:  { success: 0.45, break: 0.20, gold: 3000,   stones: 4 },
  10: { success: 0.35, break: 0.25, gold: 4500,   stones: 5 },
  11: { success: 0.30, break: 0.30, gold: 6000,   stones: 6 },
  12: { success: 0.25, break: 0.35, gold: 8000,   stones: 7 },
  13: { success: 0.20, break: 0.40, gold: 11000,  stones: 8 },
  14: { success: 0.18, break: 0.45, gold: 15000,  stones: 9 },
  15: { success: 0.15, break: 0.50, gold: 20000,  stones: 10 },
  16: { success: 0.12, break: 0.55, gold: 28000,  stones: 12 },
  17: { success: 0.10, break: 0.60, gold: 38000,  stones: 14 },
  18: { success: 0.08, break: 0.65, gold: 50000,  stones: 16 },
  19: { success: 0.06, break: 0.70, gold: 70000,  stones: 18 },
  20: { success: 0.05, break: 0.75, gold: 100000, stones: 20 },
};

/**
 * For levels beyond 20, scale infinitely using an exponential formula.
 * This ensures there's always a "next level" for endgame grinders,
 * but the chances become astronomically low and expensive.
 */
function getScaledValues(level) {
  return {
    success: 0.04,
    break: 0.80,
    gold: Math.floor(100000 * Math.pow(1.1, level - 20)),
    stones: 20 + (level - 20) * 2,
  };
}


async function handlePost(request, { userId }) {
  const body = await request.json();
  const { inventoryId, targetLevel, protectionId } = body;

  // ── Input validation ──────────────────────────────────────────
  //
  // Note: the old route accepted "artifactId" (a JSONB array key).
  // The new route accepts "inventoryId" (a UUID from the inventory table).
  // This is a deliberate API contract change — the frontend must
  // pass the inventory row UUID, not a string like "crafted_1714012345".
  if (!inventoryId || !targetLevel) {
    return NextResponse.json(
      { error: 'inventoryId and targetLevel are required.' },
      { status: 400 }
    );
  }

  // ── Look up the enhancement costs for this level ──────────────
  const tableInfo = ENHANCEMENT_TABLE[targetLevel] || getScaledValues(targetLevel);

  // ── Atomic enhancement transaction ────────────────────────────
  const { data, error } = await transaction(async (client) => {

    // ── STEP 1: Lock the player's gold ──────────────────────────
    //
    // FOR UPDATE ensures no concurrent transaction can read or
    // modify this player's gold until we COMMIT or ROLLBACK.
    const { rows: heroRows } = await client.query(
      `SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [userId]
    );

    if (heroRows.length === 0) throw new Error('Player not found.');
    const playerGold = heroRows[0].gold;

    if (playerGold < tableInfo.gold) {
      throw new Error(
        `Not enough gold: have ${playerGold}, need ${tableInfo.gold}.`
      );
    }

    // ── STEP 2: Lock the inventory item ─────────────────────────
    //
    // We lock the specific inventory row so no other transaction
    // can enhance, sell, equip, or trade this item simultaneously.
    //
    // The JOIN with items gives us the item's display name for
    // the response payload.
    //
    // "FOR UPDATE OF inv" specifies which table's row to lock
    // (the inventory row, not the items catalog row). Without
    // this qualifier, PostgreSQL would try to lock BOTH joined
    // rows, which could cause deadlocks with other queries.
    const { rows: invRows } = await client.query(
      `SELECT
         inv.id AS inventory_id,
         inv.player_id,
         inv.enhancement,
         inv.is_locked,
         inv.rolled_stats,
         i.name AS item_name,
         i.base_stats
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

    // Verify the target level is the NEXT level (prevent skipping)
    if (item.enhancement !== targetLevel - 1) {
      throw new Error(
        `Item is +${item.enhancement}, but you're targeting +${targetLevel}. ` +
        `You can only enhance to the next level (+${item.enhancement + 1}).`
      );
    }

    // ── STEP 3: Deduct gold ─────────────────────────────────────
    //
    // gold = gold - $1 uses SQL arithmetic (atomic).
    // We already verified gold >= cost above, but the WHERE
    // guard below is a second safety net.
    await client.query(
      `UPDATE hero_stats SET gold = gold - $1, updated_at = NOW()
       WHERE player_id = $2 AND gold >= $1`,
      [tableInfo.gold, userId]
    );

    // ── STEP 4: Roll the dice ───────────────────────────────────
    //
    // The stochastic roll determines one of four outcomes:
    //   SUCCESS   — enhancement level increases by 1
    //   FAIL      — nothing happens (gold is still consumed)
    //   DOWNGRADE — enhancement level decreases by 1–3 levels
    //   DESTROYED — the inventory row is permanently deleted
    //
    // Protection scrolls modify the break chance:
    //   prot-1: -10% break chance (Minor Safeguard)
    //   prot-2: 0% break chance (Full Protection)
    //   prot-3: break → downgrade instead of destroy
    let outcome = 'FAIL';
    let levelsLost = 0;
    let newEnhancement = item.enhancement;
    const roll = Math.random();

    if (roll <= tableInfo.success) {
      // ── SUCCESS ───────────────────────────────────────────────
      //
      // UPDATE inventory SET enhancement = $1
      // RETURNING * gives us the updated row without a second query.
      outcome = 'SUCCESS';
      newEnhancement = targetLevel;

      await client.query(
        `UPDATE inventory SET enhancement = $1 WHERE id = $2`,
        [newEnhancement, inventoryId]
      );

    } else {
      // ── FAILED — check for break ──────────────────────────────
      //
      // Calculate effective break chance after protection
      let breakChance = tableInfo.break;

      if (protectionId === 'prot-1') {
        // Minor Safeguard: reduce break chance by 10%
        breakChance = Math.max(0, breakChance - 0.1);
      } else if (protectionId === 'prot-2') {
        // Full Protection: zero break chance
        breakChance = 0;
      }

      if (Math.random() <= breakChance) {
        if (protectionId === 'prot-3') {
          // ── DOWNGRADE (Downgrade Protection active) ───────────
          //
          // Instead of destroying the item, reduce its level by 1–3.
          // GREATEST(0, enhancement - $1) ensures we never go below 0.
          // GREATEST is PostgreSQL's built-in max() for scalar values.
          levelsLost = Math.ceil(Math.random() * 3);
          newEnhancement = Math.max(0, item.enhancement - levelsLost);
          outcome = 'DOWNGRADE';

          await client.query(
            `UPDATE inventory SET enhancement = GREATEST(0, enhancement - $1)
             WHERE id = $2`,
            [levelsLost, inventoryId]
          );

        } else if (protectionId === 'prot-2') {
          // Full Protection absorbs the break (already handled above)
          outcome = 'PROTECTED';

        } else {
          // ── DESTROYED (no protection) ─────────────────────────
          //
          // DELETE FROM inventory WHERE id = $1
          // This permanently removes the row. The item is gone.
          // Any equipment binding is also removed via ON DELETE CASCADE
          // on the equipment table's inventory_id FK.
          outcome = 'DESTROYED';
          newEnhancement = -1; // sentinel: item no longer exists

          // If the item is equipped, unequip it first
          await client.query(
            `DELETE FROM equipment WHERE inventory_id = $1`,
            [inventoryId]
          );

          await client.query(
            `DELETE FROM inventory WHERE id = $1`,
            [inventoryId]
          );
        }
      }
      // If breakChance roll failed (i.e., item survived), outcome
      // stays 'FAIL' — gold consumed, item unchanged.
    }

    // ── STEP 5: Write to enhancement_log for audit trail ────────
    //
    // The enhancement_log table tracks every attempt:
    //   from_level, to_level, success (bool), broke (bool), gold_spent
    // This is essential for player support tickets and anti-cheat.
    await client.query(
      `INSERT INTO enhancement_log (player_id, inventory_id, from_level, to_level, success, broke, gold_spent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        inventoryId,
        item.enhancement,                       // from_level
        outcome === 'SUCCESS' ? targetLevel :    // to_level
          outcome === 'DOWNGRADE' ? newEnhancement :
          outcome === 'DESTROYED' ? -1 : item.enhancement,
        outcome === 'SUCCESS',                   // success
        outcome === 'DESTROYED',                 // broke
        tableInfo.gold,                          // gold_spent
      ]
    );

    // ── STEP 6: Fetch updated hero state ────────────────────────
    const { rows: updatedHeroRows } = await client.query(
      `SELECT gold, hp, max_hp, level FROM hero_stats WHERE player_id = $1`,
      [userId]
    );
    const h = updatedHeroRows[0];

    return {
      outcome,
      levelsLost,
      newEnhancement,
      goldSpent: tableInfo.gold,
      itemName: item.item_name,
      // Map DB snake_case → camelCase for PlayerContext shallow merge
      updatedHero: { gold: h.gold, hp: h.hp, maxHp: h.max_hp, level: h.level },
    };
  });

  // ── Handle transaction errors ───────────────────────────────
  if (error) {
    const msg = error.message;
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('Not enough') || msg.includes('can only enhance')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('[FORGE ENHANCE ERROR]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch fresh inventory after the transaction so the frontend
  // can sync its item list (destroyed items disappear, downgraded items update)
  let inventory = [];
  if (!error) {
    const { data: invData } = await InventoryDal.getCharacterInventory(userId);
    inventory = invData || [];
  }

  return NextResponse.json({ success: true, ...data, inventory });
}


// ── Export: rate-limited + idempotent ────────────────────────────
//
// 'enhance' rate limit = 20 req/min (already in rate_limit_config).
// Idempotency is CRITICAL here — a network retry on a DESTROY
// outcome must NOT double-charge the player.
export const POST = withMiddleware(handlePost, {
  rateLimit: 'enhance',
  idempotency: true,
});
