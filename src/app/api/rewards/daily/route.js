// ═══════════════════════════════════════════════════════════════════
// POST /api/rewards/daily — Claim daily login reward + streak tracking
// ═══════════════════════════════════════════════════════════════════
//
// DAILY REWARD SYSTEM:
//
//   Players can claim a reward ONCE per UTC calendar day.
//   Consecutive daily claims build a "streak" counter.
//   The streak determines the reward tier (higher streak = better loot).
//
//   HOW THE STREAK MATH WORKS:
//
//     Case 1: Player claimed YESTERDAY → streak continues
//       last_daily_claim = 2026-04-24
//       CURRENT_DATE      = 2026-04-25
//       Difference: 1 day → streak_current + 1
//
//     Case 2: Player claimed TODAY → already claimed, reject
//       last_daily_claim = 2026-04-25
//       CURRENT_DATE      = 2026-04-25
//       Difference: 0 days → error
//
//     Case 3: Player missed a day → streak resets
//       last_daily_claim = 2026-04-23
//       CURRENT_DATE      = 2026-04-25
//       Difference: 2 days → streak resets to 1
//
//   WHY USE CURRENT_DATE (SERVER TIME) AND NOT CLIENT TIME?
//     The client's clock can be set to any time. A player could
//     set their clock to tomorrow and claim twice in one real day.
//     CURRENT_DATE is the PostgreSQL server's UTC date, which is
//     tamper-proof and consistent across all players worldwide.
//
// ─── TABLE SCHEMA: player_login_calendar ────────────────────────
//
//   PRIMARY KEY (player_id, year_month)
//   player_id TEXT         — FK to players
//   year_month TEXT         — e.g., '2026-04'
//   days_logged INTEGER     — total days claimed this month
//   login_days INTEGER[]    — array of day numbers [1, 3, 5, 6, ...]
//   streak_current INTEGER  — current consecutive streak
//   streak_best INTEGER     — longest streak ever this month
//   monthly_reward_claimed BOOLEAN — has the monthly bonus been claimed
//
// ─── TABLE SCHEMA: hero_stats (columns used) ────────────────────
//
//   last_daily_claim DATE   — the last UTC date the player claimed
//   login_streak INTEGER    — running streak counter (cross-month)
//   blood_stones INTEGER    — premium currency (reward)
//   gold INTEGER            — base currency (reward)
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction } from '@/lib/db/pool';


// ── STREAK REWARD TIERS ─────────────────────────────────────────
//
// Array index = streak day (0-indexed, but streak starts at 1).
// We use (streak - 1) to map into this array.
//
// Each tier gives progressively better rewards to incentivize
// consecutive daily logins. The array wraps at length 7 using
// the modulo operator (%), creating a weekly cycle.
//
// JAVASCRIPT DETAIL — Array indexing with modulo:
//   DAILY_REWARDS[(streak - 1) % 7]
//
//   streak=1 → (0) % 7 = 0 → DAILY_REWARDS[0] → { gold: 500, bs: 5 }
//   streak=7 → (6) % 7 = 6 → DAILY_REWARDS[6] → { gold: 2000, bs: 25 }
//   streak=8 → (7) % 7 = 0 → DAILY_REWARDS[0] → cycle repeats
//
//   The % (modulo) operator returns the remainder of division:
//     7 % 7 = 0, 8 % 7 = 1, 14 % 7 = 0
//   This creates an infinite repeating cycle without ever going
//   out of bounds on the array.
const DAILY_REWARDS = [
  { gold: 500,  bloodStones: 5,  label: 'Day 1 — Meager Offering' },
  { gold: 750,  bloodStones: 5,  label: 'Day 2 — Dark Tribute' },
  { gold: 1000, bloodStones: 8,  label: 'Day 3 — Blood Tithe' },
  { gold: 1250, bloodStones: 10, label: 'Day 4 — Shadow\'s Gift' },
  { gold: 1500, bloodStones: 12, label: 'Day 5 — Crimson Bounty' },
  { gold: 1750, bloodStones: 15, label: 'Day 6 — Abyssal Reward' },
  { gold: 2000, bloodStones: 25, label: 'Day 7 — Blood Moon Jackpot' },
];


/**
 * @param {Request} request
 * @param {{ userId: string }} ctx — injected by withMiddleware after JWT auth
 */
