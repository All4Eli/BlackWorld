// ═══════════════════════════════════════════════════════════════════
// POST /api/healer/heal — Restore HP to max for a gold cost
// ═══════════════════════════════════════════════════════════════════
//
// EFFECTIVE MAX HP:
//   The max_hp COLUMN stores only the base pool:
//     100 + (vit × 5) + (level × 5)
//
//   But the player's REAL max HP includes additional sources:
//     + Skill tree:  iron_flesh (10 HP per rank)
//     + Tomes:       tome_iron_will (+30 HP)
//     + Equipment:   base_stats.hp + rolled_stats.hp from all equipped items
//
//   The healer must heal to the EFFECTIVE max, not the base column.
//   We compute this server-side by querying skill_points, tomes,
//   and equipment in the same read, then passing the effective max
//   to the UPDATE query as a parameter.
//
// ECONOMIC SAFETY:
//   The UPDATE query uses a WHERE clause with TWO conditions:
//     gold >= $1 AND hp < $2 (effective max)
//   This means if gold was already spent by a concurrent request,
//   the WHERE fails, RETURNING returns 0 rows, and we detect it.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne, sql } from '@/lib/db/pool';
import { calculateSkillBonuses, calculateTomeBonuses } from '@/lib/skillTree';

/** Fixed heal cost in gold (could move to server_config table later) */
const HEAL_COST = 20;

/**
 * @param {Request} request
 * @param {{ userId: string }} ctx - Injected by middleware after JWT verification
 */
async function handlePost(request, { userId }) {

  // ── 1. Read base stats + skill_points + tomes ──────────────────
  const { data: hero, error: heroErr } = await sqlOne(
    `SELECT hp, max_hp, gold, skill_points, learned_tomes FROM hero_stats WHERE player_id = $1`,
    [userId]
  );

  if (heroErr || !hero) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  // ── 2. Compute equipment HP bonuses ────────────────────────────
  //
  // Sum base_stats.hp and rolled_stats.hp from all equipped items.
  // The equipment table links player → inventory → items catalog.
  const { data: gearRows } = await sql(
    `SELECT i.base_stats, inv.rolled_stats
     FROM equipment e
     JOIN inventory inv ON e.inventory_id = inv.id
     JOIN items i ON inv.item_id = i.id
     WHERE e.player_id = $1`,
    [userId]
  );

  let gearHpBonus = 0;
  if (gearRows) {
    for (const row of gearRows) {
      const baseHp = row.base_stats?.hp || row.base_stats?.vit || 0;
      const rolledHp = row.rolled_stats?.hp || row.rolled_stats?.vit || 0;
      gearHpBonus += baseHp + rolledHp;
    }
  }

  // ── 3. Compute skill tree HP bonuses ───────────────────────────
  const skillBonuses = calculateSkillBonuses(hero.skill_points || {});
  const tomeBonuses = calculateTomeBonuses(hero.learned_tomes || []);

  // ── 4. Calculate EFFECTIVE max HP ──────────────────────────────
  //
  // base max_hp (column) + skills + tomes + gear
  const effectiveMaxHp = hero.max_hp
    + (skillBonuses.maxHp || 0)
    + (tomeBonuses.flatHp || 0)
    + gearHpBonus;

  // ── 5. Server-side validation ─────────────────────────────────
  if (hero.hp <= 0) {
    return NextResponse.json(
      { error: 'You are dead. Use Revive instead.' },
      { status: 400 }
    );
  }

  if (hero.hp >= effectiveMaxHp) {
    return NextResponse.json(
      { error: 'Already at full health.' },
      { status: 400 }
    );
  }

  if (hero.gold < HEAL_COST) {
    return NextResponse.json(
      { error: `Need ${HEAL_COST} gold to heal.` },
      { status: 400 }
    );
  }

  // ── 6. Atomic UPDATE — heal to effective max ──────────────────
  //
  // SET hp = $3 (effectiveMaxHp) instead of SET hp = max_hp.
  // This ensures the healer restores HP to the FULL amount
  // including skill tree, tome, and equipment bonuses.
  const { data: updated, error: updateErr } = await sqlOne(
    `UPDATE hero_stats
     SET hp = $3,
         gold = gold - $1,
         updated_at = NOW()
     WHERE player_id = $2
       AND gold >= $1
       AND hp < $3
     RETURNING hp, max_hp, gold`,
    [HEAL_COST, userId, effectiveMaxHp]
  );

  if (updateErr) throw updateErr;

  if (!updated) {
    return NextResponse.json(
      { error: 'Heal failed — state changed. Refresh and try again.' },
      { status: 409 }
    );
  }

  // ── 7. Return the EFFECTIVE max, not the base column ──────────
  return NextResponse.json({
    success: true,
    cost: HEAL_COST,
    updatedHero: {
      hp: updated.hp,
      maxHp: effectiveMaxHp,   // Full max including all bonuses
      gold: updated.gold,
    },
  });
}


// ── Export: rate-limited at 10 heals per minute ─────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'heal',
  idempotency: false, // Healing is naturally idempotent (hp = max_hp is stable)
});
