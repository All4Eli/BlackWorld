// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Coven Siege API (/api/covens/siege)
// ═══════════════════════════════════════════════════════════════════
//
// DATA FLOW — How the Next.js API Route talks to React:
//
//   1. The React component (CovenWarfareWall.jsx) calls:
//        fetch('/api/covens/siege')
//      This hits the GET handler below, which queries PostgreSQL
//      for ALL active sieges + their wall_slots, and returns JSON.
//
//   2. When a player clicks "Join Slot" or "Attack Slot", the React
//      component calls:
//        fetch('/api/covens/siege', { method: 'POST', body: ... })
//      This hits the POST handler below.
//
//   3. The POST handler acquires a PostgreSQL transaction with
//      SELECT ... FOR UPDATE on the siege row. This is ROW-LEVEL
//      LOCKING — if two players attack the same siege simultaneously,
//      the second transaction BLOCKS until the first one COMMITs.
//      This prevents lost-update bugs on wall_slots and control points.
//
//   4. After the mutation, the API returns { success, siege, updatedHero }
//      so the React component can update both the siege UI and the
//      player's local state via updateHero().
//
// CONCURRENCY DEEP-DIVE (FOR UPDATE):
//   Without FOR UPDATE, two simultaneous attacks could:
//     TX1: reads wall_slots = [{hp:100}]  →  writes [{hp:90}]
//     TX2: reads wall_slots = [{hp:100}]  →  writes [{hp:85}]
//     Result: [{hp:85}] — TX1's damage is LOST.
//
//   With FOR UPDATE:
//     TX1: reads wall_slots = [{hp:100}] (locks row)
//     TX2: BLOCKS (waits for TX1 to finish)
//     TX1: writes [{hp:90}], COMMIT, releases lock
//     TX2: reads wall_slots = [{hp:90}]  →  writes [{hp:75}]
//     Result: [{hp:75}] — both attacks applied correctly.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne, transaction } from '@/lib/db/pool';

// ─────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────

const WALL_SLOT_COUNT = 10;
const MAX_SLOT_HP     = 500;   // Each slot can absorb 500 damage before flipping
const BASE_ATTACK_DMG = 25;    // Base damage per attack action
const ESSENCE_COST    = 10;    // Essence consumed per siege action
const POINTS_TO_WIN   = 5000;  // Total control points needed to win the siege


// ─────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Generate the initial 10-slot wall array for a new siege.
 * Defender slots start occupied, attacker slots start empty.
 *
 * @param {Object[]} defenders - Array of { clerk_user_id, username } from the defending coven
 * @returns {Object[]} Array of 10 slot objects
 */
function generateInitialWall(defenders = []) {
  const slots = [];
  for (let i = 0; i < WALL_SLOT_COUNT; i++) {
    // Fill as many defender slots as we have defenders (max 10)
    const def = defenders[i] || null;
    slots.push({
      slot_index:    i,
      occupant_id:   def ? def.clerk_user_id : null,
      occupant_name: def ? def.username : null,
      faction:       def ? 'DEF' : null,     // null = empty slot
      hp:            def ? MAX_SLOT_HP : 0,   // Defenders start at full HP
    });
  }
  return slots;
}


