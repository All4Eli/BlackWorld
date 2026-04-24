// ═══════════════════════════════════════════════════════════════════
// GET  /api/player   — Load complete player state
// POST /api/player   — Initialize character (BOOT → CREATION → PLAYING)
// ═══════════════════════════════════════════════════════════════════
// This is the primary game-state endpoint. GET loads everything the
// client needs to render the dashboard. POST handles the one-time
// character creation flow.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as HeroDal from '@/lib/db/dal/hero';
import * as InventoryDal from '@/lib/db/dal/inventory';
import { sql, sqlOne } from '@/lib/db/pool';

/**
 * GET /api/player
 *
 * Fetches the complete game state for the authenticated player.
 * Returns normalized data — NO hero_data JSONB blob.
 *
 * Response shape:
 * {
 *   player: {
 *     username, email,
 *     stats: { level, xp, gold, hp, max_hp, ... },
 *     equipment: [ { slot, item_name, base_stats, ... } ],
 *     inventory: [ { inventory_id, item_name, quantity, ... } ],
 *     coven: { id, name, tag, role } | null
 *   } | null
 * }
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'You must be logged in.' },
      { status: 401 }
    );
  }

  // 1. Fetch hero stats
  const { data: stats, error: statsErr } = await HeroDal.getHeroStats(userId);

  if (statsErr) {
    console.error('[GET /api/player] Stats error:', statsErr.message);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load player data.' },
      { status: 500 }
    );
  }

  if (!stats) {
    // No hero_stats row — brand new player
    return NextResponse.json({ player: null });
  }

  // 2. Fetch player identity (username, email)
  const { data: identity } = await sqlOne(
    `SELECT username, email, created_at AS joined_at FROM players WHERE clerk_user_id = $1`,
    [userId]
  );

  // 3. Fetch equipment (all 8 slots with item details)
  const { data: equipment } = await InventoryDal.getEquipment(userId);

  // 4. Fetch inventory count (lightweight — full inventory loaded on demand)
  const { data: invCountRows } = await sqlOne(
    `SELECT COUNT(*)::int AS total FROM inventory WHERE player_id = $1`,
    [userId]
  );

  // 5. Fetch coven membership (if any)
  const { data: coven } = await sqlOne(
    `SELECT c.id, c.name, c.tag, cm.role
     FROM coven_members cm
     JOIN covens c ON cm.coven_id = c.id
     WHERE cm.player_id = $1`,
    [userId]
  );

  // 6. Build the response — clean, normalized, no JSONB blobs
  const player = {
    userId,
    username: identity?.username || 'Unknown',
    email: identity?.email,
    joinedAt: identity?.joined_at,
    stage: stats.stage,
    stats: {
      level: stats.level,
      xp: stats.xp,
      gold: stats.gold,
      bankBalance: stats.bank_balance,
      kills: stats.kills,
      deaths: stats.deaths,
      // Attributes
      str: stats.str,
      def: stats.def,
      dex: stats.dex,
      int: stats.int,
      vit: stats.vit,
      unspentPoints: stats.unspent_points,
      // Vitals
      hp: stats.hp,
      maxHp: stats.max_hp,
      mana: stats.mana,
      maxMana: stats.max_mana,
      baseDmg: stats.base_dmg,
      // Flasks
      flasks: stats.flasks,
      maxFlasks: stats.max_flasks,
      // Essence
      essence: stats.essence,
      maxEssence: stats.max_essence,
      essenceRegenAt: stats.essence_regen_at,
      // Skills
      skillPoints: stats.skill_points,
      skillPointsUnspent: stats.skill_points_unspent,
      learnedTomes: stats.learned_tomes,
      // Daily
      loginStreak: stats.login_streak,
      lastDailyClaim: stats.last_daily_claim,
    },
    equipment: (equipment || []).map(e => ({
      slot: e.slot,
      inventoryId: e.inventory_id,
      itemKey: e.item_key,
      itemName: e.custom_name || e.item_name,
      itemType: e.item_type,
      itemTier: e.custom_tier || e.item_tier,
      enhancement: e.enhancement,
      baseStats: e.base_stats,
      rolledStats: e.rolled_stats,
      levelRequired: e.level_required,
    })),
    inventoryCount: invCountRows?.total || 0,
    coven: coven
      ? { id: coven.id, name: coven.name, tag: coven.tag, role: coven.role }
      : null,
  };

  return NextResponse.json({ player });
}


/**
 * POST /api/player
 *
 * Handles character initialization. Only allowed during BOOT or CREATION stage.
 * The client sends intent (character name, starting choices), but the server
 * controls all actual stat values.
 *
 * Body: { stage: "PLAYING", name: "Darklord" }
 */
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'You must be logged in.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { stage, name } = body;

    if (!stage) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Stage is required.' },
        { status: 400 }
      );
    }

    // Check if hero exists
    const { data: existing } = await HeroDal.getHeroStats(userId);

    if (existing) {
      // Only allow stage transitions during character creation
      const allowedTransitions = ['BOOT', 'CREATION'];
      if (!allowedTransitions.includes(existing.stage) && stage !== existing.stage) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: `Cannot change stage from '${existing.stage}'.` },
          { status: 403 }
        );
      }

      // Update stage
      const { data: updated, error: updateErr } = await HeroDal.setStage(userId, stage);
      if (updateErr) throw updateErr;

      // Update username if provided during creation
      if (name && (existing.stage === 'BOOT' || existing.stage === 'CREATION')) {
        await sql(
          `UPDATE players SET username = $1, updated_at = now() WHERE clerk_user_id = $2`,
          [name, userId]
        );
      }

      return NextResponse.json({
        success: true,
        stage: updated.stage,
        message: `Character stage set to ${stage}.`,
      });
    } else {
      // No hero exists — this shouldn't happen (register creates hero_stats)
      // But handle gracefully just in case
      const { error: createErr } = await HeroDal.create(userId);
      if (createErr) throw createErr;

      const { data: fresh } = await HeroDal.setStage(userId, stage);

      return NextResponse.json({
        success: true,
        stage: fresh?.stage || stage,
        message: 'Character initialized.',
      });
    }
  } catch (err) {
    console.error('[POST /api/player]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}
