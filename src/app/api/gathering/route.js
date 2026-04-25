// ═══════════════════════════════════════════════════════════════════
// /api/gathering — Gather resources from world nodes
// ═══════════════════════════════════════════════════════════════════
//
// FULL DATA FLOW (Next.js API Route ↔ React ↔ PostgreSQL):
//
//   1. GatheringView.jsx makes:  GET /api/gathering?zone=bone_crypts
//      → The API queries gathering_nodes + player_gathering + player_node_cooldowns
//      → Returns: { nodes, skills, cooldowns }
//      → React renders the node list with cooldown timers
//
//   2. Player clicks "Gather" on a node. React makes:
//        POST /api/gathering { nodeId: "abc-123" }
//      → The API wraps everything in a PostgreSQL TRANSACTION:
//        a) SELECT hero_stats FOR UPDATE (lock the row, check essence)
//        b) SELECT player_node_cooldowns (check if node is on cooldown)
//        c) Resolve the loot table → determine gathered items
//        d) INSERT INTO inventory (add materials to the player's bag)
//        e) UPSERT player_gathering (add XP, check level-up)
//        f) UPSERT player_node_cooldowns (set new cooldown timestamp)
//        g) UPDATE hero_stats SET essence = essence - cost
//      → Returns: { success, gathered, skillXP, leveledUp, cooldownExpiresAt, updatedHero }
//      → React calls updateHero(data.updatedHero) to sync global state
//
// CONCURRENCY NOTES:
//   The FOR UPDATE lock on hero_stats prevents a race condition where
//   two rapid "Gather" clicks could both pass the essence check before
//   either deducts. The second transaction blocks until the first commits.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne, transaction } from '@/lib/db/pool';


// ─────────────────────────────────────────────────────────────────
//  SKILL MAP — Maps node_type → gathering skill
// ─────────────────────────────────────────────────────────────────
const SKILL_MAP = {
  ore:     'mining',
  herb:    'herbalism',
  wood:    'woodcutting',
  gem:     'gemcraft',
  essence: 'mining',
  skin:    'skinning',
};


// ─────────────────────────────────────────────────────────────────
//  GET /api/gathering — Fetch nodes, skills, and cooldowns
// ─────────────────────────────────────────────────────────────────
//
// Query params:
//   ?zone=bone_crypts  — Filter nodes by zone (optional)
//
// Returns:
//   {
//     nodes: [...],       ← gathering_nodes with zone names
//     skills: [...],      ← player_gathering rows for this player
//     cooldowns: { nodeId: expiresAt, ... }
//   }
//
async function handleGet(req, { userId }) {
  const url = new URL(req.url);
  const zoneFilter = url.searchParams.get('zone');

  // ── 1. Fetch gathering nodes with zone names ──────────────────
  //
  // JOIN zones to get the human-readable zone name.
  // If a zone filter is provided, add a WHERE clause.
  let nodesQuery = `
    SELECT gn.*, z.name AS zone_name
    FROM gathering_nodes gn
    JOIN zones z ON z.id = gn.zone_id
    WHERE gn.is_active = true
  `;
  const params = [];

  if (zoneFilter) {
    params.push(zoneFilter);
    nodesQuery += ` AND gn.zone_id = $${params.length}`;
  }

  nodesQuery += ` ORDER BY z.sort_order, gn.tier, gn.name`;

  const { data: nodes } = await sql(nodesQuery, params);

  // ── 2. Fetch player's gathering skills ────────────────────────
  const { data: skills } = await sql(
    `SELECT * FROM player_gathering WHERE player_id = $1`,
    [userId]
  );

  // ── 3. Fetch active cooldowns ─────────────────────────────────
  //
  // TIMESTAMP MATH:
  //   cooldown_expires_at > now()
  //   This comparison uses PostgreSQL's built-in TIMESTAMPTZ comparison.
  //   PostgreSQL stores timestamps as UTC microseconds internally, so
  //   now() and cooldown_expires_at are compared as integers under the hood.
  //   If the cooldown hasn't expired yet, include it in the result.
  //
  const { data: cooldownRows } = await sql(
    `SELECT node_id, cooldown_expires_at, times_gathered
     FROM player_node_cooldowns
     WHERE player_id = $1 AND cooldown_expires_at > now()`,
    [userId]
  );

  // Build a lookup map: nodeId → { expiresAt, timesGathered }
  const cooldowns = {};
  (cooldownRows || []).forEach(row => {
    cooldowns[row.node_id] = {
      expiresAt:     row.cooldown_expires_at,
      timesGathered: row.times_gathered,
    };
  });

  return NextResponse.json({
    nodes:     nodes || [],
    skills:    skills || [],
    cooldowns,
  });
}