async function handlePost(request, { userId }) {

  // ── Atomic daily claim transaction ────────────────────────────
  const { data, error } = await transaction(async (client) => {

    // ── STEP 1: Lock the player's hero_stats row ────────────────
    //
    // FOR UPDATE locks this row exclusively. While locked, no other
    // transaction can read it with FOR UPDATE (they queue up).
    //
    // This prevents a double-claim exploit:
    //   - Player sends two POST requests at the same millisecond
    //   - Without locking, both read last_daily_claim = yesterday
    //   - Both increment streak and grant rewards
    //   - Player gets 2x rewards
    //
    // With FOR UPDATE, the second request waits until the first
    // commits, then reads the UPDATED last_daily_claim = today,
    // and correctly rejects with "already claimed."
    //
    // CASTING — last_daily_claim::DATE:
    //   The column is already DATE type, but we cast explicitly
    //   for clarity and to handle any timezone edge cases.
    //   DATE in PostgreSQL is a calendar date (no time component):
    //     '2026-04-25' — just year, month, day.
    const { rows: heroRows } = await client.query(
      `SELECT
         last_daily_claim,
         COALESCE(login_streak, 0) AS login_streak,
         COALESCE(gold, 0) AS gold,
         COALESCE(blood_stones, 0) AS blood_stones
       FROM hero_stats
       WHERE player_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (heroRows.length === 0) {
      throw new Error('Player not found.');
    }

    const hero = heroRows[0];

    // ── STEP 2: Check if already claimed today ──────────────────
    //
    // CURRENT_DATE is a PostgreSQL built-in constant that returns
    // the current UTC calendar date (e.g., '2026-04-25').
    //
    // We compare last_daily_claim to CURRENT_DATE in SQL, not in
    // JS, to avoid timezone discrepancies between the Node.js
    // server and the PostgreSQL server.
    //
    // The subquery returns a single boolean:
    //   TRUE if last_daily_claim = today → already claimed
    //   FALSE or NULL if not → eligible to claim
    if (hero.last_daily_claim) {
      const { rows: checkRows } = await client.query(
        `SELECT (last_daily_claim = CURRENT_DATE) AS already_claimed
         FROM hero_stats WHERE player_id = $1`,
        [userId]
      );

      if (checkRows[0]?.already_claimed === true) {
        throw new Error('You have already signed the Blood Pact today.');
      }
    }

    // ── STEP 3: Calculate the new streak ────────────────────────
    //
    // POSTGRESQL DATE ARITHMETIC:
    //
    //   CURRENT_DATE - last_daily_claim::DATE
    //   → Returns an INTEGER representing the number of days between
    //     the two dates. PostgreSQL natively supports date subtraction.
    //
    //   Examples:
    //     '2026-04-25' - '2026-04-24' = 1  (consecutive)
    //     '2026-04-25' - '2026-04-23' = 2  (missed a day)
    //     '2026-04-25' - '2026-04-25' = 0  (same day — already caught above)
    //
    //   INTERVAL '1 day':
    //     In PostgreSQL, INTERVAL represents a duration of time.
    //     '1 day' is exactly one calendar day. When you compare
    //     a date difference to 1, you're asking:
    //     "Was the last claim exactly yesterday?"
    //
    // STREAK LOGIC:
    //   If daysDiff === 1 → claim was yesterday → continue streak
    //   If daysDiff > 1  → missed at least one day → reset to 1
    //   If daysDiff === null → first ever claim → start at 1
    let daysDiff = null;
    let newStreak = 1; // default: fresh streak

    if (hero.last_daily_claim) {
      const { rows: diffRows } = await client.query(
        `SELECT (CURRENT_DATE - $1::DATE) AS days_diff`,
        [hero.last_daily_claim]
      );
      daysDiff = diffRows[0]?.days_diff;

      // daysDiff === 1 means the last claim was EXACTLY yesterday.
      // Any other value (2, 3, 30, etc.) means the streak is broken.
      if (daysDiff === 1) {
        // Consecutive! Increment the existing streak.
        newStreak = hero.login_streak + 1;
      }
      // else: daysDiff > 1 → streak resets to 1 (already set above)
    }
    // else: hero.last_daily_claim is NULL → first ever claim → streak = 1

    // ── STEP 4: Determine reward tier ───────────────────────────
    //
    // (newStreak - 1) % DAILY_REWARDS.length
    //   Streak 1 → index 0, Streak 7 → index 6, Streak 8 → index 0
    //
    // % (modulo): returns the remainder of integer division.
    // This creates a repeating cycle through the rewards array.
    //
    // Math.max(0, ...): safety net — if newStreak is somehow 0
    // (shouldn't happen), index becomes 0 instead of -1.
    const rewardIndex = Math.max(0, (newStreak - 1) % DAILY_REWARDS.length);
    const reward = DAILY_REWARDS[rewardIndex];

    // ── STEP 5: Grant rewards + update hero_stats ───────────────
    //
    // Single UPDATE that:
    //   1. Adds gold and blood stones
    //   2. Sets the new streak counter
    //   3. Sets last_daily_claim to CURRENT_DATE
    //
    // gold = gold + $1: SQL arithmetic — atomic, no read-then-write.
    // COALESCE(blood_stones, 0) + $2: handles NULL blood_stones
    //   for legacy players. COALESCE(NULL, 0) = 0, then 0 + 5 = 5.
    //
    // RETURNING: returns the updated row in the same query,
    //   eliminating the need for a separate SELECT after the UPDATE.
    const { rows: updatedRows } = await client.query(
      `UPDATE hero_stats
       SET gold = gold + $1,
           blood_stones = COALESCE(blood_stones, 0) + $2,
           login_streak = $3,
           last_daily_claim = CURRENT_DATE,
           updated_at = NOW()
       WHERE player_id = $4
       RETURNING gold, blood_stones, login_streak, last_daily_claim`,
      [reward.gold, reward.bloodStones, newStreak, userId]
    );

    if (updatedRows.length === 0) {
      throw new Error('Failed to update daily reward.');
    }

    const updatedHero = updatedRows[0];

    // ── STEP 6: Log the Blood Stone grant in the audit trail ────
    //
    // Every Blood Stone change is recorded in blood_stone_transactions.
    // Positive amount = grant (daily login reward).
    // Negative amount = deduction (premium shop purchase).
    //
    // This creates a complete, auditable history of every Blood
    // Stone earned and spent.
    await client.query(
      `INSERT INTO blood_stone_transactions
         (player_id, amount, balance_after, source, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        reward.bloodStones,             // Positive = grant
        updatedHero.blood_stones,        // Balance AFTER grant
        'daily_login',                   // Source identifier
        `${reward.label} (Streak: ${newStreak})`,
      ]
    );

    // ── STEP 7: UPSERT the monthly login calendar ───────────────
    //
    // INSERT ... ON CONFLICT (player_id, year_month) DO UPDATE
    //
    // This is an UPSERT (portmanteau of UPDATE + INSERT):
    //   - If this is the player's FIRST claim this month → INSERT
    //   - If they already have a row for this month → UPDATE
    //
    // WHY UPSERT INSTEAD OF SEPARATE INSERT/UPDATE?
    //   Without UPSERT, you'd need:
    //     1. SELECT to check if the row exists
    //     2. If no: INSERT
    //     3. If yes: UPDATE
    //   This is 2-3 queries and has a race condition (between the
    //   SELECT and INSERT, another request could INSERT first).
    //   UPSERT is a single atomic query — no race condition.
    //
    // SQL DETAIL — TO_CHAR(CURRENT_DATE, 'YYYY-MM'):
    //   Formats the current date as a year-month string.
    //   CURRENT_DATE = 2026-04-25 → TO_CHAR → '2026-04'
    //   This becomes the year_month partition key.
    //
    // SQL DETAIL — EXTRACT(DAY FROM CURRENT_DATE):
    //   Returns the day-of-month as an integer.
    //   2026-04-25 → 25
    //   This is added to the login_days array.
    //
    // SQL DETAIL — array_append(login_days, $value):
    //   PostgreSQL's built-in function to add an element to the end
    //   of an array. Unlike JS Array.push(), this returns a NEW array
    //   (it's immutable/functional). The original array is not modified
    //   in place — the SET clause assigns the new array back.
    //
    //   login_days = '{1, 3, 5}' → array_append(login_days, 6) → '{1, 3, 5, 6}'
    //
    // SQL DETAIL — GREATEST(streak_best, $newStreak):
    //   Updates the monthly best streak only if the new streak
    //   exceeds the current best. GREATEST returns the larger of
    //   its two arguments.
    const yearMonth = new Date().toISOString().slice(0, 7); // '2026-04'
    const dayOfMonth = new Date().getUTCDate(); // 25

    await client.query(
      `INSERT INTO player_login_calendar
         (player_id, year_month, days_logged, login_days, streak_current, streak_best)
       VALUES ($1, $2, 1, ARRAY[$3], $4, $4)
       ON CONFLICT (player_id, year_month) DO UPDATE SET
         days_logged = player_login_calendar.days_logged + 1,
         login_days = CASE
           WHEN $3 = ANY(player_login_calendar.login_days)
             THEN player_login_calendar.login_days
           ELSE array_append(player_login_calendar.login_days, $3)
         END,
         streak_current = $4,
         streak_best = GREATEST(player_login_calendar.streak_best, $4)`,
      [userId, yearMonth, dayOfMonth, newStreak]
    );

    return {
      streak: newStreak,
      reward,
      dayOfMonth,
      yearMonth,
      updatedHero: {
        gold: updatedHero.gold,
        blood_stones: updatedHero.blood_stones,
        login_streak: updatedHero.login_streak,
      },
    };
  });

  // ── Handle transaction errors ───────────────────────────────
  if (error) {
    const msg = error.message;
    if (msg.includes('already signed') || msg.includes('already claimed')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error('[DAILY REWARD ERROR]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...data });
}


// ── Export: rate-limited + idempotent ────────────────────────────
//
// 'daily_reward' rate limit = 3 req/min:
//   This is intentionally low. Players should only click this ONCE
//   per day. The 3/min limit handles accidental double-clicks
//   while still preventing automated claim scripts.
//
// Idempotency = true:
//   If the network drops after the reward was granted but before
//   the response reached the client, the retry (with the same
//   X-Idempotency-Key) returns the original response without
//   granting a second reward.
export const POST = withMiddleware(handlePost, {
  rateLimit: 'daily_reward',
  idempotency: true,
});
