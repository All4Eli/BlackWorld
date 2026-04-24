// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Hero State DAL
// ═══════════════════════════════════════════════════════════════════
// All queries that read or mutate the `hero_stats` table.
// This is the single source of truth for player game-state:
//   progression, attributes, vitals, resources, economy, quests.
//
// Design rules:
//   1. Every function uses parameterized SQL ($1, $2, …)
//   2. Mutations wrapped in transactions where needed
//   3. Returns { data, error } for consistency with route handlers
//   4. No JSONB hero_data reads — all access is via normalized columns
// ═══════════════════════════════════════════════════════════════════

import { sql, sqlOne, transaction } from '@/lib/db/pool';

// ─────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────

/** Columns returned by default for hero stats (excludes legacy hero_data blob) */
const HERO_SELECT_COLUMNS = `
  player_id, stage, level, xp, gold, kills, deaths,
  str, def, dex, int, vit, unspent_points,
  hp, max_hp, mana, max_mana,
  base_dmg, flasks, max_flasks,
  essence, max_essence, essence_regen_at,
  bank_balance,
  skill_points, skill_points_unspent,
  learned_tomes,
  daily_quests, accepted_quests, daily_quest_date,
  login_streak, last_daily_claim,
  created_at, updated_at
`;

/**
 * Allowlist of columns that may be updated via the generic `update()` method.
 * Prevents callers from overwriting critical fields like player_id or created_at.
 * @type {Set<string>}
 */
const UPDATABLE_COLUMNS = new Set([
  'stage', 'level', 'xp', 'gold', 'kills', 'deaths',
  'str', 'def', 'dex', 'int', 'vit', 'unspent_points',
  'hp', 'max_hp', 'mana', 'max_mana',
  'base_dmg', 'flasks', 'max_flasks',
  'essence', 'max_essence', 'essence_regen_at',
  'bank_balance',
  'skill_points', 'skill_points_unspent',
  'learned_tomes',
  'daily_quests', 'accepted_quests', 'daily_quest_date',
  'login_streak', 'last_daily_claim',
]);


// ─────────────────────────────────────────────────────────────────
//  READ Operations
// ─────────────────────────────────────────────────────────────────

/**
 * Fetch the full hero_stats row for a player.
 * Does NOT return the legacy `hero_data` JSONB blob.
 *
 * @param {string} playerId - The `clerk_user_id` / internal user ID
 * @returns {Promise<{
 *   data: {
 *     player_id: string,
 *     stage: 'BOOT'|'CREATION'|'PLAYING'|'DEAD',
 *     level: number, xp: number, gold: number,
 *     kills: number, deaths: number,
 *     str: number, def: number, dex: number, int: number, vit: number,
 *     unspent_points: number,
 *     hp: number, max_hp: number, mana: number, max_mana: number,
 *     base_dmg: number, flasks: number, max_flasks: number,
 *     essence: number, max_essence: number, essence_regen_at: string,
 *     bank_balance: number,
 *     skill_points: Object, skill_points_unspent: number,
 *     learned_tomes: string[],
 *     daily_quests: Object[], accepted_quests: Object[],
 *     daily_quest_date: string|null,
 *     login_streak: number, last_daily_claim: string|null,
 *     created_at: string, updated_at: string
 *   }|null,
 *   error: Error|null
 * }>}
 */
export function getHeroStats(playerId) {
  return sqlOne(
    `SELECT ${HERO_SELECT_COLUMNS} FROM hero_stats WHERE player_id = $1`,
    [playerId]
  );
}

/**
 * Check if a hero_stats row exists for a player.
 *
 * @param {string} playerId
 * @returns {Promise<{ data: boolean, error: Error|null }>}
 */
export async function exists(playerId) {
  const { data, error } = await sqlOne(
    `SELECT 1 FROM hero_stats WHERE player_id = $1`,
    [playerId]
  );
  if (error) return { data: false, error };
  return { data: !!data, error: null };
}

/**
 * Get just the stage for a player (lightweight check used during auth flow).
 *
 * @param {string} playerId
 * @returns {Promise<{ data: string|null, error: Error|null }>}
 */
