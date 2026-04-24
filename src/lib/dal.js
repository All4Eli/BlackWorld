// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — DATA ACCESS LAYER (DAL)
// ═══════════════════════════════════════════════════════════════════
// Typed query functions for all game systems.
// Every function returns { data, error } to stay compatible with
// the existing API route pattern.
//
// NOTE: This file is the legacy monolith. New DAL modules go in
//       src/lib/db/dal/*.js and import from src/lib/db/pool.js.
//       This file re-exports pool helpers for backward compat.
// ═══════════════════════════════════════════════════════════════════

import { pool, sql as _sql, sqlOne as _sqlOne, transaction as _transaction } from '@/lib/db/pool';

// Re-export pool helpers under the same names used throughout this file.
// All 27+ route files that `import { sql, sqlOne } from '@/lib/dal'` keep working.
const sql = _sql;
const sqlOne = _sqlOne;
const transaction = _transaction;


// ═════════════════════════════════════════════════════════════════
//  PLAYERS — Auth & identity
// ═════════════════════════════════════════════════════════════════

export const Players = {
  getByUserId: (userId) =>
    sqlOne('SELECT * FROM players WHERE clerk_user_id = $1 AND deleted_at IS NULL', [userId]),

  getByEmail: (email) =>
    sqlOne('SELECT * FROM players WHERE email = $1 AND deleted_at IS NULL', [email]),

  getByUsername: (username) =>
    sqlOne('SELECT * FROM players WHERE username = $1 AND deleted_at IS NULL', [username]),

  create: (clerkUserId, email, passwordHash, username) =>
    sqlOne(
      `INSERT INTO players (clerk_user_id, email, password_hash, username)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [clerkUserId, email, passwordHash, username]
    ),

  updateLastLogin: (userId) =>
    sql('UPDATE players SET last_login = now() WHERE clerk_user_id = $1', [userId]),

  ban: (userId, reason, expiresAt = null) =>
    sql('UPDATE players SET is_banned = true, ban_reason = $2, ban_expires_at = $3 WHERE clerk_user_id = $1',
      [userId, reason, expiresAt]),

  softDelete: (userId) =>
    sql('UPDATE players SET deleted_at = now() WHERE clerk_user_id = $1', [userId]),
};


// ═════════════════════════════════════════════════════════════════
//  HERO STATS — All mutable gameplay state
// ═════════════════════════════════════════════════════════════════

export const HeroStats = {
  get: (playerId) =>
    sqlOne('SELECT * FROM hero_stats WHERE player_id = $1', [playerId]),

  create: (playerId) =>
    sqlOne(
      `INSERT INTO hero_stats (player_id) VALUES ($1) RETURNING *`,
      [playerId]
    ),

  // Generic column update — pass an object of column:value pairs
  update: async (playerId, fields) => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return { data: null, error: null };
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map(k => {
      const v = fields[k];
      // Auto-serialize JSONB
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
      return v;
    });
    return sqlOne(
      `UPDATE hero_stats SET ${setClauses.join(', ')} WHERE player_id = $1 RETURNING *`,
      [playerId, ...values]
    );
  },

  // Level up — atomic increment
  addXP: (playerId, xp) =>
    sqlOne(
      `UPDATE hero_stats SET xp = xp + $2 WHERE player_id = $1 RETURNING *`,
      [playerId, xp]
    ),

  levelUp: (playerId) =>
    sqlOne(
      `UPDATE hero_stats SET level = level + 1, unspent_points = unspent_points + 1,
       skill_points_unspent = skill_points_unspent + 1 WHERE player_id = $1 RETURNING *`,
      [playerId]
    ),

  // Gold operations — atomic to prevent race conditions
  addGold: (playerId, amount) =>
    sqlOne('UPDATE hero_stats SET gold = gold + $2 WHERE player_id = $1 RETURNING *', [playerId, amount]),

  spendGold: (playerId, amount) =>
    sqlOne(
      'UPDATE hero_stats SET gold = gold - $2 WHERE player_id = $1 AND gold >= $2 RETURNING *',
      [playerId, amount]
    ),

  // Bank operations
  deposit: (playerId, amount) =>
    sqlOne(
      `UPDATE hero_stats SET gold = gold - $2, bank_balance = bank_balance + $2
       WHERE player_id = $1 AND gold >= $2 RETURNING *`,
      [playerId, amount]
    ),

  withdraw: (playerId, amount) =>
    sqlOne(
      `UPDATE hero_stats SET gold = gold + $2, bank_balance = bank_balance - $2
       WHERE player_id = $1 AND bank_balance >= $2 RETURNING *`,
      [playerId, amount]
    ),

  // Combat results
  recordKill: (playerId) =>
    sql('UPDATE hero_stats SET kills = kills + 1 WHERE player_id = $1', [playerId]),

  recordDeath: (playerId) =>
    sql('UPDATE hero_stats SET deaths = deaths + 1 WHERE player_id = $1', [playerId]),

  // Essence
  spendEssence: (playerId, amount) =>
    sqlOne(
      'UPDATE hero_stats SET essence = essence - $2 WHERE player_id = $1 AND essence >= $2 RETURNING *',
      [playerId, amount]
    ),

  regenEssence: (playerId, amount, maxEssence) =>
    sqlOne(
      `UPDATE hero_stats SET essence = LEAST(essence + $2, $3), essence_regen_at = now()
       WHERE player_id = $1 RETURNING *`,
      [playerId, amount, maxEssence]
    ),

  // Vitals
  heal: (playerId, amount) =>
    sqlOne(
      'UPDATE hero_stats SET hp = LEAST(hp + $2, max_hp) WHERE player_id = $1 RETURNING *',
      [playerId, amount]
    ),

  fullHeal: (playerId) =>
    sqlOne(
      'UPDATE hero_stats SET hp = max_hp, flasks = max_flasks WHERE player_id = $1 RETURNING *',
      [playerId]
    ),

  useFlask: (playerId) =>
    sqlOne(
      'UPDATE hero_stats SET flasks = flasks - 1 WHERE player_id = $1 AND flasks > 0 RETURNING *',
      [playerId]
    ),

  // Attributes
  spendAttributePoint: (playerId, attribute) => {
    const validAttrs = ['str', 'def', 'dex', 'int', 'vit'];
    if (!validAttrs.includes(attribute)) return { data: null, error: new Error('Invalid attribute') };
    return sqlOne(
      `UPDATE hero_stats SET "${attribute}" = "${attribute}" + 1, unspent_points = unspent_points - 1
       WHERE player_id = $1 AND unspent_points > 0 RETURNING *`,
      [playerId]
    );
  },

  // Skills
  allocateSkillPoint: (playerId, skillId, currentPoints) => {
    const updated = { ...currentPoints, [skillId]: (currentPoints[skillId] || 0) + 1 };
    return sqlOne(
      `UPDATE hero_stats SET skill_points = $2, skill_points_unspent = skill_points_unspent - 1
       WHERE player_id = $1 AND skill_points_unspent > 0 RETURNING *`,
      [playerId, JSON.stringify(updated)]
    );
  },

  // Stage
  setStage: (playerId, stage) =>
    sqlOne('UPDATE hero_stats SET stage = $2 WHERE player_id = $1 RETURNING *', [playerId, stage]),
};


// ═════════════════════════════════════════════════════════════════
//  ITEMS — Catalog queries
// ═════════════════════════════════════════════════════════════════

export const Items = {
  getByKey: (key) =>
    sqlOne('SELECT * FROM items WHERE key = $1', [key]),

  getByType: (type) =>
    sql('SELECT * FROM items WHERE type = $1 ORDER BY level_required, tier', [type]),

  getByTier: (tier) =>
    sql('SELECT * FROM items WHERE tier = $1', [tier]),

  getShopItems: (maxLevel) =>
    sql('SELECT * FROM items WHERE buy_price IS NOT NULL AND level_required <= $1 ORDER BY level_required, buy_price', [maxLevel]),

  getLootTable: (zoneLevel) =>
    sql('SELECT * FROM items WHERE min_zone_level <= $1 AND drop_weight > 0 ORDER BY drop_weight DESC', [zoneLevel]),
};


// ═════════════════════════════════════════════════════════════════
//  INVENTORY & EQUIPMENT — Player item management
// ═════════════════════════════════════════════════════════════════

export const Inventory = {
  getAll: (playerId) =>
    sql(
      `SELECT inv.*, i.name as item_name, i.type as item_type, i.tier as item_tier, 
              i.slot as item_slot, i.base_stats, i.icon as item_icon
       FROM inventory inv
       LEFT JOIN items i ON inv.item_id = i.id
       WHERE inv.player_id = $1 AND inv.deleted_at IS NULL
       ORDER BY inv.acquired_at DESC`,
      [playerId]
    ),

  getById: (invId) =>
    sqlOne(
      `SELECT inv.*, i.name as item_name, i.type as item_type, i.tier as item_tier,
              i.slot as item_slot, i.base_stats
       FROM inventory inv
       LEFT JOIN items i ON inv.item_id = i.id
       WHERE inv.id = $1`,
      [invId]
    ),

  add: (playerId, itemId, opts = {}) =>
    sqlOne(
      `INSERT INTO inventory (player_id, item_id, custom_name, custom_tier, rolled_stats, quantity)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [playerId, itemId, opts.customName || null, opts.customTier || null,
       JSON.stringify(opts.rolledStats || {}), opts.quantity || 1]
    ),

  // Add procedurally generated item (no item_id reference)
  addCustom: (playerId, name, tier, stats) =>
    sqlOne(
      `INSERT INTO inventory (player_id, custom_name, custom_tier, rolled_stats)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [playerId, name, tier, JSON.stringify(stats)]
    ),

  remove: (invId) =>
    sql('UPDATE inventory SET deleted_at = now() WHERE id = $1', [invId]),

  hardRemove: (invId) =>
    sql('DELETE FROM inventory WHERE id = $1', [invId]),

  addQuantity: (invId, amount) =>
    sqlOne('UPDATE inventory SET quantity = quantity + $2 WHERE id = $1 RETURNING *', [invId, amount]),

  lock: (invId) =>
    sql('UPDATE inventory SET is_locked = true WHERE id = $1', [invId]),

  unlock: (invId) =>
    sql('UPDATE inventory SET is_locked = false WHERE id = $1', [invId]),

  count: (playerId) =>
    sqlOne('SELECT COUNT(*) as count FROM inventory WHERE player_id = $1 AND deleted_at IS NULL', [playerId]),
};

export const Equipment = {
  getAll: (playerId) =>
    sql(
      `SELECT eq.slot, eq.equipped_at, inv.*, i.name as item_name, i.type as item_type,
              i.tier as item_tier, i.base_stats, i.icon as item_icon
       FROM equipment eq
       JOIN inventory inv ON eq.inventory_id = inv.id
       LEFT JOIN items i ON inv.item_id = i.id
       WHERE eq.player_id = $1`,
      [playerId]
    ),

  equip: (playerId, slot, inventoryId) =>
    sqlOne(
      `INSERT INTO equipment (player_id, slot, inventory_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (player_id, slot) DO UPDATE SET inventory_id = $3, equipped_at = now()
       RETURNING *`,
      [playerId, slot, inventoryId]
    ),

  unequip: (playerId, slot) =>
    sql('DELETE FROM equipment WHERE player_id = $1 AND slot = $2', [playerId, slot]),

  unequipAll: (playerId) =>
    sql('DELETE FROM equipment WHERE player_id = $1', [playerId]),
};


// ═════════════════════════════════════════════════════════════════
//  ZONES & MONSTERS — World queries
// ═════════════════════════════════════════════════════════════════

export const Zones = {
  getAll: () =>
    sql('SELECT * FROM zones WHERE is_active = true ORDER BY sort_order'),

  getById: (id) =>
    sqlOne('SELECT * FROM zones WHERE id = $1', [id]),

  getAccessible: (playerLevel) =>
    sql('SELECT * FROM zones WHERE is_active = true AND level_required <= $1 ORDER BY sort_order', [playerLevel]),
};

export const Monsters = {
  getByZone: (zoneId) =>
    sql('SELECT * FROM monsters WHERE zone_id = $1 AND is_active = true', [zoneId]),

  getBosses: (zoneId) =>
    sql('SELECT * FROM monsters WHERE zone_id = $1 AND is_boss = true AND is_active = true', [zoneId]),

  getRandom: async (zoneId, isBoss = false) => {
    const { data } = await sql(
      `SELECT * FROM monsters WHERE zone_id = $1 AND is_boss = $2 AND is_active = true
       ORDER BY random() LIMIT 1`,
      [zoneId, isBoss]
    );
    return { data: data?.[0] || null, error: null };
  },
};


// ═════════════════════════════════════════════════════════════════
//  NPCS — Town NPC queries
// ═════════════════════════════════════════════════════════════════

export const NPCs = {
  getAll: () =>
    sql('SELECT * FROM npcs WHERE is_active = true'),

  getByKey: (key) =>
    sqlOne('SELECT * FROM npcs WHERE key = $1', [key]),

  getByRole: (role) =>
    sql('SELECT * FROM npcs WHERE role = $1 AND is_active = true', [role]),

  getShopItems: async (npcKey) => {
    return sql(
      `SELECT si.*, i.key as item_key, i.name, i.type, i.tier, i.slot,
              i.description, i.base_stats, i.buy_price, i.sell_price, i.level_required, i.icon
       FROM npc_shop_inventory si
       JOIN npcs n ON si.npc_id = n.id
       JOIN items i ON si.item_id = i.id
       WHERE n.key = $1
       ORDER BY si.sort_order`,
      [npcKey]
    );
  },
};


// ═════════════════════════════════════════════════════════════════
//  QUESTS — Quest system
// ═════════════════════════════════════════════════════════════════

export const Quests = {
  getAll: () =>
    sql('SELECT * FROM quests WHERE is_active = true ORDER BY sort_order'),

  getByType: (type) =>
    sql('SELECT * FROM quests WHERE type = $1 AND is_active = true ORDER BY sort_order', [type]),

  getByKey: (key) =>
    sqlOne('SELECT * FROM quests WHERE key = $1', [key]),

  // Player quest tracking
  getPlayerQuests: (playerId, status = null) => {
    if (status) {
      return sql(
        `SELECT pq.*, q.title, q.description, q.type, q.icon, q.objective_type,
                q.objective_target, q.reward_gold, q.reward_xp, q.reward_items
         FROM player_quests pq
         JOIN quests q ON pq.quest_id = q.id
         WHERE pq.player_id = $1 AND pq.status = $2
         ORDER BY pq.accepted_at DESC`,
        [playerId, status]
      );
    }
    return sql(
      `SELECT pq.*, q.title, q.description, q.type, q.icon, q.objective_type,
              q.objective_target, q.reward_gold, q.reward_xp, q.reward_items
       FROM player_quests pq
       JOIN quests q ON pq.quest_id = q.id
       WHERE pq.player_id = $1
       ORDER BY pq.accepted_at DESC`,
      [playerId]
    );
  },

  accept: (playerId, questId) =>
    sqlOne(
      `INSERT INTO player_quests (player_id, quest_id) VALUES ($1, $2)
       ON CONFLICT (player_id, quest_id) DO NOTHING RETURNING *`,
      [playerId, questId]
    ),

  updateProgress: (playerId, questId, progress) =>
    sqlOne(
      `UPDATE player_quests SET progress = $3 WHERE player_id = $1 AND quest_id = $2 AND status = 'active' RETURNING *`,
      [playerId, questId, progress]
    ),

  complete: (playerId, questId) =>
    sqlOne(
      `UPDATE player_quests SET status = 'completed', completed_at = now()
       WHERE player_id = $1 AND quest_id = $2 AND status = 'active' RETURNING *`,
      [playerId, questId]
    ),

  claim: (playerId, questId) =>
    sqlOne(
      `UPDATE player_quests SET status = 'claimed', claimed_at = now()
       WHERE player_id = $1 AND quest_id = $2 AND status = 'completed' RETURNING *`,
      [playerId, questId]
    ),
};


// ═════════════════════════════════════════════════════════════════
//  ACHIEVEMENTS
// ═════════════════════════════════════════════════════════════════

export const Achievements = {
  getAll: (playerId) =>
    sql('SELECT * FROM achievements WHERE player_id = $1 ORDER BY unlocked_at DESC', [playerId]),

  getByCategory: (playerId, category) =>
    sql('SELECT * FROM achievements WHERE player_id = $1 AND category = $2', [playerId, category]),

  unlock: (playerId, key, name, description, icon, category, points) =>
    sqlOne(
      `INSERT INTO achievements (player_id, key, name, description, icon, category, points)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (player_id, key) DO NOTHING RETURNING *`,
      [playerId, key, name, description, icon, category, points]
    ),

  getPoints: (playerId) =>
    sqlOne('SELECT COALESCE(SUM(points), 0) as total_points FROM achievements WHERE player_id = $1', [playerId]),
};


// ═════════════════════════════════════════════════════════════════
//  COVENS (Guilds)
// ═════════════════════════════════════════════════════════════════

export const Covens = {
  getById: (id) =>
    sqlOne('SELECT * FROM covens WHERE id = $1 AND deleted_at IS NULL', [id]),

  getByName: (name) =>
    sqlOne('SELECT * FROM covens WHERE name = $1 AND deleted_at IS NULL', [name]),

  create: (name, tag, leaderId, description) =>
    sqlOne(
      `INSERT INTO covens (name, tag, leader_id, description) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, tag, leaderId, description]
    ),

  getMembers: (covenId) =>
    sql(
      `SELECT cm.*, p.username, h.level
       FROM coven_members cm
       JOIN players p ON cm.player_id = p.clerk_user_id
       JOIN hero_stats h ON cm.player_id = h.player_id
       WHERE cm.coven_id = $1
       ORDER BY cm.role, h.level DESC`,
      [covenId]
    ),

  addMember: (covenId, playerId, role = 'member') =>
    sqlOne(
      'INSERT INTO coven_members (coven_id, player_id, role) VALUES ($1, $2, $3) RETURNING *',
      [covenId, playerId, role]
    ),

  removeMember: (covenId, playerId) =>
    sql('DELETE FROM coven_members WHERE coven_id = $1 AND player_id = $2', [covenId, playerId]),

  getPlayerCoven: (playerId) =>
    sqlOne(
      `SELECT c.*, cm.role FROM covens c
       JOIN coven_members cm ON c.id = cm.coven_id
       WHERE cm.player_id = $1 AND c.deleted_at IS NULL`,
      [playerId]
    ),
};


