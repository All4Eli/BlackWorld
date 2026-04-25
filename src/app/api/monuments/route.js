// ═══════════════════════════════════════════════════════════════════
// GET  /api/monuments         — Fetch all active monuments + progress
// POST /api/monuments         — Donate resources to a monument
// ═══════════════════════════════════════════════════════════════════
//
// CONCURRENCY ARCHITECTURE:
//
//   Monuments are global shared-state objects. Dozens of players can
//   donate simultaneously. Without serialization:
//     Player A reads progress=990, donates 20 → writes 1010
//     Player B reads progress=990, donates 20 → writes 1010
//     → 40 resources donated, but progress only increased by 20.
//        Player A's contribution is silently lost.
//
//   WITH FOR UPDATE:
//     Player A locks monument row, reads 990, writes 1010, COMMIT
//     Player B waits, locks monument row, reads 1010, REJECTED (already complete)
//     → Correct behavior. Both contributions tracked independently.
//
//   OVER-CAP PREVENTION:
//     A monument requiring 1000 resources must NEVER reach 1001.
//     We use LEAST(current + donation, required) to clamp progress.
//     If progress reaches required, status flips to 'completed' inside
//     the same transaction — preventing double-completion.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { auth } from '@/lib/auth';
import { sql, sqlOne, transaction } from '@/lib/db/pool';


// ── Monument Buff Definitions (server-side truth) ───────────────
// These define the passive bonuses granted when a monument is completed.
// They bridge into calcCombatStats via the hero.activeBuffs array.
const MONUMENT_BUFFS = {
  obsidian_obelisk:   { maxHp: 25, desc: '+25 Max HP (server-wide)' },
  crimson_forge:      { baseDmg: 5, desc: '+5 Base Damage (server-wide)' },
  veil_of_shadows:    { damageReduction: 3, desc: '+3 Damage Reduction (server-wide)' },
  blood_fountain:     { lifesteal: 2, desc: '+2% Lifesteal (server-wide)' },
  warden_spire:       { critChance: 3, desc: '+3% Crit Chance (server-wide)' },
};

const MAX_DONATION_PER_TX = 5000; // Prevents a single whale from over-contributing
const MIN_DONATION = 1;


/**
 * GET /api/monuments — Fetch active monuments + leaderboards
 *
 * Returns:
 *   { monuments: [ { id, name, ..., progress, required, contributors: [...] } ] }
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch all monuments (active + recently completed for display)
    const { data: monuments } = await sql(
      `SELECT id, key, name, description, resource_type, 
              current_progress, required_amount, status,
              buff_key, completed_at, created_at
       FROM monuments
       WHERE status IN ('building', 'completed')
       ORDER BY 
         CASE status WHEN 'building' THEN 0 ELSE 1 END,
         created_at DESC`
    );

    if (!monuments || monuments.length === 0) {
      return NextResponse.json({ monuments: [] });
    }

    // 2. Fetch top 10 contributors for each monument
    const monumentIds = monuments.map(m => m.id);
    const { data: contributions } = await sql(
      `SELECT mc.monument_id, mc.player_id, mc.total_donated,
              p.username
       FROM monument_contributions mc
       JOIN players p ON p.clerk_user_id = mc.player_id
       WHERE mc.monument_id = ANY($1)
       ORDER BY mc.total_donated DESC`,
      [monumentIds]
    );

    // 3. Fetch the requesting player's own contributions
    const { data: myContribs } = await sql(
      `SELECT monument_id, total_donated
       FROM monument_contributions
       WHERE player_id = $1 AND monument_id = ANY($2)`,
      [userId, monumentIds]
    );

    // 4. Build response
    const contribMap = {};
    (contributions || []).forEach(c => {
      if (!contribMap[c.monument_id]) contribMap[c.monument_id] = [];
      if (contribMap[c.monument_id].length < 10) {
        contribMap[c.monument_id].push({
          playerId: c.player_id,
          username: c.username,
          donated: c.total_donated,
        });
      }
    });

    const myContribMap = {};
    (myContribs || []).forEach(c => {
      myContribMap[c.monument_id] = c.total_donated;
    });

    const enriched = monuments.map(m => ({
      id: m.id,
      key: m.key,
      name: m.name,
      description: m.description,
      resourceType: m.resource_type,
      progress: m.current_progress,
      required: m.required_amount,
      percent: Math.min(100, Math.round((m.current_progress / m.required_amount) * 100)),
      status: m.status,
      buffKey: m.buff_key,
      buffDesc: MONUMENT_BUFFS[m.buff_key]?.desc || null,
      completedAt: m.completed_at,
      topContributors: contribMap[m.id] || [],
      myContribution: myContribMap[m.id] || 0,
    }));

    return NextResponse.json({ monuments: enriched });
  } catch (err) {
    console.error('[GET /api/monuments]', err);
    return NextResponse.json({ monuments: [] });
  }
}


/**
 * POST /api/monuments — Donate resources to a monument
 *
 * Body: { monumentId: "uuid", amount: 500 }
 *
 * SECURITY:
 *   - amount is validated as integer > 0, capped at MAX_DONATION_PER_TX
 *   - resourceType is read from the monument row (server-side), not the client
 *   - Both hero_stats AND monuments rows are locked with FOR UPDATE
 *   - Progress clamped with LEAST(current + amount, required)
 *   - Status transition guarded by WHERE status = 'building'
 */