export async function getStage(playerId) {
  const { data, error } = await sqlOne(
    `SELECT stage FROM hero_stats WHERE player_id = $1`,
    [playerId]
  );
  if (error) return { data: null, error };
  return { data: data?.stage ?? null, error: null };
}

/**
 * Get a player's current gold and bank balance (used for purchase validation).
 *
 * @param {string} playerId
 * @returns {Promise<{ data: { gold: number, bank_balance: number }|null, error: Error|null }>}
 */
export function getEconomy(playerId) {
  return sqlOne(
    `SELECT gold, bank_balance FROM hero_stats WHERE player_id = $1`,
    [playerId]
  );
}

/**
 * Get just the combat-relevant stats for a player.
 * Used by the combat resolver to compute damage/defense without fetching the full row.
 *
 * @param {string} playerId
 * @returns {Promise<{
 *   data: {
 *     player_id: string, level: number,
 *     hp: number, max_hp: number, mana: number, max_mana: number,
 *     str: number, def: number, dex: number, int: number, vit: number,
 *     base_dmg: number, flasks: number, max_flasks: number,
 *     learned_tomes: string[], skill_points: Object
 *   }|null,
 *   error: Error|null
 * }>}
 */
export function getCombatStats(playerId) {
  return sqlOne(
    `SELECT player_id, level,
            hp, max_hp, mana, max_mana,
            str, def, dex, int, vit,
            base_dmg, flasks, max_flasks,
            learned_tomes, skill_points
     FROM hero_stats WHERE player_id = $1`,
    [playerId]
  );
}


// ─────────────────────────────────────────────────────────────────
//  WRITE Operations
// ─────────────────────────────────────────────────────────────────

/**
 * Create a fresh hero_stats row for a newly registered player.
 * Uses all database defaults for initial stats.
 *
 * @param {string} playerId - The `clerk_user_id` / internal user ID
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export function create(playerId) {
  return sqlOne(
    `INSERT INTO hero_stats (player_id)
     VALUES ($1)
     RETURNING ${HERO_SELECT_COLUMNS}`,
    [playerId]
  );
}

/**
 * Update one or more hero_stats columns atomically.
 * Only columns in the UPDATABLE_COLUMNS allowlist are accepted.
 * JSONB values (skill_points, daily_quests, etc.) stringify automatically.
 *
 * @param {string} playerId - The `clerk_user_id`
 * @param {Object} updates  - Key/value pairs of columns to update.
 *   Keys MUST match column names in hero_stats. Values are auto-serialized.
 *
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 *
 * @example
 * // Spend gold and gain XP after a purchase
 * await HeroDal.update(userId, { gold: 150, xp: 300 });
 *
 * @example
 * // Level up: increase level, reset XP, grant unspent points
 * await HeroDal.update(userId, { level: 5, xp: 0, unspent_points: 3 });
 */
export function update(playerId, updates) {
  const keys = Object.keys(updates).filter(k => UPDATABLE_COLUMNS.has(k));
  if (keys.length === 0) {
    return Promise.resolve({ data: null, error: new Error('No valid columns to update') });
  }

  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  for (const key of keys) {
    let val = updates[key];
    // Auto-serialize objects/arrays for JSONB columns
    if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      val = JSON.stringify(val);
    }
    setClauses.push(`"${key}" = $${paramIdx}`);
    values.push(val);
    paramIdx++;
  }

  values.push(playerId);

  return sqlOne(
    `UPDATE hero_stats
     SET ${setClauses.join(', ')}
     WHERE player_id = $${paramIdx}
     RETURNING ${HERO_SELECT_COLUMNS}`,
    values
  );
}

/**
 * Atomically increment or decrement numeric columns using SQL expressions.
 * This avoids read-then-write race conditions (e.g., two concurrent gold changes).
 *
 * @param {string} playerId
 * @param {Object<string, number>} deltas - Column name → amount to add (negative to subtract).
 *   Only numeric, allowlisted columns are accepted.
 *
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 *
 * @example
 * // Player earns 50 gold and 20 XP from combat
 * await HeroDal.increment(userId, { gold: 50, xp: 20, kills: 1 });
 *
 * @example
 * // Player takes 30 damage
 * await HeroDal.increment(userId, { hp: -30 });
 */
