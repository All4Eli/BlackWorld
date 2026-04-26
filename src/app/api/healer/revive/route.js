// ═══════════════════════════════════════════════════════════════════
// POST /api/healer/revive — Resurrect from death for gold
// ═══════════════════════════════════════════════════════════════════
//
// EFFECTIVE MAX HP:
//   Same as /api/healer/heal — we must compute the true max HP
//   including skill tree, tome, and equipment bonuses before
//   setting the player's HP to full.
//
// ZOMBIE EXPLOIT PREVENTION:
//   The UPDATE WHERE clause includes `AND hp <= 0`.
//   Without this, a concurrent revive request could fire after the
//   player is already alive, deducting gold AGAIN without benefit.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sqlOne, sql } from '@/lib/db/pool';
import { calculateSkillBonuses, calculateTomeBonuses } from '@/lib/skillTree';

/**
 * Revive cost scales with player level:
 *   Math.floor((level * 10) * 0.1) + 10
 *   Level 1: floor(1) + 10 = 11 gold
 *   Level 10: floor(10) + 10 = 20 gold
 *   Level 50: floor(50) + 10 = 60 gold
 */
function calcReviveCost(level) {
  return Math.floor(((level || 1) * 10) * 0.1) + 10;
}

/**
 * @param {Request} request
 * @param {{ userId: string }} ctx - Injected by middleware after JWT verification
 */
async function handlePost(request, { userId }) {
  // ── 1. Pre-check current state ──────────────────────────────
  const { data: heroRow, error: heroErr } = await sqlOne(
    'SELECT hp, max_hp, gold, level, skill_points, learned_tomes FROM hero_stats WHERE player_id = $1',
    [userId]
  );

  if (heroErr || !heroRow) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  // ── 2. Zombie Guard (JS fast-fail) ─────────────────────────
  if (heroRow.hp > 0) {
    return NextResponse.json(
      { error: 'You are already alive.' },
      { status: 400 }
    );
  }

  const reviveCost = calcReviveCost(heroRow.level);

  if ((heroRow.gold || 0) < reviveCost) {
    return NextResponse.json(
      { error: `Need ${reviveCost} gold to revive.` },
      { status: 400 }
    );
  }

  // ── 3. Compute effective max HP (base + skills + tomes + gear)
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
      gearHpBonus += (row.base_stats?.hp || row.base_stats?.vit || 0)
                   + (row.rolled_stats?.hp || row.rolled_stats?.vit || 0);
    }
  }

  const skillBonuses = calculateSkillBonuses(heroRow.skill_points || {});
  const tomeBonuses = calculateTomeBonuses(heroRow.learned_tomes || []);
  const effectiveMaxHp = heroRow.max_hp
    + (skillBonuses.maxHp || 0)
    + (tomeBonuses.flatHp || 0)
    + gearHpBonus;

  // ── 4. Atomic UPDATE with ZOMBIE GUARD ──────────────────────
  const { data: updated, error: updateErr } = await sqlOne(
    `UPDATE hero_stats
     SET hp = $3,
         gold = gold - $1,
         updated_at = NOW()
     WHERE player_id = $2
       AND gold >= $1
       AND hp <= 0
     RETURNING hp, max_hp, gold`,
    [reviveCost, userId, effectiveMaxHp]
  );

  if (updateErr) throw updateErr;

  if (!updated) {
    return NextResponse.json(
      { error: 'Revive failed — state changed. Try again.' },
      { status: 409 }
    );
  }

  // ── 5. Return effective max ─────────────────────────────────
  return NextResponse.json({
    success: true,
    cost: reviveCost,
    updatedHero: {
      hp: updated.hp,
      maxHp: effectiveMaxHp,
      gold: updated.gold,
    },
  });
}


// ── Export: rate-limited via 'heal' bucket ───────────────────────
export const POST = withMiddleware(handlePost, {
  rateLimit: 'heal',
  idempotency: false,
});