// ─────────────────────────────────────────────────────────────────
//  POST /api/gathering — Gather from a specific node
// ─────────────────────────────────────────────────────────────────
//
// Request body: { nodeId: "uuid" }
//
// TRANSACTION BREAKDOWN:
//   The entire gather action is wrapped in a single PostgreSQL
//   transaction. If ANY step fails (e.g., inserting inventory),
//   the ENTIRE operation is rolled back — no partial state corruption.
//
//   Step 1: Lock hero_stats row (FOR UPDATE) — prevents double-spend
//   Step 2: Check cooldown — prevents gathering a node too soon
//   Step 3: Resolve loot — determine what was gathered
//   Step 4: Insert into inventory — stackable UPSERT
//   Step 5: UPSERT skill XP — level-up detection
//   Step 6: Set cooldown — UPSERT with timestamp math
//   Step 7: Deduct essence — atomic subtraction
//
async function handlePost(req, { userId }) {
  const { nodeId } = await req.json();

  if (!nodeId) {
    return NextResponse.json({ error: 'Missing nodeId.' }, { status: 400 });
  }

  // ── Fetch the node definition (outside transaction — read-only) ──
  const { data: node } = await sqlOne(
    `SELECT * FROM gathering_nodes WHERE id = $1 AND is_active = true`,
    [nodeId]
  );
  if (!node) {
    return NextResponse.json({ error: 'Node not found or inactive.' }, { status: 404 });
  }

  const skillType  = SKILL_MAP[node.node_type] || 'mining';
  const essenceCost = node.essence_cost || 5;

  // ── Execute the full gather inside a transaction ──────────────
  const { data: result, error: txErr } = await transaction(async (client) => {

    // ── STEP 1: Lock hero_stats with FOR UPDATE ─────────────────
    //
    // WHY FOR UPDATE?
    //   If the player double-clicks "Gather" and two requests arrive
    //   simultaneously, both would read essence=50 and both pass the
    //   check. Then both deduct 5, resulting in essence=45 instead of 40.
    //   FOR UPDATE makes the second transaction WAIT for the first to
    //   finish, so it reads the UPDATED essence value.
    //
    const heroRes = await client.query(
      `SELECT essence, level FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [userId]
    );
    if (heroRes.rows.length === 0) throw new Error('Hero not found.');
    const hero = heroRes.rows[0];

    if ((hero.essence || 0) < essenceCost) {
      throw new Error(`Need ${essenceCost} Blood Essence (have ${hero.essence}).`);
    }

    // ── STEP 2: Check per-node cooldown ─────────────────────────
    //
    // TIMESTAMP COMPARISON:
    //   cooldown_expires_at > now()
    //   PostgreSQL evaluates this server-side using the DB clock.
    //   This avoids timezone issues — the client never needs to
    //   compute timestamps. We just compare two TIMESTAMPTZ values.
    //
    const cdRes = await client.query(
      `SELECT cooldown_expires_at
       FROM player_node_cooldowns
       WHERE player_id = $1 AND node_id = $2 AND cooldown_expires_at > now()`,
      [userId, nodeId]
    );
    if (cdRes.rows.length > 0) {
      const remaining = new Date(cdRes.rows[0].cooldown_expires_at) - new Date();
      const secs = Math.ceil(remaining / 1000);
      throw new Error(`Node on cooldown. ${secs}s remaining.`);
    }

    // ── STEP 2b: Check skill level requirement ──────────────────
    const skillRes = await client.query(
      `SELECT skill_level, skill_xp, total_gathered
       FROM player_gathering
       WHERE player_id = $1 AND skill_type = $2`,
      [userId, skillType]
    );
    const currentSkill = skillRes.rows[0] || { skill_level: 1, skill_xp: 0, total_gathered: 0 };

    if (currentSkill.skill_level < (node.min_skill_level || 1)) {
      throw new Error(`Requires ${skillType} level ${node.min_skill_level} (you have ${currentSkill.skill_level}).`);
    }

    // ── STEP 3: Resolve loot table ──────────────────────────────
    //
    // The loot_table column can be two formats:
    //   OLD (object): { "iron_ore": { "min": 1, "max": 3 } }
    //   NEW (array):  [{ "itemKey": "iron_ore", "name": "Iron Ore", "chance": 1.0, ... }]
    //
    // We handle both for backwards compatibility.
    //
    const gathered = [];
    let rawLoot = node.loot_table;
    if (typeof rawLoot === 'string') rawLoot = JSON.parse(rawLoot);

    if (Array.isArray(rawLoot)) {
      // NEW FORMAT: Array of loot entries with chance rolls
      for (const entry of rawLoot) {
        const roll = Math.random();
        if (roll <= (entry.chance || 0.5)) {
          const qty = Math.floor(Math.random() * ((entry.maxQty || 1) - (entry.minQty || 1) + 1)) + (entry.minQty || 1);
          gathered.push({
            itemKey:  entry.itemKey,
            name:     entry.name || entry.itemKey,
            quantity: qty,
            tier:     entry.tier || node.tier || 'COMMON',
          });
        }
      }
    } else if (rawLoot && typeof rawLoot === 'object') {
      // OLD FORMAT: Object keys are item keys
      for (const [itemKey, lootDef] of Object.entries(rawLoot)) {
        const min = lootDef.min || 1;
        const max = lootDef.max || 1;
        const qty = Math.floor(Math.random() * (max - min + 1)) + min;
        if (qty > 0) {
          gathered.push({
            itemKey,
            name: itemKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            quantity: qty,
            tier: node.tier || 'COMMON',
          });
        }
      }
    }

    // Fallback: always grant at least 1 material
    if (gathered.length === 0) {
      gathered.push({
        itemKey:  `${node.node_type}_material`,
        name:     `${node.name} Fragment`,
        quantity: 1,
        tier:     node.tier || 'COMMON',
      });
    }

    // ── STEP 4: Insert gathered items into inventory ────────────
    //
    // UPSERT PATTERN:
    //   If the player already has copper_ore in their inventory, we
    //   add to the existing stack instead of creating a new row.
    //   ON CONFLICT triggers when (player_id, item_id) matches AND
    //   the item is stackable.
    //
    //   We first look up the item in the items table. If it doesn't
    //   exist there, we insert a raw inventory entry with custom_name.
    //
    for (const loot of gathered) {
      // Try to find the item in the items master table
      const itemRes = await client.query(
        `SELECT id, is_stackable FROM items WHERE key = $1`,
        [loot.itemKey]
      );

      if (itemRes.rows.length > 0) {
        const item = itemRes.rows[0];
        if (item.is_stackable) {
          // UPSERT: increment quantity if already owned, else insert
          //
          // ON CONFLICT (player_id, item_id) — this requires a unique index.
          // Since we may not have one, we use the INSERT-or-UPDATE pattern:
          //   1. Try to UPDATE existing stack
          //   2. If no rows updated, INSERT new stack
          const updateRes = await client.query(
            `UPDATE inventory SET quantity = quantity + $3
             WHERE player_id = $1 AND item_id = $2 AND deleted_at IS NULL
             RETURNING id`,
            [userId, item.id, loot.quantity]
          );
          if (updateRes.rows.length === 0) {
            await client.query(
              `INSERT INTO inventory (player_id, item_id, quantity)
               VALUES ($1, $2, $3)`,
              [userId, item.id, loot.quantity]
            );
          }
        } else {
          // Non-stackable: insert individual rows
          for (let i = 0; i < loot.quantity; i++) {
            await client.query(
              `INSERT INTO inventory (player_id, item_id, quantity)
               VALUES ($1, $2, 1)`,
              [userId, item.id]
            );
          }
        }
      } else {
        // Item not in master table — insert with custom_name
        // This handles raw materials that haven't been registered yet
        await client.query(
          `INSERT INTO inventory (player_id, custom_name, custom_tier, quantity)
           VALUES ($1, $2, $3, $4)`,
          [userId, loot.name, loot.tier, loot.quantity]
        );
      }
    }

    // ── STEP 5: UPSERT player_gathering (skill XP progression) ──
    //
    // UPSERT EXPLAINED:
    //   INSERT ... ON CONFLICT (player_id, skill_type) DO UPDATE
    //
    //   This is a single atomic statement that either:
    //     a) INSERTs a new row if the player has never used this skill
    //     b) UPDATEs the existing row if they have
    //
    //   The ON CONFLICT clause tells PostgreSQL: "if a row with the same
    //   (player_id, skill_type) primary key already exists, don't throw
    //   an error — instead, run the DO UPDATE SET clause."
    //
    //   EXCLUDED refers to the row that WOULD have been inserted. So
    //   EXCLUDED.skill_xp is the base_xp value we're trying to add.
    //   We add it to the existing player_gathering.skill_xp.
    //
    const baseXP = node.base_xp || 15;
    const oldLevel = currentSkill.skill_level || 1;
    const oldXP    = currentSkill.skill_xp || 0;
    const newXP    = oldXP + baseXP;
    const xpToLevel = oldLevel * 100;  // level 1 = 100 XP, level 2 = 200, etc.
    const leveledUp = newXP >= xpToLevel;
    const finalLevel = leveledUp ? oldLevel + 1 : oldLevel;
    const finalXP    = leveledUp ? newXP - xpToLevel : newXP;

    await client.query(
      `INSERT INTO player_gathering (player_id, skill_type, skill_level, skill_xp, total_gathered)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (player_id, skill_type) DO UPDATE SET
         skill_xp = $4,
         skill_level = $3,
         total_gathered = player_gathering.total_gathered + 1`,
      [userId, skillType, finalLevel, finalXP]
    );

    // ── STEP 6: UPSERT cooldown (timestamp math) ───────────────
    //
    // TIMESTAMP MATH:
    //   now() + (respawn_seconds * INTERVAL '1 second')
    //
    //   PostgreSQL interval arithmetic works like this:
    //     now() returns:  2026-04-25 16:30:00+00
    //     300 * INTERVAL '1 second' = INTERVAL '5 minutes'
    //     now() + INTERVAL '5 minutes' = 2026-04-25 16:35:00+00
    //
    //   So if respawn_seconds is 300, the node becomes harvestable
    //   again 5 minutes from now. The API compares:
    //     cooldown_expires_at > now()
    //   If true → still on cooldown. If false → harvestable.
    //
    //   Using $2::int * INTERVAL '1 second' casts the parameter to
    //   an integer before multiplying by the interval literal.
    //
    await client.query(
      `INSERT INTO player_node_cooldowns (player_id, node_id, cooldown_expires_at, last_gathered_at, times_gathered)
       VALUES ($1, $2, now() + ($3::int * INTERVAL '1 second'), now(), 1)
       ON CONFLICT (player_id, node_id) DO UPDATE SET
         cooldown_expires_at = now() + ($3::int * INTERVAL '1 second'),
         last_gathered_at = now(),
         times_gathered = player_node_cooldowns.times_gathered + 1`,
      [userId, nodeId, node.respawn_seconds || 300]
    );

    // ── STEP 7: Deduct essence ──────────────────────────────────
    await client.query(
      `UPDATE hero_stats SET essence = GREATEST(0, essence - $1) WHERE player_id = $2`,
      [essenceCost, userId]
    );

    // Fetch the cooldown we just set (for the response)
    const cdResult = await client.query(
      `SELECT cooldown_expires_at FROM player_node_cooldowns
       WHERE player_id = $1 AND node_id = $2`,
      [userId, nodeId]
    );

    return {
      gathered,
      gatherXP:         baseXP,
      skillType,
      skillLevel:       finalLevel,
      skillXP:          finalXP,
      leveledUp,
      cooldownExpiresAt: cdResult.rows[0]?.cooldown_expires_at,
    };
  });

  if (txErr) {
    return NextResponse.json({ error: txErr.message, success: false }, { status: 400 });
  }

  // Fetch updated hero for PlayerContext sync
  const { data: updatedHero } = await sqlOne(
    `SELECT * FROM hero_stats WHERE player_id = $1`,
    [userId]
  );

  return NextResponse.json({
    success: true,
    ...result,
    updatedHero,
  });
}


// ─────────────────────────────────────────────────────────────────
//  EXPORTS — Middleware-wrapped handlers
// ─────────────────────────────────────────────────────────────────
//
// GET: No rate limit (read-only, inexpensive).
// POST: Rate limited via 'gather' config (20 req/min).
//   The rate limiter is checked BEFORE the handler runs, so
//   spamming Gather won't even reach the database.
//
export const GET  = withMiddleware(handleGet,  { rateLimit: null });
export const POST = withMiddleware(handlePost, { rateLimit: 'gather' });