// ─────────────────────────────────────────────────────────────────
//  GET — Fetch siege state for the player's coven
// ─────────────────────────────────────────────────────────────────
//
// The React component polls this every few seconds to keep the
// wall grid up-to-date. It returns:
//   - All available territory nodes (for siege selection)
//   - The active siege (if any) with its wall_slots
//   - The player's siege log summary
//
async function handleGet(request, { userId }) {
  // 1. Get the player's coven
  const { data: membership } = await sqlOne(
    `SELECT cm.coven_id, c.name AS coven_name
     FROM coven_members cm
     JOIN covens c ON c.id = cm.coven_id
     WHERE cm.player_id = $1`,
    [userId]
  );

  if (!membership) {
    return NextResponse.json({ error: 'You must be in a coven.' }, { status: 400 });
  }

  // 2. Get available territory nodes
  const { data: territories } = await sql(
    `SELECT tn.id, tn.name, tn.description, tn.region, tn.bonus_type, tn.bonus_value,
            tn.owner_coven_id,
            oc.name AS owner_name, oc.tag AS owner_tag
     FROM territory_nodes tn
     LEFT JOIN covens oc ON oc.id = tn.owner_coven_id
     ORDER BY tn.region, tn.name`
  );

  // 3. Get active siege for this coven (either attacking or defending)
  const { data: activeSiege } = await sqlOne(
    `SELECT cs.*, tn.name AS territory_name, tn.bonus_type, tn.bonus_value,
            ac.name AS attacker_name, ac.tag AS attacker_tag,
            dc.name AS defender_name, dc.tag AS defender_tag
     FROM coven_sieges cs
     JOIN territory_nodes tn ON tn.id = cs.territory_id
     LEFT JOIN covens ac ON ac.id = cs.attacker_coven_id
     LEFT JOIN covens dc ON dc.id = cs.defender_coven_id
     WHERE cs.status = 'active'
       AND (cs.attacker_coven_id = $1 OR cs.defender_coven_id = $1)
     LIMIT 1`,
    [membership.coven_id]
  );

  // 4. If there's an active siege, get this player's contribution summary
  let myStats = { attacks: 0, damage_dealt: 0 };
  if (activeSiege) {
    const { data: stats } = await sqlOne(
      `SELECT COUNT(*)::int AS attacks, COALESCE(SUM(damage_dealt), 0)::int AS damage_dealt
       FROM siege_log
       WHERE siege_id = $1 AND player_id = $2`,
      [activeSiege.id, userId]
    );
    if (stats) myStats = stats;
  }

  // 5. Parse wall_slots from JSONB (defensive: handle string or array)
  let wallSlots = [];
  if (activeSiege?.wall_slots) {
    wallSlots = typeof activeSiege.wall_slots === 'string'
      ? JSON.parse(activeSiege.wall_slots)
      : activeSiege.wall_slots;
  }

  return NextResponse.json({
    covenId:     membership.coven_id,
    covenName:   membership.coven_name,
    territories: territories || [],
    siege:       activeSiege ? {
      id:              activeSiege.id,
      territoryName:   activeSiege.territory_name,
      bonusType:       activeSiege.bonus_type,
      bonusValue:      activeSiege.bonus_value,
      attackerName:    activeSiege.attacker_name,
      attackerTag:     activeSiege.attacker_tag,
      defenderName:    activeSiege.defender_name,
      defenderTag:     activeSiege.defender_tag,
      attackerPoints:  activeSiege.attacker_points,
      defenderPoints:  activeSiege.defender_points,
      attackerCovenId: activeSiege.attacker_coven_id,
      defenderCovenId: activeSiege.defender_coven_id,
      wallSlots:       wallSlots,
      status:          activeSiege.status,
      expiresAt:       activeSiege.expires_at,
    } : null,
    myStats,
  });
}


