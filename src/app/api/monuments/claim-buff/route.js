// ═══════════════════════════════════════════════════════════════════
// POST /api/monuments/claim-buff — Claim a completed monument's buff
// ═══════════════════════════════════════════════════════════════════
//
// When a monument reaches 100% completion, all players who contributed
// can claim the passive buff. The buff is stored in player_buffs and
// is permanent (no expiry) — it integrates with calcCombatStats via
// the hero.activeBuffs array.
//
// IDEMPOTENCY: Claiming the same buff twice is safe — the INSERT uses
// ON CONFLICT DO NOTHING to silently skip duplicates.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction } from '@/lib/db/pool';

const MONUMENT_BUFFS = {
  obsidian_obelisk:   { maxHp: 25 },
  crimson_forge:      { baseDmg: 5 },
  veil_of_shadows:    { damageReduction: 3 },
  blood_fountain:     { lifesteal: 2 },
  warden_spire:       { critChance: 3 },
};


async function handlePost(request, { userId }) {
  const body = await request.json();
  const { monumentId } = body;

  if (!monumentId || typeof monumentId !== 'string') {
    return NextResponse.json({ error: 'Missing monumentId.' }, { status: 400 });
  }

  const { data: result, error: txErr } = await transaction(async (client) => {
    // 1. Verify monument is completed
    const { rows: monRows } = await client.query(
      `SELECT id, key, name, buff_key
       FROM monuments
       WHERE id = $1 AND status = 'completed'`,
      [monumentId]
    );
    if (monRows.length === 0) {
      throw new Error('Monument not found or not yet completed.');
    }
    const monument = monRows[0];

    // 2. Verify player contributed (only contributors get the buff)
    const { rows: contribRows } = await client.query(
      `SELECT total_donated FROM monument_contributions
       WHERE monument_id = $1 AND player_id = $2`,
      [monumentId, userId]
    );
    if (contribRows.length === 0) {
      throw new Error('You must contribute to this monument before claiming the buff.');
    }

    // 3. Grant the buff (ON CONFLICT = idempotent — safe to double-claim)
    const buffEffect = MONUMENT_BUFFS[monument.buff_key] || {};
    await client.query(
      `INSERT INTO player_buffs (player_id, buff_type, buff_name, effect, source)
       VALUES ($1, $2, $3, $4, 'monument')
       ON CONFLICT (player_id, buff_type, source) DO NOTHING`,
      [
        userId,
        `monument_${monument.key}`,
        `${monument.name} Blessing`,
        JSON.stringify(buffEffect),
      ]
    );

    return {
      monumentName: monument.name,
      buffKey: monument.buff_key,
      buffEffect,
      contributed: contribRows[0].total_donated,
    };
  });

  if (txErr) {
    const msg = txErr.message;
    const status = msg.includes('not found') || msg.includes('not yet') ? 404
                 : msg.includes('must contribute') ? 403
                 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({
    success: true,
    message: `You received the ${result.monumentName} Blessing!`,
    buff: result.buffEffect,
    contributed: result.contributed,
  });
}


export const POST = withMiddleware(handlePost, {
  rateLimit: 'premium',
  idempotency: true,
});