// ═════════════════════════════════════════════════════════════════
//  PVP
// ═════════════════════════════════════════════════════════════════

export const PvP = {
  getStats: (playerId) =>
    sqlOne('SELECT * FROM pvp_stats WHERE player_id = $1', [playerId]),

  initStats: (playerId) =>
    sqlOne('INSERT INTO pvp_stats (player_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *', [playerId]),

  recordMatch: (attackerId, defenderId, winnerId, attackerEloBefore, defenderEloBefore, eloChange, rounds) =>
    sqlOne(
      `INSERT INTO pvp_matches (attacker_id, defender_id, winner_id, attacker_elo_before, defender_elo_before, elo_change, rounds)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [attackerId, defenderId, winnerId, attackerEloBefore, defenderEloBefore, eloChange, rounds]
    ),

  updateElo: (playerId, newElo, isWin) => {
    const winClause = isWin
      ? 'wins = wins + 1, win_streak = win_streak + 1, best_streak = GREATEST(best_streak, win_streak + 1)'
      : 'losses = losses + 1, win_streak = 0';
    return sqlOne(
      `UPDATE pvp_stats SET elo_rating = $2, ${winClause}, last_match = now()
       WHERE player_id = $1 RETURNING *`,
      [playerId, newElo]
    );
  },
};


// ═════════════════════════════════════════════════════════════════
//  LOGS — Combat, trade, casino
// ═════════════════════════════════════════════════════════════════

export const Logs = {
  combat: (playerId, zoneId, enemyName, result, goldEarned, xpEarned, lootDropped, rounds, damageDealt, damageTaken) =>
    sql(
      `INSERT INTO combat_log (player_id, zone_id, enemy_name, result, gold_earned, xp_earned, loot_dropped, rounds, damage_dealt, damage_taken)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [playerId, zoneId, enemyName, result, goldEarned, xpEarned, JSON.stringify(lootDropped || []), rounds, damageDealt, damageTaken]
    ),

  trade: (playerId, action, itemName, goldAmount, metadata = {}) =>
    sql(
      `INSERT INTO trade_log (player_id, action, item_name, gold_amount, metadata) VALUES ($1,$2,$3,$4,$5)`,
      [playerId, action, itemName, goldAmount, JSON.stringify(metadata)]
    ),

  casino: (playerId, gameType, wager, payout, result, rollData = {}) =>
    sql(
      `INSERT INTO casino_history (player_id, game_type, wager, payout, result, roll_data) VALUES ($1,$2,$3,$4,$5,$6)`,
      [playerId, gameType, wager, payout, result, JSON.stringify(rollData)]
    ),
};