async function handlePost(request, { userId }) {
  const body = await request.json();
  const { monumentId, amount } = body;

  // ── Input validation ──────────────────────────────────────────
  if (!monumentId || typeof monumentId !== 'string') {
    return NextResponse.json({ error: 'Missing monumentId.' }, { status: 400 });
  }

  const parsedAmount = parseInt(amount, 10);
  if (!Number.isFinite(parsedAmount) || parsedAmount < MIN_DONATION) {
    return NextResponse.json({ error: `Minimum donation is ${MIN_DONATION}.` }, { status: 400 });
  }
  if (parsedAmount > MAX_DONATION_PER_TX) {
    return NextResponse.json(
      { error: `Maximum donation per transaction is ${MAX_DONATION_PER_TX.toLocaleString()}.` },
      { status: 400 }
    );
  }

  // ── Atomic transaction ────────────────────────────────────────
  const { data: result, error: txErr } = await transaction(async (client) => {
    // 1. Lock the monument row — serialize all concurrent donations
    //    WHERE status = 'building' prevents donating to completed monuments.
    //    This is the critical double-completion guard:
    //      TX1: Reads progress=990, donates 10 → 1000, sets status='completed', COMMIT
    //      TX2: Waits for lock, reads status='completed' → 0 rows → throws
    const { rows: monRows } = await client.query(
      `SELECT id, key, name, resource_type, current_progress, required_amount, buff_key
       FROM monuments
       WHERE id = $1 AND status = 'building'
       FOR UPDATE`,
      [monumentId]
    );
    if (monRows.length === 0) {
      throw new Error('Monument not found or already completed.');
    }
    const monument = monRows[0];

    // 2. Calculate the actual accepted donation (capped at remaining)
    const remaining = monument.required_amount - monument.current_progress;
    const actualDonation = Math.min(parsedAmount, remaining);

    if (actualDonation <= 0) {
      throw new Error('This monument is already fully funded.');
    }

    // 3. Lock hero_stats and validate resources
    const { rows: heroRows } = await client.query(
      `SELECT gold, essence, blood_stones FROM hero_stats
       WHERE player_id = $1 FOR UPDATE`,
      [userId]
    );
    if (heroRows.length === 0) throw new Error('Player not found.');
    const hero = heroRows[0];

    // Determine which resource to deduct based on monument's resource_type
    const resourceType = monument.resource_type; // 'gold', 'essence', or 'blood_stones'
    const currentResource = hero[resourceType] || 0;

    if (currentResource < actualDonation) {
      throw new Error(`Insufficient ${resourceType}. You have ${currentResource} but need ${actualDonation}.`);
    }

    // 4. Deduct player resources atomically
    const { rows: updatedHeroRows } = await client.query(
      `UPDATE hero_stats
       SET ${resourceType} = GREATEST(0, ${resourceType} - $1)
       WHERE player_id = $2 AND ${resourceType} >= $1
       RETURNING gold, essence, COALESCE(blood_stones, 0) AS blood_stones`,
      [actualDonation, userId]
    );
    if (updatedHeroRows.length === 0) {
      throw new Error(`Insufficient ${resourceType} (concurrent deduction detected).`);
    }

    // 5. Increment monument progress (clamped with LEAST)
    const newProgress = monument.current_progress + actualDonation;
    const clampedProgress = Math.min(newProgress, monument.required_amount);
    const justCompleted = clampedProgress >= monument.required_amount;

    await client.query(
      `UPDATE monuments
       SET current_progress = LEAST(current_progress + $1, required_amount),
           status = CASE
             WHEN LEAST(current_progress + $1, required_amount) >= required_amount
             THEN 'completed'
             ELSE status
           END,
           completed_at = CASE
             WHEN LEAST(current_progress + $1, required_amount) >= required_amount
             THEN NOW()
             ELSE completed_at
           END
       WHERE id = $2`,
      [actualDonation, monumentId]
    );

    // 6. Track contributor (UPSERT — add to existing contribution)
    await client.query(
      `INSERT INTO monument_contributions (monument_id, player_id, total_donated)
       VALUES ($1, $2, $3)
       ON CONFLICT (monument_id, player_id)
       DO UPDATE SET total_donated = monument_contributions.total_donated + $3,
                     updated_at = NOW()`,
      [monumentId, userId, actualDonation]
    );

    return {
      actualDonation,
      clampedProgress,
      required: monument.required_amount,
      justCompleted,
      buffKey: monument.buff_key,
      buffDesc: justCompleted ? (MONUMENT_BUFFS[monument.buff_key]?.desc || null) : null,
      monumentName: monument.name,
      updatedHero: {
        gold: updatedHeroRows[0].gold,
        essence: updatedHeroRows[0].essence,
        bloodStones: updatedHeroRows[0].blood_stones,
      },
    };
  });

  // ── Handle errors ─────────────────────────────────────────────
  if (txErr) {
    const msg = txErr.message;
    const status = msg.includes('not found') || msg.includes('completed') ? 404
                 : msg.includes('Insufficient') ? 400
                 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // ── Return result ─────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    donated: result.actualDonation,
    progress: result.clampedProgress,
    required: result.required,
    percent: Math.min(100, Math.round((result.clampedProgress / result.required) * 100)),
    justCompleted: result.justCompleted,
    buffDesc: result.buffDesc,
    monumentName: result.monumentName,
    updatedHero: result.updatedHero,
  });
}


export const POST = withMiddleware(handlePost, {
  rateLimit: 'bank',
  idempotency: true,
});