export function increment(playerId, deltas) {
  /** @type {Set<string>} */
  const NUMERIC_COLUMNS = new Set([
    'level', 'xp', 'gold', 'kills', 'deaths',
    'str', 'def', 'dex', 'int', 'vit', 'unspent_points',
    'hp', 'max_hp', 'mana', 'max_mana',
    'base_dmg', 'flasks', 'max_flasks',
    'essence', 'max_essence', 'bank_balance',
    'skill_points_unspent', 'login_streak',
  ]);

  const keys = Object.keys(deltas).filter(k => NUMERIC_COLUMNS.has(k));
  if (keys.length === 0) {
    return Promise.resolve({ data: null, error: new Error('No valid numeric columns') });
  }

  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  for (const key of keys) {
    setClauses.push(`"${key}" = "${key}" + $${paramIdx}`);
    values.push(deltas[key]);
    paramIdx++;
  }

  values.push(playerId);

  return sqlOne(
    `UPDATE hero_stats
     SET ${setClauses.join(', ')}
     WHERE player_id = $${paramIdx}
     RETURNING ${HERO_SELECT_COLUMNS}`,
    values
  );
}

/**
 * Set the player's game stage.
 * Used during character creation flow (BOOT → CREATION → PLAYING)
 * and on death (PLAYING → DEAD).
 *
 * @param {string} playerId
 * @param {'BOOT'|'CREATION'|'PLAYING'|'DEAD'} stage
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export function setStage(playerId, stage) {
  const validStages = ['BOOT', 'CREATION', 'PLAYING', 'DEAD'];
  if (!validStages.includes(stage)) {
    return Promise.resolve({ data: null, error: new Error(`Invalid stage: ${stage}`) });
  }
  return sqlOne(
    `UPDATE hero_stats SET stage = $1 WHERE player_id = $2 RETURNING ${HERO_SELECT_COLUMNS}`,
    [stage, playerId]
  );
}


// ─────────────────────────────────────────────────────────────────
//  COMPOSITE / TRANSACTIONAL Operations
// ─────────────────────────────────────────────────────────────────

/**
 * Allocate unspent attribute points into stats.
 * Server-authoritative: validates that the player has enough unspent_points
 * before applying. Wrapped in a transaction.
 *
 * @param {string} playerId
 * @param {{ str?: number, def?: number, dex?: number, int?: number, vit?: number }} allocation
 *   Number of points to add to each stat. All values must be >= 0.
 *
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export async function allocatePoints(playerId, allocation) {
  const stats = ['str', 'def', 'dex', 'int', 'vit'];
  const totalRequested = stats.reduce((sum, s) => sum + (allocation[s] || 0), 0);

  if (totalRequested <= 0) {
    return { data: null, error: new Error('No points to allocate') };
  }

  // Validate no negative values
  for (const s of stats) {
    if (allocation[s] && allocation[s] < 0) {
      return { data: null, error: new Error(`Cannot allocate negative points to ${s}`) };
    }
  }

  return transaction(async (client) => {
    // Lock the row to prevent concurrent point allocation
    const { rows } = await client.query(
      `SELECT unspent_points, str, def, dex, int, vit
       FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [playerId]
    );

    if (rows.length === 0) {
      throw new Error('Hero not found');
    }

    const hero = rows[0];
    if (hero.unspent_points < totalRequested) {
      throw new Error(`Not enough points: have ${hero.unspent_points}, need ${totalRequested}`);
    }

    // Build the update
    const setClauses = [`unspent_points = unspent_points - $1`];
    const values = [totalRequested];
    let paramIdx = 2;

    for (const s of stats) {
      const points = allocation[s] || 0;
      if (points > 0) {
        setClauses.push(`"${s}" = "${s}" + $${paramIdx}`);
        values.push(points);
        paramIdx++;
      }
    }

    values.push(playerId);

    const result = await client.query(
      `UPDATE hero_stats
       SET ${setClauses.join(', ')}
       WHERE player_id = $${paramIdx}
       RETURNING ${HERO_SELECT_COLUMNS}`,
      values
    );

    return result.rows[0];
  });
}

/**
 * Process a gold transfer between a player's wallet and bank.
 * Server-authoritative: validates sufficient funds before moving gold.
 * Wrapped in a transaction to prevent race conditions.
 *
 * @param {string} playerId
 * @param {'deposit'|'withdraw'} action
 * @param {number} amount - Must be > 0
 *
 * @returns {Promise<{ data: { gold: number, bank_balance: number }|null, error: Error|null }>}
 */