// ─────────────────────────────────────────────────────────────────
//  POST — Siege Actions (start, join_slot, attack)
// ─────────────────────────────────────────────────────────────────
//
// Request body: { action: 'start_siege' | 'join_slot' | 'attack', ... }
//
// All mutating actions use a PostgreSQL TRANSACTION with FOR UPDATE
// row locking on the coven_sieges row. This serializes concurrent
// writes to the same siege, preventing lost updates.
//
async function handlePost(request, { userId }) {
  const body = await request.json();
  const { action } = body;

  // ── Validate membership ──
  const { data: membership } = await sqlOne(
    `SELECT cm.coven_id, cm.role AS coven_role, c.name AS coven_name, p.username
     FROM coven_members cm
     JOIN covens c ON c.id = cm.coven_id
     JOIN players p ON p.clerk_user_id = cm.player_id
     WHERE cm.player_id = $1`,
    [userId]
  );

  if (!membership) {
    return NextResponse.json({ error: 'You must be in a coven.' }, { status: 400 });
  }

  // NOTE: Essence is validated INSIDE each transaction (FOR UPDATE)
  // to prevent TOCTOU race conditions where two concurrent siege
  // actions both pass an outer check and then both deduct.

  // ────────────────────────────────────────────────────
  //  ACTION: START_SIEGE
  //  Body: { action: 'start_siege', territoryId: uuid }
  // ────────────────────────────────────────────────────
  if (action === 'start_siege') {
    const { territoryId } = body;
    if (!territoryId) {
      return NextResponse.json({ error: 'Missing territoryId.' }, { status: 400 });
    }

    // Only leaders/officers can start sieges
    if (!['leader', 'officer'].includes(membership.coven_role?.toLowerCase())) {
      return NextResponse.json({ error: 'Only leaders or officers can declare siege.' }, { status: 403 });
    }

    const { data: result, error: txErr } = await transaction(async (client) => {
      // Check for existing active siege on this territory
      const existing = await client.query(
        `SELECT id FROM coven_sieges
         WHERE territory_id = $1 AND status = 'active'
         LIMIT 1`,
        [territoryId]
      );
      if (existing.rows.length > 0) {
        throw new Error('This territory is already under siege.');
      }

      // Check the player's coven doesn't already have an active siege
      const myActive = await client.query(
        `SELECT id FROM coven_sieges
         WHERE status = 'active'
           AND (attacker_coven_id = $1 OR defender_coven_id = $1)
         LIMIT 1`,
        [membership.coven_id]
      );
      if (myActive.rows.length > 0) {
        throw new Error('Your coven is already involved in a siege.');
      }

      // Get territory + defender info
      const territory = await client.query(
        `SELECT id, owner_coven_id FROM territory_nodes WHERE id = $1`,
        [territoryId]
      );
      if (territory.rows.length === 0) throw new Error('Territory not found.');

      const defenderCovenId = territory.rows[0].owner_coven_id;

      // Can't siege your own territory
      if (defenderCovenId === membership.coven_id) {
        throw new Error('You cannot siege your own territory.');
      }

      // Fetch defender members for initial wall population
      let defenders = [];
      if (defenderCovenId) {
        const defMembers = await client.query(
          `SELECT cm.player_id AS clerk_user_id, p.username
           FROM coven_members cm
           JOIN players p ON p.clerk_user_id = cm.player_id
           WHERE cm.coven_id = $1
           ORDER BY random()
           LIMIT $2`,
          [defenderCovenId, WALL_SLOT_COUNT]
        );
        defenders = defMembers.rows;
      }

      const initialWall = generateInitialWall(defenders);

      // Create the siege
      const siege = await client.query(
        `INSERT INTO coven_sieges (territory_id, attacker_coven_id, defender_coven_id, wall_slots)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [territoryId, membership.coven_id, defenderCovenId, JSON.stringify(initialWall)]
      );

      // Deduct essence from the siege initiator (atomic with guard)
      const { rows: essRows } = await client.query(
        `UPDATE hero_stats SET essence = GREATEST(0, essence - $1)
         WHERE player_id = $2 AND essence >= $1
         RETURNING essence`,
        [ESSENCE_COST, userId]
      );
      if (essRows.length === 0) throw new Error(`Need ${ESSENCE_COST} essence.`);

      return siege.rows[0];
    });

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 400 });
    }

    // Return ONLY the changed fields for shallow merge (camelCase)
    const { data: heroRow } = await sqlOne(
      `SELECT essence, hp, max_hp, gold, xp, level FROM hero_stats WHERE player_id = $1`, [userId]
    );
    const updatedHero = {
      essence: heroRow.essence,
      hp: heroRow.hp,
      maxHp: heroRow.max_hp,
      gold: heroRow.gold,
      xp: heroRow.xp,
      level: heroRow.level,
    };

    return NextResponse.json({ success: true, siegeId: result.id, updatedHero });
  }


  // ────────────────────────────────────────────────────
  //  ACTION: JOIN_SLOT
  //  Body: { action: 'join_slot', siegeId: uuid, slotIndex: 0-9 }
  //  Player occupies an empty wall slot for their faction.
  // ────────────────────────────────────────────────────
  if (action === 'join_slot') {
    const { siegeId, slotIndex } = body;
    if (siegeId == null || slotIndex == null || slotIndex < 0 || slotIndex >= WALL_SLOT_COUNT) {
      return NextResponse.json({ error: 'Invalid siege or slot.' }, { status: 400 });
    }

    const { data: result, error: txErr } = await transaction(async (client) => {
      // ── FOR UPDATE: Lock the siege row ──
      // This is the critical concurrency control. The database acquires
      // an exclusive lock on THIS specific row. Any other transaction
      // that tries to SELECT ... FOR UPDATE on the same row will BLOCK
      // until we COMMIT or ROLLBACK.
      const siegeRes = await client.query(
        `SELECT * FROM coven_sieges WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [siegeId]
      );
      if (siegeRes.rows.length === 0) throw new Error('Siege not found or ended.');

      const siege = siegeRes.rows[0];
      const wallSlots = typeof siege.wall_slots === 'string'
        ? JSON.parse(siege.wall_slots) : siege.wall_slots;

      // Determine the player's faction
      let faction;
      if (siege.attacker_coven_id === membership.coven_id) faction = 'ATK';
      else if (siege.defender_coven_id === membership.coven_id) faction = 'DEF';
      else throw new Error('Your coven is not part of this siege.');

      // Check if slot is available
      const slot = wallSlots[slotIndex];
      if (!slot) throw new Error('Invalid slot index.');
      if (slot.occupant_id) throw new Error('Slot is already occupied.');

      // Check player isn't already in another slot
      const alreadyIn = wallSlots.find(s => s.occupant_id === userId);
      if (alreadyIn) throw new Error('You are already in a slot.');

      // Occupy the slot
      wallSlots[slotIndex] = {
        slot_index:    slotIndex,
        occupant_id:   userId,
        occupant_name: membership.username,
        faction:       faction,
        hp:            MAX_SLOT_HP,
      };

      // Write back the wall_slots JSONB
      await client.query(
        `UPDATE coven_sieges SET wall_slots = $1 WHERE id = $2`,
        [JSON.stringify(wallSlots), siegeId]
      );

      // Log the action
      await client.query(
        `INSERT INTO siege_log (siege_id, player_id, player_name, action, target_slot, faction)
         VALUES ($1, $2, $3, 'join_slot', $4, $5)`,
        [siegeId, userId, membership.username, slotIndex, faction]
      );

      // Deduct essence (atomic with guard)
      const { rows: essRows } = await client.query(
        `UPDATE hero_stats SET essence = GREATEST(0, essence - $1)
         WHERE player_id = $2 AND essence >= $1
         RETURNING essence`,
        [ESSENCE_COST, userId]
      );
      if (essRows.length === 0) throw new Error(`Need ${ESSENCE_COST} essence.`);

      return wallSlots;
    });

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 400 });
    }

    const { data: heroRow } = await sqlOne(
      `SELECT essence, hp, max_hp, gold, xp, level FROM hero_stats WHERE player_id = $1`, [userId]
    );
    const updatedHero = {
      essence: heroRow.essence,
      hp: heroRow.hp,
      maxHp: heroRow.max_hp,
      gold: heroRow.gold,
      xp: heroRow.xp,
      level: heroRow.level,
    };

    return NextResponse.json({ success: true, wallSlots: result, updatedHero });
  }


  // ────────────────────────────────────────────────────
  //  ACTION: ATTACK
  //  Body: { action: 'attack', siegeId: uuid, targetSlot: 0-9 }
  //  Player attacks an enemy-occupied wall slot.
  // ────────────────────────────────────────────────────
  if (action === 'attack') {
    const { siegeId, targetSlot } = body;
    if (siegeId == null || targetSlot == null || targetSlot < 0 || targetSlot >= WALL_SLOT_COUNT) {
      return NextResponse.json({ error: 'Invalid target.' }, { status: 400 });
    }

    const { data: result, error: txErr } = await transaction(async (client) => {
      // ── Fetch hero stats inside the transaction for damage calc ──
      const heroRes = await client.query(
        `SELECT level, str, dex FROM hero_stats WHERE player_id = $1`,
        [userId]
      );
      if (heroRes.rows.length === 0) throw new Error('Hero not found.');
      const hero = heroRes.rows[0];

      // ── FOR UPDATE: Serialize concurrent attacks ──
      // If Player A and Player B both attack slot 3 at the same instant,
      // PostgreSQL queues them. Player A's transaction locks the row,
      // modifies wall_slots, COMMITs. THEN Player B's transaction
      // reads the UPDATED wall_slots and applies its damage on top.
      const siegeRes = await client.query(
        `SELECT * FROM coven_sieges WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [siegeId]
      );
      if (siegeRes.rows.length === 0) throw new Error('Siege not found or ended.');

      const siege = siegeRes.rows[0];
      const wallSlots = typeof siege.wall_slots === 'string'
        ? JSON.parse(siege.wall_slots) : siege.wall_slots;

      // Determine attacker's faction
      let myFaction;
      if (siege.attacker_coven_id === membership.coven_id) myFaction = 'ATK';
      else if (siege.defender_coven_id === membership.coven_id) myFaction = 'DEF';
      else throw new Error('Your coven is not part of this siege.');

      // Validate target: must be occupied by the ENEMY faction
      const target = wallSlots[targetSlot];
      if (!target || !target.occupant_id) throw new Error('Target slot is empty.');
      if (target.faction === myFaction) throw new Error('Cannot attack your own faction.');

      // Calculate damage with variance (base ± 30%) + level scaling
      const levelBonus = Math.floor((hero.level || 1) * 1.5);
      const strBonus   = Math.floor((hero.str || 5) * 0.5);
      const variance   = 0.7 + Math.random() * 0.6;  // 0.7x to 1.3x
      const damage     = Math.max(1, Math.floor((BASE_ATTACK_DMG + levelBonus + strBonus) * variance));
      const isCrit     = Math.random() < 0.15;  // 15% crit chance
      const finalDmg   = isCrit ? damage * 2 : damage;

      // Apply damage to the slot
      target.hp = Math.max(0, target.hp - finalDmg);
      let slotFlipped = false;

      // If the slot's HP hits 0, it's captured by the attacker's faction
      if (target.hp <= 0) {
        target.occupant_id   = null;
        target.occupant_name = null;
        target.faction       = null;
        target.hp            = 0;
        slotFlipped = true;
      }

      wallSlots[targetSlot] = target;

      // Award control points to the attacker's faction
      const pointsCol = myFaction === 'ATK' ? 'attacker_points' : 'defender_points';
      const newPoints  = (myFaction === 'ATK' ? siege.attacker_points : siege.defender_points) + finalDmg;

      // Check for siege resolution (one side hits the point threshold)
      let siegeResolved = false;
      let winnerId = null;
      if (newPoints >= POINTS_TO_WIN) {
        siegeResolved = true;
        winnerId = membership.coven_id;
      }

      // Write updates
      if (siegeResolved) {
        await client.query(
          `UPDATE coven_sieges
           SET wall_slots = $1, ${pointsCol} = $2,
               status = 'resolved', winner_coven_id = $3, resolved_at = now()
           WHERE id = $4`,
          [JSON.stringify(wallSlots), newPoints, winnerId, siegeId]
        );

        // Transfer territory ownership to the winner
        await client.query(
          `UPDATE territory_nodes SET owner_coven_id = $1, captured_at = now()
           WHERE id = $2`,
          [winnerId, siege.territory_id]
        );
      } else {
        await client.query(
          `UPDATE coven_sieges SET wall_slots = $1, ${pointsCol} = $2 WHERE id = $3`,
          [JSON.stringify(wallSlots), newPoints, siegeId]
        );
      }

      // Log the attack
      await client.query(
        `INSERT INTO siege_log (siege_id, player_id, player_name, action, target_slot, damage_dealt, faction)
         VALUES ($1, $2, $3, 'attack', $4, $5, $6)`,
        [siegeId, userId, membership.username, targetSlot, finalDmg, myFaction]
      );

      // Deduct essence (atomic with guard)
      const { rows: essRows } = await client.query(
        `UPDATE hero_stats SET essence = GREATEST(0, essence - $1)
         WHERE player_id = $2 AND essence >= $1
         RETURNING essence`,
        [ESSENCE_COST, userId]
      );
      if (essRows.length === 0) throw new Error(`Need ${ESSENCE_COST} essence.`);

      return {
        damage:      finalDmg,
        isCrit,
        slotFlipped,
        targetSlotState: target,
        siegeResolved,
        winnerFaction: siegeResolved ? myFaction : null,
        attackerPoints: myFaction === 'ATK' ? newPoints : siege.attacker_points,
        defenderPoints: myFaction === 'DEF' ? newPoints : siege.defender_points,
        wallSlots,
      };
    });

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 400 });
    }

    const { data: heroRow } = await sqlOne(
      `SELECT essence, hp, max_hp, gold, xp, level FROM hero_stats WHERE player_id = $1`, [userId]
    );
    const updatedHero = {
      essence: heroRow.essence,
      hp: heroRow.hp,
      maxHp: heroRow.max_hp,
      gold: heroRow.gold,
      xp: heroRow.xp,
      level: heroRow.level,
    };

    return NextResponse.json({ success: true, ...result, updatedHero });
  }


  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}


// ─────────────────────────────────────────────────────────────────
//  EXPORT — Wrap handlers with auth + rate limiting middleware
// ─────────────────────────────────────────────────────────────────
//
// withMiddleware is a Higher-Order Function (HOF). It returns a NEW
// function that Next.js calls when a request hits this route. That
// new function:
//   1. Validates the JWT → extracts userId
//   2. Checks the rate_limit_config table for 'siege_action'
//   3. If both pass, calls our handler with { userId } injected
//
// The rate limit for siege_action is: 10 requests per 60 seconds.
// This prevents spamming attacks to overwhelm the FOR UPDATE lock queue.

export const GET  = withMiddleware(handleGet,  { rateLimit: null });
export const POST = withMiddleware(handlePost, { rateLimit: 'siege_action', idempotency: true });
