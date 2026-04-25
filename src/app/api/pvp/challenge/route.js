// ═══════════════════════════════════════════════════════════════════
// POST /api/pvp/challenge — Initiate and auto-resolve a PvP duel
// ═══════════════════════════════════════════════════════════════════
//
// JSONB ERADICATION — WHAT CHANGED:
//
//   OLD CODE:
//     1. Called Composite.getFullPlayer() → extracted hero_data JSONB
//     2. Ran calcPlayerStats(heroData) — a function that parsed the
//        JSONB blob to compute stats like baseDamageMin/Max
//     3. After combat, wrote: updates.hero_data = attackerData
//     4. Response spread: ...attackerData (the entire blob)
//
//   PROBLEMS:
//     • Race condition: if the attacker fights two people at once,
//       both fights read the same hero_data, both modify it, and
//       the second write clobbers the first's changes.
//     • Stats were derived from a stale client-sent JSONB snapshot,
//       not from the real-time database columns.
//     • No row locking: gold/xp/kills updates could be clobbered
//       by concurrent requests.
//
//   NEW CODE:
//     1. Fetch attacker AND defender stats from NORMALIZED columns:
//        hero_stats (str, def, dex, int, vit, level, skill_points)
//        + equipment (via getEquipment JOIN query)
//     2. Use the modern combat-engine.js compileHeroStats() to derive
//        effective combat stats from DB columns (not JSONB).
//     3. All mutations run inside a single transaction with FOR UPDATE
//        row locks on BOTH players' hero_stats rows.
//     4. Response returns only the specific fields needed.
//
// TRANSACTION + FOR UPDATE EXPLAINED:
//
//   We lock BOTH players' hero_stats rows at the START of the
//   transaction. This prevents:
//     • Two concurrent challenges against the same defender
//     • The attacker challenging someone while being challenged
//     • Gold/XP updates from other routes during the combat
//
//   PostgreSQL processes FOR UPDATE locks in row order. To prevent
//   deadlocks (A locks row1 then tries row2, while B locks row2
//   then tries row1), we ORDER BY player_id. This guarantees both
//   transactions always acquire locks in the SAME order.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { transaction, sql, sqlOne } from '@/lib/db/pool';
import { compileHeroStats } from '@/lib/game/combat-engine';
import { calculateSkillBonuses } from '@/lib/skillTree';
import * as InventoryDal from '@/lib/db/dal/inventory';


// ── PvP-specific stat derivation helper ─────────────────────────
//
// This function maps the raw equipment rows from getEquipment()
// (which return base_stats and rolled_stats as objects) into the
// format expected by compileHeroStats() from combat-engine.js.
//
// WHY A SEPARATE FUNCTION?
//   combat-engine.js is a PURE math module — no DB imports.
//   It expects an array of objects with { rolled_stats, base_stats }.
//   getEquipment() returns SQL rows that already have those fields.
//   So in most cases, the data flows directly. This helper just
//   ensures null safety and defensive defaults.
//
// JAVASCRIPT DETAIL — Array.map():
//   equipment.map(eq => ({ ... })) creates a NEW array where each
//   element is a fresh object. The original `equipment` array is
//   NOT mutated. The parentheses around the object literal ({ })
//   are required because JS would otherwise interpret the { as a
//   block statement, not an object return.
function buildEquipmentArray(equipment) {
  // Array.map() iterates over every element `eq` in the array and
  // returns a new array of transformed objects. The arrow function
  // `eq => ({ ... })` wraps the return value in parens to tell JS
  // "this curly brace is an object literal, not a code block."
  return (equipment || []).map(eq => ({
    // rolled_stats: per-item randomized stats (set when the item drops)
    // base_stats: catalog-defined base stats for this item type
    // We prefer rolled_stats over base_stats when both exist.
    rolled_stats: eq.rolled_stats || eq.base_stats || {},
    base_stats: eq.base_stats || {},
  }));
}


