import { sqlOne, sql, transaction } from '@/lib/db/pool';
/**
 * Get player lair details
 * @param {string} playerId
 */
export async function getPlayerLair(playerId) {
  return sqlOne(
    `SELECT pl.player_id, pl.lair_type, pl.tier, pl.custom_name, 
            lt.base_cost, lt.essence_bonus, lt.bank_bonus
     FROM player_lairs pl
     JOIN lair_types lt ON pl.lair_type = lt.type
     WHERE pl.player_id = $1`,
    [playerId]
  );
}

/**
 * Buy a new lair
 * @param {string} playerId
 * @param {string} lairType
 * @param {string} customName
 */
export async function buyLair(playerId, lairType, customName = null) {
  return sqlOne(
    `INSERT INTO player_lairs (player_id, lair_type, custom_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (player_id) DO UPDATE 
     SET lair_type = EXCLUDED.lair_type,
         custom_name = EXCLUDED.custom_name,
         tier = CASE WHEN player_lairs.lair_type = EXCLUDED.lair_type THEN player_lairs.tier ELSE 1 END
     RETURNING *`,
    [playerId, lairType, customName]
  );
}

/**
 * Upgrade the lair
 * @param {string} playerId
 */
export async function upgradeLair(playerId) {
  return sqlOne(
    `UPDATE player_lairs
     SET tier = tier + 1
     WHERE player_id = $1
     RETURNING *`,
    [playerId]
  );
}

/**
 * Get all lair types
 */
export async function getLairTypes() {
  const { data, error } = await sql(`SELECT * FROM lair_types ORDER BY base_cost ASC`);
  if (error) return { data: null, error };
  return { data, error: null };
}

/**
 * Buy a new lair within a transaction to prevent TOCTOU race condition
 * @param {string} playerId
 * @param {string} lairType
 * @param {string} customName
 */
export async function buyLairTransactional(playerId, lairType, customName = null) {
  return transaction(async (client) => {
    // 1. Get lair type info
    const ltRes = await client.query('SELECT * FROM lair_types WHERE type = $1', [lairType]);
    if (ltRes.rows.length === 0) throw new Error('INVALID_LAIR_TYPE');
    const typeInfo = ltRes.rows[0];

    // 2. Lock hero stats and check gold
    const heroRes = await client.query('SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE', [playerId]);
    if (heroRes.rows.length === 0) throw new Error('HERO_NOT_FOUND');
    const hero = heroRes.rows[0];

    if (hero.gold < typeInfo.base_cost) {
      throw new Error('INSUFFICIENT_FUNDS');
    }

    // 3. Deduct gold
    await client.query('UPDATE hero_stats SET gold = gold - $1 WHERE player_id = $2', [typeInfo.base_cost, playerId]);

    // 4. Create/update lair
    const lairRes = await client.query(
      `INSERT INTO player_lairs (player_id, lair_type, custom_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (player_id) DO UPDATE 
       SET lair_type = EXCLUDED.lair_type,
           custom_name = EXCLUDED.custom_name,
           tier = CASE WHEN player_lairs.lair_type = EXCLUDED.lair_type THEN player_lairs.tier ELSE 1 END
       RETURNING *`,
      [playerId, lairType, customName]
    );

    return lairRes.rows[0];
  });
}

/**
 * Upgrade the lair within a transaction to prevent TOCTOU race condition
 * @param {string} playerId
 */
export async function upgradeLairTransactional(playerId) {
  return transaction(async (client) => {
    // 1. Lock hero stats
    const heroRes = await client.query('SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE', [playerId]);
    if (heroRes.rows.length === 0) throw new Error('HERO_NOT_FOUND');
    const hero = heroRes.rows[0];

    // 2. Lock player lair and get current state
    const lairRes = await client.query(
      `SELECT pl.tier, lt.base_cost 
       FROM player_lairs pl
       JOIN lair_types lt ON pl.lair_type = lt.type
       WHERE pl.player_id = $1 FOR UPDATE`,
      [playerId]
    );
    if (lairRes.rows.length === 0) throw new Error('NO_LAIR');
    const lair = lairRes.rows[0];

    const upgradeCost = Math.floor(lair.base_cost * Math.pow(1.5, lair.tier));

    if (hero.gold < upgradeCost) {
      throw new Error('INSUFFICIENT_FUNDS');
    }

    // 3. Deduct gold
    await client.query('UPDATE hero_stats SET gold = gold - $1 WHERE player_id = $2', [upgradeCost, playerId]);

    // 4. Upgrade lair
    const upgRes = await client.query(
      `UPDATE player_lairs
       SET tier = tier + 1
       WHERE player_id = $1
       RETURNING *`,
      [playerId]
    );

    return upgRes.rows[0];
  });
}
