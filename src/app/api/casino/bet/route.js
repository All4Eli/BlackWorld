// ═══════════════════════════════════════════════════════════════════
// POST /api/casino/bet — Place a bet (coin flip, slots, high_low)
// ═══════════════════════════════════════════════════════════════════
//
// SECURITY ARCHITECTURE:
//   1. betAmount is parsed as integer, validated > 0, capped at 10000
//   2. gameType is validated against a whitelist (no client-side RNG)
//   3. Gold is locked with SELECT ... FOR UPDATE before the check
//   4. Deduction + RNG + payout happen inside one atomic transaction
//   5. No idempotency — each bet is intentionally a new action
//
// RACE CONDITION PREVENTION:
//   Without FOR UPDATE, 5 concurrent 100g bets from a 100g player:
//     TX1: reads gold=100, passes check, sets gold=0
//     TX2: reads gold=100, passes check, sets gold=0
//     TX3: reads gold=100, passes check, sets gold=0
//     → Player placed 500g of bets with only 100g.
//
//   With FOR UPDATE:
//     TX1: reads gold=100 (locks row), passes check, sets gold=0, COMMIT
//     TX2: reads gold=0 (waited for TX1), FAILS "Insufficient gold"
//     → Correct behavior.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction, sql } from '@/lib/db/pool';

// ── Game Definitions ────────────────────────────────────────────
// All game parameters are defined server-side. The client only
// chooses the game type and bet amount. The RNG and payout are
// calculated here, never on the client.
const GAMES = {
  coin_flip: { winChance: 0.48, multiplier: 2 },
  slots:     { winChance: 0.22, multiplier: 4 },
  high_low:  { winChance: 0.35, multiplier: 3 },
  dice:      { winChance: 0.15, multiplier: 5 },
  blackjack: { winChance: 0.42, multiplier: 2.5 },
};

const MAX_BET = 10000;
const MIN_BET = 1;


/**
 * @param {Request} request
 * @param {{ userId: string }} ctx - Injected by withMiddleware
 */
async function handlePost(request, { userId }) {
  const body = await request.json();
  const { betAmount, gameType } = body;

  // ── STEP 1: Strict input validation ───────────────────────────
  // Parse as integer to prevent floating-point shenanigans
  const parsedBet = parseInt(betAmount, 10);

  if (!Number.isFinite(parsedBet) || parsedBet < MIN_BET) {
    return NextResponse.json(
      { error: `Invalid bet amount. Minimum bet is ${MIN_BET}g.` },
      { status: 400 }
    );
  }

  if (parsedBet > MAX_BET) {
    return NextResponse.json(
      { error: `Maximum bet is ${MAX_BET.toLocaleString()}g.` },
      { status: 400 }
    );
  }

  // Validate game type against whitelist
  const game = GAMES[gameType];
  if (!game) {
    return NextResponse.json(
      { error: 'Unknown game type.' },
      { status: 400 }
    );
  }

  // ── STEP 2: Atomic transaction ────────────────────────────────
  // Everything happens inside a single PostgreSQL transaction with
  // FOR UPDATE row locking on hero_stats.
  const { data: result, error: txErr } = await transaction(async (client) => {
    // 2a. Lock the hero_stats row to serialize concurrent bets
    const { rows: heroRows } = await client.query(
      `SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [userId]
    );
    if (heroRows.length === 0) throw new Error('Player not found.');

    const currentGold = heroRows[0].gold;

    // 2b. Validate gold >= bet INSIDE the lock
    // This is the critical guard. Because we hold the FOR UPDATE lock,
    // no other transaction can read or modify this row until we COMMIT.
    if (currentGold < parsedBet) {
      throw new Error('Insufficient gold.');
    }

    // 2c. Server-side RNG — crypto-grade not needed for games,
    // but Math.random() is sufficient and not client-controllable.
    const roll = Math.random();
    const win = roll < game.winChance;

    // 2d. Calculate payout
    // Win:  player gets betAmount * multiplier (gross), net = (multiplier - 1) * bet
    // Loss: player loses betAmount, net = -betAmount
    const payout = win ? Math.floor(parsedBet * game.multiplier) : 0;
    const netChange = win ? payout - parsedBet : -parsedBet;
    const newGold = currentGold + netChange;

    // 2e. Apply the gold change atomically
    // The CHECK (gold >= 0) on hero_stats is our final safety net,
    // but we've already validated above so this should never trigger.
    const { rows: updatedRows } = await client.query(
      `UPDATE hero_stats SET gold = $1 WHERE player_id = $2 RETURNING gold`,
      [newGold, userId]
    );

    // 2f. Log to casino_history
    // NOTE: gameType must match the CHECK constraint:
    //   ('coin_flip','high_low','slots','dice','blackjack')
    // 'roulette' is NOT in the CHECK — we use 'high_low' or skip logging
    // for unsupported types. All our GAMES keys match the CHECK.
    await client.query(
      `INSERT INTO casino_history (player_id, game_type, wager, payout, result, roll_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        gameType,
        parsedBet,
        payout,
        win ? 'win' : 'loss',
        JSON.stringify({ roll: roll.toFixed(4), netChange }),
      ]
    );

    return {
      win,
      payout,
      netChange,
      gameType,
      roll: roll.toFixed(4),
      newGold: updatedRows[0].gold,
    };
  });

  // ── STEP 3: Handle transaction errors ─────────────────────────
  if (txErr) {
    const msg = txErr.message;
    const status = msg.includes('Insufficient') ? 400
                 : msg.includes('not found') ? 404
                 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // ── STEP 4: Return result for UI ──────────────────────────────
  // updatedHero.gold is the authoritative server balance.
  // The frontend calls updateHero(data.updatedHero) to merge it.
  return NextResponse.json({
    success: true,
    win: result.win,
    net_change: result.netChange,
    game_type: result.gameType,
    updatedHero: {
      gold: result.newGold,
    },
  });
}


// ── Export ───────────────────────────────────────────────────────
// idempotency: FALSE — each bet is a unique action, never cache/replay
// rateLimit: 'casino_bet' — prevents rapid-fire bot betting
export const POST = withMiddleware(handlePost, {
  rateLimit: 'casino_bet',
  idempotency: false,
});