export async function bankTransfer(playerId, action, amount) {
  if (!['deposit', 'withdraw'].includes(action)) {
    return { data: null, error: new Error(`Invalid action: ${action}`) };
  }
  if (!amount || amount <= 0) {
    return { data: null, error: new Error('Amount must be positive') };
  }

  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT gold, bank_balance FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [playerId]
    );

    if (rows.length === 0) throw new Error('Hero not found');

    const hero = rows[0];

    if (action === 'deposit' && hero.gold < amount) {
      throw new Error(`Insufficient gold: have ${hero.gold}, need ${amount}`);
    }
    if (action === 'withdraw' && hero.bank_balance < amount) {
      throw new Error(`Insufficient bank balance: have ${hero.bank_balance}, need ${amount}`);
    }

    const goldDelta = action === 'deposit' ? -amount : amount;
    const bankDelta = action === 'deposit' ? amount : -amount;

    const result = await client.query(
      `UPDATE hero_stats
       SET gold = gold + $1, bank_balance = bank_balance + $2
       WHERE player_id = $3
       RETURNING gold, bank_balance`,
      [goldDelta, bankDelta, playerId]
    );

    return result.rows[0];
  });
}

/**
 * Apply combat results to the hero after a fight resolves.
 * Atomically updates HP, gold, XP, kills/deaths in a single query.
 * Intended to be called by the combat resolver route only.
 *
 * @param {string} playerId
 * @param {{
 *   hpChange: number,
 *   goldEarned: number,
 *   xpEarned: number,
 *   isKill: boolean,
 *   isDeath: boolean,
 *   manaUsed?: number,
 *   flasksUsed?: number
 * }} result
 *
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export function applyCombatResult(playerId, result) {
  const deltas = {};

  if (result.hpChange) deltas.hp = result.hpChange;
  if (result.goldEarned) deltas.gold = result.goldEarned;
  if (result.xpEarned) deltas.xp = result.xpEarned;
  if (result.isKill) deltas.kills = 1;
  if (result.isDeath) deltas.deaths = 1;
  if (result.manaUsed) deltas.mana = -Math.abs(result.manaUsed);
  if (result.flasksUsed) deltas.flasks = -Math.abs(result.flasksUsed);

  return increment(playerId, deltas);
}

/**
 * Full hero state reset (used on death or manual reset).
 * Resets HP, mana, flasks to max. Sets stage to DEAD.
 * Gold loss is applied as a percentage (from server_config).
 *
 * @param {string} playerId
 * @param {number} goldLossPct - Percentage of gold lost on death (e.g., 10 = 10%)
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export function applyDeath(playerId, goldLossPct = 10) {
  return sqlOne(
    `UPDATE hero_stats
     SET stage = 'DEAD',
         hp = 0,
         gold = GREATEST(0, gold - (gold * $1 / 100)),
         deaths = deaths + 1
     WHERE player_id = $2
     RETURNING ${HERO_SELECT_COLUMNS}`,
    [goldLossPct, playerId]
  );
}

/**
 * Revive a dead hero. Restores HP to 50% of max and sets stage back to PLAYING.
 *
 * @param {string} playerId
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export function revive(playerId) {
  return sqlOne(
    `UPDATE hero_stats
     SET stage = 'PLAYING',
         hp = max_hp / 2,
         mana = max_mana / 2,
         flasks = max_flasks
     WHERE player_id = $1 AND stage = 'DEAD'
     RETURNING ${HERO_SELECT_COLUMNS}`,
    [playerId]
  );
}

/**
 * Full heal (used by the healer NPC). Restores HP and mana to max.
 *
 * @param {string} playerId
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export function fullHeal(playerId) {
  return sqlOne(
    `UPDATE hero_stats
     SET hp = max_hp, mana = max_mana, flasks = max_flasks
     WHERE player_id = $1
     RETURNING ${HERO_SELECT_COLUMNS}`,
    [playerId]
  );
}