// ═════════════════════════════════════════════════════════════════
//  CHAT & SOCIAL
// ═════════════════════════════════════════════════════════════════

export const Chat = {
  getRecent: (channel = 'global', limit = 50) =>
    sql(
      'SELECT * FROM global_chat WHERE channel = $1 ORDER BY created_at DESC LIMIT $2',
      [channel, limit]
    ),

  send: (playerId, username, message, channel = 'global') =>
    sqlOne(
      'INSERT INTO global_chat (player_id, username, message, channel) VALUES ($1,$2,$3,$4) RETURNING *',
      [playerId, username, message, channel]
    ),
};

export const Messages = {
  getInbox: (playerId) =>
    sql('SELECT * FROM messages WHERE receiver_id = $1 AND is_archived = false ORDER BY created_at DESC', [playerId]),

  send: (senderId, receiverId, subject, content) =>
    sqlOne(
      'INSERT INTO messages (sender_id, receiver_id, subject, content) VALUES ($1,$2,$3,$4) RETURNING *',
      [senderId, receiverId, subject, content]
    ),

  markRead: (messageId) =>
    sql('UPDATE messages SET is_read = true WHERE id = $1', [messageId]),
};

export const Notifications = {
  getAll: (playerId) =>
    sql('SELECT * FROM notifications WHERE player_id = $1 ORDER BY created_at DESC LIMIT 50', [playerId]),

  getUnread: (playerId) =>
    sql('SELECT * FROM notifications WHERE player_id = $1 AND is_read = false ORDER BY created_at DESC', [playerId]),

  create: (playerId, type, message, metadata = {}) =>
    sqlOne(
      'INSERT INTO notifications (player_id, type, message, metadata) VALUES ($1,$2,$3,$4) RETURNING *',
      [playerId, type, message, JSON.stringify(metadata)]
    ),

  markRead: (notificationId) =>
    sql('UPDATE notifications SET is_read = true WHERE id = $1', [notificationId]),

  markAllRead: (playerId) =>
    sql('UPDATE notifications SET is_read = true WHERE player_id = $1', [playerId]),
};