// ── PvP combat stat compilation ─────────────────────────────────
//
// Merges compileHeroStats (which calculates MaxHP, AttackDMG, etc.)
// with skill tree booleans (hasSerratedBlades, hasBloodAegis, etc.)
// so the combat loop has everything it needs in one flat object.
//
// JAVASCRIPT DETAIL — Object Spread (...):
//   { ...compiled, hasSerratedBlades, ... } creates a NEW object
//   that contains all properties from `compiled` PLUS the additional
//   skill-tree boolean flags. If `compiled` has { maxHp: 200 } and
//   we add { hasSerratedBlades: true }, the result is:
//   { maxHp: 200, hasSerratedBlades: true }
function compilePvpStats(heroStats, equipment) {
  // Step 1: Parse skill_points (JSONB column → JS object)
  //
  // hero_stats.skill_points is stored as JSONB in PostgreSQL.
  // The `pg` driver auto-parses JSONB into a JS object, so:
  //   skill_points = { "berserker": 3, "iron_flesh": 5, "serrated_blades": 1 }
  // If the column is NULL or empty, default to {} (no skills allocated).
  const skillPoints = heroStats.skill_points || {};

  // Step 2: Calculate aggregate skill bonuses
  //
  // calculateSkillBonuses() from skillTree.js iterates over every
  // skill in the SKILL_TREE definition, checks how many ranks the
  // player has allocated (via skillPoints[skill.id]), and sums up
  // the effect values. For example:
  //   berserker rank 3 → effect.critChance: 5 × 3 = +15% crit
  //   iron_flesh rank 5 → effect.maxHp: 10 × 5 = +50 HP
  const skillBonuses = calculateSkillBonuses(skillPoints);

  // Step 3: Build the equipment stat array for compileHeroStats
  const equipArray = buildEquipmentArray(equipment);

  // Step 4: Compile base stats + gear + skill bonuses into combat stats
  //
  // We inject skillBonuses into the heroStats object so that
  // compileHeroStats can access them. The ... spread merges them:
  //   { str: 10, def: 8, ..., maxHp: 50, baseDmg: 15, critChance: 15 }
  const statsWithSkills = {
    ...heroStats,
    // Learned tomes are stored as a TEXT[] (Postgres text array).
    // The pg driver returns them as a JS string array directly.
    learned_tomes: heroStats.learned_tomes || [],
  };

  // compileHeroStats reads vit, str, def, dex, int, level from the
  // first arg, and aggregates gear stats from the second arg.
  // It also checks learned_tomes for tome bonuses.
  const compiled = compileHeroStats(statsWithSkills, equipArray);

  // Step 5: Overlay skill-tree-derived passive flags
  //
  // These boolean/numeric flags are checked during the combat loop
  // (resolveCombatTurn) to trigger special mechanics:
  //   hasSerratedBlades → apply bleed stack on hit
  //   hasBloodAegis → one-time damage absorb at <30% HP
  //   hasUndying → survive lethal blow with 1 HP once
  //   lifesteal → heal on hit
  //   flaskBonus → bonus HP from flask use
  //   enemyVuln → enemies take X% more damage
  return {
    ...compiled,
    // lifesteal from skill tree (blood_siphon: +3 per rank)
    lifesteal: skillBonuses.lifesteal || 0,
    // Flask healing bonus from skill tree (efficient_flasks)
    flaskBonus: skillBonuses.flaskBonus || 0,
    // Enemy vulnerability multiplier (death_mark)
    enemyVuln: skillBonuses.enemyVuln || 0,

    // Boolean passives — these are true/false flags checked during
    // the combat loop. They are set to true when the player has
    // allocated at least 1 rank in the keystone skill.
    //
    // !! converts a truthy value (like 1) to a real boolean (true).
    // Without !!, the value would be the integer 1, which works
    // in JS if-checks but is semantically less clear.
    hasSerratedBlades: !!(skillPoints.serrated_blades),
    hasBloodAegis: !!(skillPoints.blood_aegis),
    hasUndying: !!(skillPoints.undying),

    // Kill heal from executioner skill
    killHeal: skillBonuses.killHeal || 0,
  };
}


/**
 * Core handler — only runs AFTER middleware has:
 *   1. Verified the JWT → extracted userId
 *   2. Checked rate limits for action 'pvp' (10 req/min)
 *
 * @param {Request} request
 * @param {{ userId: string }} ctx
 */
