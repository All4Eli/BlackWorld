// ═══════════════════════════════════════════════════════════════════
// POST /api/explore — Explore a zone and trigger an encounter
// ═══════════════════════════════════════════════════════════════════
//
// REQUEST LIFECYCLE (how `withMiddleware` works):
//
//   1. Next.js receives the HTTP POST and calls our exported `POST`.
//   2. `POST` is actually `withMiddleware(handlePost, options)`, which
//      returned a NEW function that wraps `handlePost`.
//   3. That wrapper function runs IN ORDER:
//      a) AUTH  — calls auth(), extracts userId from the JWT cookie.
//                 If invalid/missing → 401 immediately, handlePost never runs.
//      b) RATE LIMIT — checks DB (rate_limits table) for action 'explore'.
//                 If over 30 requests in 60s → 429 immediately.
//      c) HANDLER — finally calls handlePost(request, { userId }).
//   4. handlePost receives a pre-validated userId. No need to call auth()
//      again — the middleware already did it.
//
// JSONB ERADICATION:
//   OLD: Read hero_data blob → push loot into heroData.artifacts → write back.
//   NEW: Insert loot directly into the `inventory` table using the
//        InventoryDal.addItem() function, which handles stackable logic
//        and runs inside a transaction.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne } from '@/lib/db/pool';
import { transaction } from '@/lib/db/pool';
import * as InventoryDal from '@/lib/db/dal/inventory';
import { generateLoot, ZONES } from '@/lib/gameData';

// ── Narrative banks (pure data, no DB) ─────────────────────────
const EMPTY_NARRATIVES = [
  'The shadows shift but reveal nothing. You press on.',
  'Silence. Only your heartbeat echoes in the dark.',
  'You find weathered markings on the walls, but nothing useful.',
  'A cold wind sweeps through. The path ahead feels heavier.',
  'Footsteps echo — but they are your own.',
  'The darkness deepens. Nothing stirs.',
];

const MATERIAL_NARRATIVES = [
  'Something glints in the rubble.',
  'A faint pulse of energy draws you to a hidden cache.',
  'You pry open a decayed chest half-buried in bone dust.',
  'The remains of a fallen warrior hold something of value.',
];

const ENEMY_NARRATIVES = [
  'A corrupted creature lurches from the shadows!',
  'The ground trembles — something awakens!',
  'Eyes glow in the dark ahead. You\'re not alone.',
  'A guttural roar splits the silence. Prepare yourself!',
  'Claws scrape stone. An abomination blocks your path.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}


/**
 * Core handler — only runs AFTER middleware has:
 *   1. Verified the JWT → extracted userId
 *   2. Checked rate limits for action 'explore'
 *
 * @param {Request} request - The raw Next.js Request object
 * @param {{ userId: string }} ctx - Injected by withMiddleware after auth
 */
async function handlePost(request, { userId }) {
  const { zoneId } = await request.json();

  // ── 1. Fetch hero (NO hero_data — only normalized columns) ────
  //
  // We SELECT only the columns we actually need for this route:
  //   level  — to validate zone level requirement
  //   gold   — to credit gold if the encounter is a gold find
  //   essence — future: deduct exploration cost
  //
  // Notice: hero_data is NOT in this SELECT. It's gone.
  const { data: hero, error: heroErr } = await sqlOne(
    `SELECT level, gold, essence FROM hero_stats WHERE player_id = $1`,
    [userId]
  );

  if (heroErr || !hero) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  // ── 2. Validate zone ──────────────────────────────────────────
  const zone = ZONES.find(z => z.id === zoneId);
  if (!zone) {
    return NextResponse.json({ error: 'Zone not found.' }, { status: 404 });
  }

  // ── 3. Encounter roll ─────────────────────────────────────────
  const roll = Math.random();
  let encounterType = 'empty';
  let narrative = '';
  let loot = null;
  let goldFound = 0;

  if (roll > 0.65) {
    // ── ENEMY ENCOUNTER (35%) ─────────────────────────────────
    encounterType = 'enemy';
    narrative = pick(ENEMY_NARRATIVES);

  } else if (roll > 0.35) {
    // ── RESOURCE / LOOT FIND (30%) ────────────────────────────
    //
    // OLD (race condition):
    //   heroData.artifacts.push(loot)
    //   UPDATE hero_stats SET hero_data = $1
    //
    // NEW (atomic):
    //   INSERT INTO inventory (player_id, item_id, quantity)
    //   via InventoryDal.addItem() inside a transaction.
    //
    // addItem() resolves the item_key against the `items` catalog,
    // handles stackable vs non-stackable, and uses FOR UPDATE
    // locking to prevent double-stacking race conditions.
    encounterType = 'resource';
    loot = generateLoot(zone.levelReq || 1);
    narrative = pick(MATERIAL_NARRATIVES);

    // Convert the generated loot name into a catalog key.
    // generateLoot returns { name: "Charred Bone", tier: "COMMON" }.
    // The items catalog uses keys like "charred_bone".
    const itemKey = loot.name.toLowerCase().replace(/\s+/g, '_');

    const { error: addErr } = await InventoryDal.addItem(userId, itemKey, 1);

    if (addErr) {
      // If the item doesn't exist in the catalog yet, log it but
      // don't crash the request — the player still gets the narrative.
      console.warn('[EXPLORE] Could not add loot to inventory:', addErr.message);
    }

  } else if (roll > 0.15) {
    // ── GOLD FIND (20%) ───────────────────────────────────────
    //
    // This UPDATE uses a SQL expression (gold = gold + $1) instead
    // of read-then-write. This is atomic: even if two requests hit
    // simultaneously, each one increments from the CURRENT value
    // stored in the row, not a stale JS variable.
    encounterType = 'gold';
    goldFound = Math.floor((10 + Math.random() * 30) * (zone.goldMultiplier || 1));
    narrative = `You find a pouch of ${goldFound} gold coins scattered among the debris.`;

    await sqlOne(
      `UPDATE hero_stats SET gold = gold + $1, updated_at = NOW()
       WHERE player_id = $2`,
      [goldFound, userId]
    );

  } else {
    // ── EMPTY (15%) ───────────────────────────────────────────
    encounterType = 'empty';
    narrative = pick(EMPTY_NARRATIVES);
  }

  // ── 4. Return sanitized response ──────────────────────────────
  return NextResponse.json({
    success: true,
    encounter: encounterType,
    narrative,
    loot,
    goldFound,
  });
}


// ── Export: wrapped with middleware ──────────────────────────────
//
// withMiddleware returns a NEW function that Next.js calls on each
// request. That function runs auth + rate limiting BEFORE delegating
// to handlePost. The 'explore' string must match a row in the
// rate_limit_config table (action = 'explore', max_requests = 30,
// window_seconds = 60).
export const POST = withMiddleware(handlePost, {
  rateLimit: 'explore',
  idempotency: false, // Exploration is inherently non-deterministic
});