// ═════════════════════════════════════════════════════════════════
//  CRAFTING & ENHANCEMENT
// ═════════════════════════════════════════════════════════════════

export const Crafting = {
  getRecipes: () =>
    sql('SELECT * FROM crafting_recipes WHERE is_active = true ORDER BY sort_order'),

  getRecipeByKey: (key) =>
    sqlOne('SELECT * FROM crafting_recipes WHERE key = $1', [key]),
};

export const Enhancement = {
  getConfig: (level) =>
    sqlOne('SELECT * FROM enhancement_config WHERE level = $1', [level]),

  getAllConfig: () =>
    sql('SELECT * FROM enhancement_config ORDER BY level'),

  logAttempt: (playerId, inventoryId, fromLevel, toLevel, success, broke, goldSpent, materialsUsed = {}) =>
    sql(
      `INSERT INTO enhancement_log (player_id, inventory_id, from_level, to_level, success, broke, gold_spent, materials_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [playerId, inventoryId, fromLevel, toLevel, success, broke, goldSpent, JSON.stringify(materialsUsed)]
    ),
};


// ═════════════════════════════════════════════════════════════════
//  LEADERBOARDS (materialized views)
// ═════════════════════════════════════════════════════════════════

export const Leaderboards = {
  getLevel: (limit = 100) =>
    sql('SELECT * FROM mv_leaderboard_level LIMIT $1', [limit]),

  getPvP: (limit = 100) =>
    sql('SELECT * FROM mv_leaderboard_pvp LIMIT $1', [limit]),

  getWealth: (limit = 100) =>
    sql('SELECT * FROM mv_leaderboard_wealth LIMIT $1', [limit]),

  refresh: () =>
    sql('SELECT refresh_leaderboards()'),
};


// ═════════════════════════════════════════════════════════════════
//  SERVER CONFIG
// ═════════════════════════════════════════════════════════════════

export const Config = {
  get: async (key) => {
    const { data } = await sqlOne('SELECT value FROM server_config WHERE key = $1', [key]);
    return data?.value ?? null;
  },

  getAll: () =>
    sql('SELECT key, value FROM server_config'),

  set: (key, value, updatedBy = 'system') =>
    sql(
      `INSERT INTO server_config (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now(), updated_by = $3`,
      [key, JSON.stringify(value), updatedBy]
    ),
};


// ═════════════════════════════════════════════════════════════════
//  RATE LIMITING
// ═════════════════════════════════════════════════════════════════

export const RateLimit = {
  check: async (playerId, action) => {
    // Get config
    const { data: config } = await sqlOne(
      'SELECT * FROM rate_limit_config WHERE action = $1', [action]
    );
    if (!config) return { allowed: true }; // No config = no limit

    // Count requests in current window
    const windowStart = new Date(Date.now() - config.window_seconds * 1000);
    const { data: counts } = await sqlOne(
      `SELECT COUNT(*) as cnt FROM rate_limits
       WHERE player_id = $1 AND action = $2 AND window_start > $3`,
      [playerId, action, windowStart]
    );

    const count = parseInt(counts?.cnt || 0);
    if (count >= config.max_requests) {
      return { allowed: false, retryAfter: config.window_seconds };
    }

    // Record this request
    await sql(
      'INSERT INTO rate_limits (player_id, action) VALUES ($1, $2)',
      [playerId, action]
    );

    return { allowed: true, remaining: config.max_requests - count - 1 };
  },
};


// ═════════════════════════════════════════════════════════════════
//  IDEMPOTENCY
// ═════════════════════════════════════════════════════════════════

export const Idempotency = {
  check: async (key) => {
    const { data } = await sqlOne(
      'SELECT * FROM idempotency_keys WHERE key = $1 AND expires_at > now()', [key]
    );
    return data; // null if not found (safe to proceed), object if already processed
  },

  record: (key, playerId, action, response) =>
    sql(
      `INSERT INTO idempotency_keys (key, player_id, action, response)
       VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING`,
      [key, playerId, action, JSON.stringify(response)]
    ),
};


// ═════════════════════════════════════════════════════════════════
//  COMPOSITE QUERIES — Common multi-table operations
// ═════════════════════════════════════════════════════════════════

export const Composite = {
  // Get full player state (auth + stats + equipment + inventory count)
  getFullPlayer: async (userId) => {
    const { data: player, error: pErr } = await Players.getByUserId(userId);
    if (pErr || !player) return { data: null, error: pErr };

    const { data: stats } = await HeroStats.get(userId);
    const { data: equip } = await Equipment.getAll(userId);
    const { data: countData } = await Inventory.count(userId);

    return {
      data: {
        ...player,
        stats,
        equipment: equip || [],
        inventoryCount: parseInt(countData?.count || 0),
      },
      error: null,
    };
  },

  // Register new player — creates player + hero_stats in transaction
  registerPlayer: (clerkUserId, email, passwordHash, username) =>
    transaction(async (client) => {
      const pRes = await client.query(
        'INSERT INTO players (clerk_user_id, email, password_hash, username) VALUES ($1,$2,$3,$4) RETURNING *',
        [clerkUserId, email, passwordHash, username]
      );
      await client.query('INSERT INTO hero_stats (player_id) VALUES ($1)', [clerkUserId]);
      return pRes.rows[0];
    }),
};


// ═════════════════════════════════════════════════════════════════
//  EXPORTS — Backward compat Supabase-style wrapper
// ═════════════════════════════════════════════════════════════════

// Keep the old supabase-style interface alive for gradual migration
import { SupabaseQueryBuilder } from './db.js';

export const supabase = {
  from: (table) => new SupabaseQueryBuilder(table),
};

// Export pool for direct access if needed
export { pool, sql, sqlOne, transaction };