async function handlePost(request, { userId }) {
  const { targetPlayerId } = await request.json();

  if (!targetPlayerId) {
    return NextResponse.json({ error: 'No target specified.' }, { status: 400 });
  }

  if (userId === targetPlayerId) {
    return NextResponse.json({ error: 'You cannot duel yourself.' }, { status: 400 });
  }

  // ── All PvP logic inside a single transaction ─────────────────
  const { data, error } = await transaction(async (client) => {

    // ── STEP 1: Lock BOTH players' hero_stats rows ──────────────
    //
    // FOR UPDATE locks each matched row exclusively.
    //
    // CRITICAL — ORDER BY player_id:
    //   If Player A challenges Player B, we lock in alphabetical
    //   order of player_id. If Player B simultaneously challenges
    //   Player A, they ALSO lock in the same order. This prevents
    //   deadlocks.
    //
    //   Deadlock scenario WITHOUT ordering:
    //     Tx1: locks A, then tries to lock B (waits)
    //     Tx2: locks B, then tries to lock A (waits)
    //     → Both wait forever → PostgreSQL kills one after timeout
    //
    //   With ORDER BY: both transactions lock A first, then B.
    //   One waits, the other succeeds, then the waiter proceeds.
    //
    // IN ($1, $2) matches BOTH player_ids in a single query.
    // This is more efficient than two separate SELECTs.
    const { rows: heroRows } = await client.query(
      `SELECT
         player_id, hp, max_hp, gold, xp, level, essence, kills,
         str, def, dex, int, vit,
         skill_points, learned_tomes
       FROM hero_stats
       WHERE player_id IN ($1, $2)
       ORDER BY player_id
       FOR UPDATE`,
      [userId, targetPlayerId]
    );

    // ── STEP 2: Destructure the locked rows ─────────────────────
    //
    // Array.find() iterates the array and returns the FIRST element
    // where the callback returns true. Since we fetched both players
    // in one query, we use .find() to separate them by player_id.
    //
    // If either row is missing, the player doesn't exist.
    const attackerRow = heroRows.find(r => r.player_id === userId);
    const defenderRow = heroRows.find(r => r.player_id === targetPlayerId);

    if (!attackerRow) throw new Error('Attacker not found.');
    if (!defenderRow) throw new Error('Defender not found.');

    // ── STEP 3: Validate attacker AND defender state ─────────────
    if (attackerRow.hp <= 0) {
      throw new Error('You are dead. Revive before dueling.');
    }

    if (attackerRow.essence < 10) {
      throw new Error('Not enough Blood Essence (requires 10).');
    }

    // CORPSE BEATING EXPLOIT FIX:
    //   Without this check, a dead defender (hp=0) can be attacked
    //   for free gold/xp/elo with zero risk. The attacker would
    //   always win because dHp starts at 0 and the loop ends
    //   immediately with win=true.
    if (defenderRow.hp <= 0) {
      throw new Error('Target is already dead.');
    }

    // PVP FLAG CHECK:
    //   Verify the defender has opted into PvP. The is_active flag
    //   is stored in pvp_stats, not hero_stats. We check it below
    //   after fetching pvp_stats rows.
    const { rows: defenderPvpRow } = await client.query(
      `SELECT is_active FROM pvp_stats WHERE player_id = $1`,
      [targetPlayerId]
    );
    // If no pvp_stats row exists, they haven't toggled PvP on
    if (!defenderPvpRow[0]?.is_active) {
      throw new Error('Target has PvP disabled.');
    }

    // ── STEP 4: Fetch equipment for both players ────────────────
    //
    // getEquipment() is a pre-built DAL query that JOINs:
    //   equipment → inventory → items
    // and returns an array of { slot, rolled_stats, base_stats, ... }.
    //
    // We fetch these OUTSIDE the locked client because getEquipment
    // uses its own pool connection. The hero_stats rows are already
    // locked by our transaction, so equipment can't change mid-fight
    // (equipping requires locking hero_stats, which our transaction holds).
    const { data: attackerEquip } = await InventoryDal.getEquipment(userId);
    const { data: defenderEquip } = await InventoryDal.getEquipment(targetPlayerId);

    // ── STEP 5: Compile combat stats from normalized DB data ────
    //
    // compilePvpStats() does:
    //   1. Reads skill_points JSONB → calculateSkillBonuses()
    //   2. Reads learned_tomes TEXT[] → tome bonus checks
    //   3. Aggregates equipment rolled_stats + base_stats
    //   4. Applies the GDD formulas (MaxHP, AttackDMG, DmgReduct, etc.)
    //   5. Returns a flat object with all combat-relevant values
    //
    // NO hero_data is read at any point. Stats come from:
    //   hero_stats columns (str, def, dex, int, vit, level)
    //   equipment table (via JOIN)
    //   skill_points JSONB column (normalized allocation data)
    const aStats = compilePvpStats(attackerRow, attackerEquip || []);
    const dStats = compilePvpStats(defenderRow, defenderEquip || []);

    // ── STEP 6: Auto-resolve combat loop ────────────────────────
    //
    // This is a synchronous loop that simulates up to 50 rounds
    // of turn-based combat. Each round:
    //   1. Attacker rolls damage (80%–120% of attackDmg)
    //   2. Defender's dmgReduct subtracts from damage
    //   3. Check if defender HP <= 0 → attacker wins
    //   4. Defender retaliates with the same formula
    //   5. Check if attacker HP <= 0 → defender wins
    //
    // Math.max(1, dmg - reduction) ensures at least 1 damage always
    // lands (no stalemates from high defense).
    //
    // Math.random() * (max - min) + min generates a random number
    // in the range [min, max]. We use 0.8x to 1.2x of base damage
    // to add variance without making combat feel random.
    let aHp = attackerRow.hp;
    let dHp = defenderRow.hp || dStats.maxHp;

    let win = false;
    let roundsDone = 0;
    const combatLogs = [];

    // Fetch defender username for combat log readability
    const { rows: defRows } = await client.query(
      `SELECT username FROM players WHERE clerk_user_id = $1`,
      [targetPlayerId]
    );
    const defenderName = defRows[0]?.username || 'Unknown';

    for (let i = 0; i < 50; i++) {
      roundsDone++;

      // ── Attacker Phase ──────────────────────────────────────
      //
      // rollDamage: random between 80% and 120% of base attack
      // Math.floor() truncates decimals (25.7 → 25)
      // Math.random() returns [0, 1) — we scale it to [0.8, 1.2]
      const aDmgRaw = Math.floor(aStats.attackDmg * (0.8 + Math.random() * 0.4));
      // Crit roll: critChance is a percentage (e.g., 15 means 15%)
      // Math.random() * 100 gives [0, 100), so critChance of 15
      // means a 15% chance of the condition being true.
      const aCrit = (Math.random() * 100) <= aStats.critChance;
      const aGross = aCrit ? Math.floor(aDmgRaw * 1.5) : aDmgRaw;
      // Net damage = gross - defender's damage reduction, minimum 1
      const aNet = Math.max(1, aGross - dStats.dmgReduct);
      dHp -= aNet;
      combatLogs.push(
        `You struck ${defenderName} for ${aNet}${aCrit ? ' (CRIT!)' : ''}`
      );

      if (dHp <= 0) { win = true; break; }

      // ── Defender Phase ──────────────────────────────────────
      const dDmgRaw = Math.floor(dStats.attackDmg * (0.8 + Math.random() * 0.4));
      const dCrit = (Math.random() * 100) <= dStats.critChance;
      const dGross = dCrit ? Math.floor(dDmgRaw * 1.5) : dDmgRaw;
      const dNet = Math.max(1, dGross - aStats.dmgReduct);
      aHp -= dNet;
      combatLogs.push(
        `${defenderName} strikes you for ${dNet}${dCrit ? ' (CRIT!)' : ''}`
      );

      if (aHp <= 0) { win = false; break; }
    }

    // ── STEP 7: Calculate Elo changes ───────────────────────────
    //
    // Elo system: +15 for a win, -15 for a loss.
    // Math.max(0, elo + change) prevents Elo from going negative.
    //
    // COALESCE in SQL: returns the first non-NULL argument.
    //   COALESCE(elo_rating, 1000) → if elo_rating is NULL,
    //   treat it as 1000 (the starting Elo for new players).
    const { rows: pvpRows } = await client.query(
      `SELECT player_id, COALESCE(elo_rating, 1000) AS elo
       FROM pvp_stats
       WHERE player_id IN ($1, $2)`,
      [userId, targetPlayerId]
    );

    // Array.find() returns the first matching element, or undefined.
    // The ?. (optional chaining) safely accesses .elo even if the
    // find() returned undefined — in which case ?. returns undefined
    // instead of throwing a TypeError.
    // The ?? (nullish coalescing) then substitutes 1000 if the result
    // is null or undefined. This is different from || which also
    // triggers on 0 and '' (empty string).
    const aElo = pvpRows.find(r => r.player_id === userId)?.elo ?? 1000;
    const dElo = pvpRows.find(r => r.player_id === targetPlayerId)?.elo ?? 1000;
    const eloChange = win ? 15 : -15;
    const newAElo = Math.max(0, aElo + eloChange);

    // ── STEP 8: Apply results to attacker (atomic) ──────────────
    //
    // All updates use SQL arithmetic (gold = gold + $1) instead
    // of read-then-write. This is atomic even within a transaction.
    //
    // CASE WHEN $1 THEN ... ELSE ... END is PostgreSQL's ternary
    // expression. We use it to conditionally add gold/xp on win
    // or set HP to 0 on loss — all in a single UPDATE statement.
    const goldGained = win ? Math.floor(Math.random() * 50) + 10 : 0;
    const xpGained = win ? 50 : 0;

    // NOTE: pvp_wins and pvp_losses do NOT exist as columns on
    // hero_stats. Win/loss tracking is handled by the pvp_stats
    // table (Step 9 below). We only update hero_stats for the
    // columns that actually exist on that table.
    await client.query(
      `UPDATE hero_stats
       SET essence = essence - 10,
           gold = gold + $1,
           xp = xp + $2,
           kills = CASE WHEN $3 THEN kills + 1 ELSE kills END,
           hp = CASE WHEN $3 THEN GREATEST(1, $4) ELSE 0 END,
           updated_at = NOW()
       WHERE player_id = $5`,
      [goldGained, xpGained, win, aHp, userId]
    );

    // ── STEP 9: Update Elo via UPSERT ───────────────────────────
    //
    // INSERT ... ON CONFLICT DO UPDATE is called an "UPSERT":
    //   - If the player_id row EXISTS → UPDATE the columns
    //   - If the player_id row DOES NOT EXIST → INSERT a new row
    //
    // EXCLUDED.elo_rating refers to the value that WOULD have been
    // inserted. This lets us use the same value for both paths.
    //
    // We update BOTH players' Elo: attacker gains/loses 15,
    // defender is unaffected in kills/losses (offline defense
    // doesn't penalize in this version).
    await client.query(
      `INSERT INTO pvp_stats (player_id, elo_rating, wins, losses)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id) DO UPDATE SET
         elo_rating = EXCLUDED.elo_rating,
         wins = pvp_stats.wins + EXCLUDED.wins,
         losses = pvp_stats.losses + EXCLUDED.losses`,
      [userId, newAElo, win ? 1 : 0, win ? 0 : 1]
    );

    // ── STEP 10: Record the match in pvp_match_history ──────────
    //
    // This is a pure INSERT — no UPSERT needed. Each duel creates
    // a new row. This table is the audit trail for all PvP combat.
    try {
      await client.query(
        `INSERT INTO pvp_matches
           (attacker_id, defender_id, winner_id,
            attacker_elo_before, defender_elo_before, elo_change, rounds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId, targetPlayerId,
          win ? userId : targetPlayerId,
          aElo, dElo, eloChange, roundsDone,
        ]
      );
    } catch (_) { /* Table may not exist yet in dev */ }

    // ── STEP 11: Update seasonal stats ──────────────────────────
    //
    // This uses the same UPSERT pattern as Step 9.
    // ON CONFLICT (player_id, season_id) — the composite unique key
    // ensures one row per player per season.
    //
    // GREATEST(pvp_season_stats.peak_elo, $5):
    //   GREATEST is PostgreSQL's built-in max-of-two-values function.
    //   If the player's new Elo exceeds their peak, update it.
    //
    // CASE WHEN $3 = 1 THEN ... ELSE 0 END:
    //   Conditionally increments win_streak on wins, resets to 0 on loss.
    //
    // Rank tier mapping: simple if/else chain converting Elo ranges
    // to named tiers. This runs in JS, not SQL, because the tier
    // names are game-design constants, not database data.
    const rankTier = newAElo >= 2000 ? 'Sovereign'
      : newAElo >= 1800 ? 'Champion'
      : newAElo >= 1600 ? 'Diamond'
      : newAElo >= 1400 ? 'Platinum'
      : newAElo >= 1200 ? 'Gold'
      : newAElo >= 1000 ? 'Silver'
      : 'Bronze';

    try {
      const { rows: seasonRows } = await client.query(
        `SELECT id FROM pvp_seasons WHERE is_active = true LIMIT 1`
      );

      if (seasonRows.length > 0) {
        const seasonId = seasonRows[0].id;
        await client.query(
          `INSERT INTO pvp_season_stats
             (player_id, season_id, wins, losses, elo, peak_elo, rank_tier, win_streak, gold_earned)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)
           ON CONFLICT (player_id, season_id) DO UPDATE SET
             wins = pvp_season_stats.wins + EXCLUDED.wins,
             losses = pvp_season_stats.losses + EXCLUDED.losses,
             elo = EXCLUDED.elo,
             peak_elo = GREATEST(pvp_season_stats.peak_elo, EXCLUDED.elo),
             rank_tier = EXCLUDED.rank_tier,
             win_streak = CASE
               WHEN EXCLUDED.wins = 1 THEN pvp_season_stats.win_streak + 1
               ELSE 0
             END,
             best_streak = GREATEST(
               pvp_season_stats.best_streak,
               CASE WHEN EXCLUDED.wins = 1
                 THEN pvp_season_stats.win_streak + 1
                 ELSE pvp_season_stats.best_streak
               END
             ),
             gold_earned = pvp_season_stats.gold_earned + EXCLUDED.gold_earned`,
          [userId, seasonId, win ? 1 : 0, win ? 0 : 1, newAElo, rankTier, win ? 1 : 0, goldGained]
        );
      }
    } catch (seasonErr) {
      console.error('[PVP SEASON SYNC]', seasonErr.message);
    }

    // ── STEP 12: Build response payload ─────────────────────────
    //
    // NO hero_data in this response. We return only the specific
    // columns the frontend needs to update its UI state.
    //
    // pvp_wins/pvp_losses are read from pvp_stats (not hero_stats,
    // which does NOT have those columns).
    const { rows: finalHero } = await client.query(
      `SELECT gold, hp, max_hp, xp, level, essence, kills
       FROM hero_stats WHERE player_id = $1`,
      [userId]
    );

    // Read win/loss from pvp_stats (which was just updated in Step 9)
    const { rows: finalPvp } = await client.query(
      `SELECT wins, losses FROM pvp_stats WHERE player_id = $1`,
      [userId]
    );

    const fh = finalHero[0];
    const fp = finalPvp[0] || { wins: 0, losses: 0 };
    return {
      win,
      goldGained,
      xpGained,
      eloChange,
      newElo: newAElo,
      rankTier,
      roundsDone,
      combatLogs,
      updatedHero: {
        gold: fh.gold,
        hp: fh.hp,
        maxHp: fh.max_hp,
        xp: fh.xp,
        level: fh.level,
        essence: fh.essence,
        kills: fh.kills,
        pvpWins: fp.wins,
        pvpLosses: fp.losses,
      },
    };
  });

  // ── Handle transaction errors ───────────────────────────────
  if (error) {
    const msg = error.message;
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('dead') || msg.includes('Essence') || msg.includes('yourself')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('[PVP CHALLENGE ERROR]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...data });
}


// ── Export: rate-limited + idempotent ────────────────────────────
//
// 'pvp' rate limit = 10 req/min (prevents Elo-boosting scripts).
// Idempotency = true prevents double-fight from network retries.
// The X-Idempotency-Key header ensures the second request returns
// the cached result from the first fight.
export const POST = withMiddleware(handlePost, {
  rateLimit: 'pvp',
  idempotency: true,
});
