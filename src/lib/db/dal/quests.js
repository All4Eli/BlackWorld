// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Quest Tracking DAL
// ═══════════════════════════════════════════════════════════════════
// All queries that read or mutate the `quests` (catalog) and
// `player_quests` (per-player tracking) tables.
//
// Schema overview:
//   quests          — Static catalog (20 quests). Read-only from the API.
//   player_quests   — Per-player state: status, progress, timestamps.
//                     UNIQUE(player_id, quest_id) prevents duplicates.
//
// Quest lifecycle:
//   available → startQuest() → active → incrementProgress() → completed
//               → claimReward() → claimed
//   (or)        → abandonQuest() → [row deleted for repeatables, kept for story]
//
// Objective types seeded:
//   KILL_ENEMIES, KILL_BOSS, GOLD_EARNED, COMPLETE_DUNGEON,
//   ENHANCE_ITEM, PVP_WIN, GATHER_RESOURCES, AUCTION_SELL
//
// Design rules:
//   1. Server-authoritative: the client NEVER determines completion.
//      Progress is incremented by game systems (combat, crafting, etc.)
//      and auto-completes when progress >= objective_target.
//   2. Reward claiming is transactional (gold, XP, items granted atomically).
//   3. Daily/weekly quests use is_repeatable + status tracking.
// ═══════════════════════════════════════════════════════════════════

import { sql, sqlOne, transaction } from '@/lib/db/pool';

// ─────────────────────────────────────────────────────────────────
//  Type Definitions
// ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} QuestDef
 * @property {string} id              - UUID
 * @property {string} key             - Unique slug (e.g. 'story_first_blood')
 * @property {string} title           - Display name
 * @property {string} description
 * @property {string} type            - DAILY|STORY|BOUNTY|SIDE|WEEKLY|EVENT
 * @property {string} icon
 * @property {string} objective_type  - KILL_ENEMIES|KILL_BOSS|GOLD_EARNED|etc.
 * @property {number} objective_target - Count required to complete
 * @property {number} reward_gold
 * @property {number} reward_xp
 * @property {Object[]} reward_items  - [{ item_key, quantity }]
 * @property {string|null} prerequisite_quest - UUID of prereq quest
 * @property {number} level_required
 * @property {string} difficulty      - easy|normal|hard|elite
 * @property {string|null} zone_id
 * @property {boolean} is_repeatable
 * @property {boolean} is_active
 */

/**
 * @typedef {Object} PlayerQuest
 * @property {string} id             - UUID of the player_quests row
 * @property {string} player_id
 * @property {string} quest_id       - FK to quests.id
 * @property {string} status         - active|completed|claimed|abandoned
 * @property {number} progress       - Current count toward objective_target
 * @property {string} accepted_at
 * @property {string|null} completed_at
 * @property {string|null} claimed_at
 */

/**
 * @typedef {PlayerQuest & QuestDef} PlayerQuestJoined
 * Joined player quest state + quest catalog definition.
 */


// ═════════════════════════════════════════════════════════════════
//  QUEST CATALOG — Static definitions (read-only)
// ═════════════════════════════════════════════════════════════════

/**
 * Fetch a quest definition by its unique key.
 *
 * @param {string} questKey - e.g. 'story_first_blood'
 * @returns {Promise<{ data: QuestDef|null, error: Error|null }>}
 */
export function getQuestByKey(questKey) {
  return sqlOne(`SELECT * FROM quests WHERE key = $1 AND is_active = true`, [questKey]);
}

/**
 * Fetch a quest definition by UUID.
 *
 * @param {string} questId - UUID
 * @returns {Promise<{ data: QuestDef|null, error: Error|null }>}
 */
export function getQuestById(questId) {
  return sqlOne(`SELECT * FROM quests WHERE id = $1`, [questId]);
}

/**
 * Fetch all quest definitions, optionally filtered by type.
 *
 * @param {string} [type] - DAILY|STORY|BOUNTY|SIDE|WEEKLY|EVENT
 * @returns {Promise<{ data: QuestDef[]|null, count: number, error: Error|null }>}
 */
export function getQuestCatalog(type) {
  if (type) {
    return sql(
      `SELECT * FROM quests WHERE type = $1 AND is_active = true ORDER BY sort_order, level_required`,
      [type]
    );
  }
  return sql(
    `SELECT * FROM quests WHERE is_active = true ORDER BY type, sort_order, level_required`
  );
}


// ═════════════════════════════════════════════════════════════════
//  PLAYER QUESTS — Active tracking
// ═════════════════════════════════════════════════════════════════

/**
 * Fetch all of a player's active quests, joined with the quest catalog
 * for display-ready data.
 *
 * @param {string} playerId
 * @returns {Promise<{ data: PlayerQuestJoined[]|null, count: number, error: Error|null }>}
 */
export function getActiveQuests(playerId) {
  return sql(
    `SELECT
       pq.id             AS player_quest_id,
       pq.status,
       pq.progress,
       pq.accepted_at,
       pq.completed_at,
       q.id              AS quest_id,
       q.key             AS quest_key,
       q.title,
       q.description,
       q.type,
       q.icon,
       q.objective_type,
       q.objective_target,
       q.reward_gold,
       q.reward_xp,
       q.reward_items,
       q.difficulty,
       q.zone_id,
       q.is_repeatable
     FROM player_quests pq
     JOIN quests q ON pq.quest_id = q.id
     WHERE pq.player_id = $1 AND pq.status = 'active'
     ORDER BY q.type, q.sort_order`,
    [playerId]
  );
}

/**
 * Fetch all quests with status 'completed' (ready to claim rewards).
 *
 * @param {string} playerId
 * @returns {Promise<{ data: PlayerQuestJoined[]|null, count: number, error: Error|null }>}
 */
export function getCompletedQuests(playerId) {
  return sql(
    `SELECT
       pq.id             AS player_quest_id,
       pq.status,
       pq.progress,
       pq.accepted_at,
       pq.completed_at,
       q.id              AS quest_id,
       q.key             AS quest_key,
       q.title,
       q.type,
       q.objective_type,
       q.objective_target,
       q.reward_gold,
       q.reward_xp,
       q.reward_items,
       q.is_repeatable
     FROM player_quests pq
     JOIN quests q ON pq.quest_id = q.id
     WHERE pq.player_id = $1 AND pq.status = 'completed'
     ORDER BY pq.completed_at DESC`,
    [playerId]
  );
}

/**
 * Fetch all quests the player has ever claimed (history for achievements UI).
 *
 * @param {string} playerId
 * @returns {Promise<{ data: PlayerQuestJoined[]|null, count: number, error: Error|null }>}
 */
export function getQuestHistory(playerId) {
  return sql(
    `SELECT
       pq.id             AS player_quest_id,
       pq.status,
       pq.progress,
       pq.accepted_at,
       pq.completed_at,
       pq.claimed_at,
       q.key             AS quest_key,
       q.title,
       q.type,
       q.reward_gold,
       q.reward_xp
     FROM player_quests pq
     JOIN quests q ON pq.quest_id = q.id
     WHERE pq.player_id = $1 AND pq.status = 'claimed'
     ORDER BY pq.claimed_at DESC`,
    [playerId]
  );
}

/**
 * Get all quests available to a player — quests they meet the level
 * requirement for, have not already accepted/completed, and whose
 * prerequisites (if any) are already claimed.
 *
 * @param {string} playerId
 * @param {number} playerLevel - The hero's current level
 * @returns {Promise<{ data: QuestDef[]|null, count: number, error: Error|null }>}
 */
export function getAvailableQuests(playerId, playerLevel) {
  return sql(
    `SELECT q.*
     FROM quests q
     WHERE q.is_active = true
       AND q.level_required <= $2
       -- Exclude quests already in player_quests (unless repeatable + claimed)
       AND NOT EXISTS (
         SELECT 1 FROM player_quests pq
         WHERE pq.quest_id = q.id
           AND pq.player_id = $1
           AND pq.status IN ('active', 'completed')
       )
       -- For non-repeatable quests, exclude if already claimed
       AND (
         q.is_repeatable = true
         OR NOT EXISTS (
           SELECT 1 FROM player_quests pq2
           WHERE pq2.quest_id = q.id
             AND pq2.player_id = $1
             AND pq2.status = 'claimed'
         )
       )
       -- Prerequisite check: if quest has a prereq, player must have claimed it
       AND (
         q.prerequisite_quest IS NULL
         OR EXISTS (
           SELECT 1 FROM player_quests pq3
           WHERE pq3.quest_id = q.prerequisite_quest
             AND pq3.player_id = $1
             AND pq3.status = 'claimed'
         )
       )
     ORDER BY q.type, q.sort_order, q.level_required`,
    [playerId, playerLevel]
  );
}


// ═════════════════════════════════════════════════════════════════
//  QUEST ACTIONS — Start, progress, complete, claim, abandon
// ═════════════════════════════════════════════════════════════════

/**
 * Start (accept) a quest for a player.
 *
 * Server-authoritative validation:
 *   1. Verifies the quest exists and is active
 *   2. Verifies the player meets the level requirement
 *   3. Verifies the player hasn't already accepted this quest
 *   4. Verifies non-repeatable quests haven't already been claimed
 *   5. Verifies prerequisite quest (if any) is completed
 *
 * @param {string} playerId
 * @param {string} questKey - The quest catalog key (e.g. 'story_first_blood')
 * @returns {Promise<{ data: PlayerQuestJoined|null, error: Error|null }>}
 */
export async function startQuest(playerId, questKey) {
  return transaction(async (client) => {
    // 1. Fetch quest definition
    const { rows: questRows } = await client.query(
      `SELECT * FROM quests WHERE key = $1 AND is_active = true`,
      [questKey]
    );
    if (questRows.length === 0) throw new Error(`Quest not found: ${questKey}`);

    const quest = questRows[0];

    // 2. Fetch player level
    const { rows: heroRows } = await client.query(
      `SELECT level FROM hero_stats WHERE player_id = $1`,
      [playerId]
    );
    if (heroRows.length === 0) throw new Error('Hero not found');

    if (heroRows[0].level < quest.level_required) {
      throw new Error(
        `Level ${quest.level_required} required for "${quest.title}" (you are level ${heroRows[0].level})`
      );
    }

    // 3. Check for existing active/completed instance
    const { rows: existing } = await client.query(
      `SELECT id, status FROM player_quests
       WHERE player_id = $1 AND quest_id = $2
       AND status IN ('active', 'completed')`,
      [playerId, quest.id]
    );
    if (existing.length > 0) {
      throw new Error(`Quest "${quest.title}" is already ${existing[0].status}`);
    }

    // 4. Non-repeatable check
    if (!quest.is_repeatable) {
      const { rows: claimed } = await client.query(
        `SELECT 1 FROM player_quests
         WHERE player_id = $1 AND quest_id = $2 AND status = 'claimed'`,
        [playerId, quest.id]
      );
      if (claimed.length > 0) {
        throw new Error(`Quest "${quest.title}" has already been completed and cannot be repeated`);
      }
    }

    // 5. Prerequisite check
    if (quest.prerequisite_quest) {
      const { rows: prereq } = await client.query(
        `SELECT 1 FROM player_quests
         WHERE player_id = $1 AND quest_id = $2 AND status = 'claimed'`,
        [playerId, quest.prerequisite_quest]
      );
      if (prereq.length === 0) {
        throw new Error('You must complete the prerequisite quest first');
      }
    }

    // 6. For repeatables that were previously claimed, delete the old record
    if (quest.is_repeatable) {
      await client.query(
        `DELETE FROM player_quests
         WHERE player_id = $1 AND quest_id = $2 AND status = 'claimed'`,
        [playerId, quest.id]
      );
    }

    // 7. Insert the new player_quests row
    const { rows: inserted } = await client.query(
      `INSERT INTO player_quests (player_id, quest_id, status, progress)
       VALUES ($1, $2, 'active', 0)
       RETURNING *`,
      [playerId, quest.id]
    );

    return {
      ...inserted[0],
      quest_key: quest.key,
      title: quest.title,
      type: quest.type,
      objective_type: quest.objective_type,
      objective_target: quest.objective_target,
      reward_gold: quest.reward_gold,
      reward_xp: quest.reward_xp,
      reward_items: quest.reward_items,
    };
  });
}

/**
 * Increment progress on active quests that match a specific objective type.
 * Called by game systems after relevant actions (kills, gold earned,
 * dungeons completed, etc.).
 *
 * When progress reaches objective_target, the quest automatically
 * transitions to 'completed' status.
 *
 * @param {string} playerId
 * @param {string} objectiveType  - e.g. 'KILL_ENEMIES', 'KILL_BOSS', 'GOLD_EARNED'
 * @param {number} [amount=1]     - How much to increment progress by
 * @param {Object} [context={}]   - Additional filtering context
 * @param {string} [context.zoneId]    - Only advance quests for this zone
 * @param {string} [context.bossName]  - Specific boss name for KILL_BOSS quests
 *
 * @returns {Promise<{
 *   data: {
 *     updated: { quest_key: string, progress: number, target: number, completed: boolean }[],
 *     newlyCompleted: string[]
 *   }|null,
 *   error: Error|null
 * }>}
 */
export async function incrementProgress(playerId, objectiveType, amount = 1, context = {}) {
  return transaction(async (client) => {
    // 1. Find all active quests for this player that match the objective_type
    let matchQuery = `
      SELECT pq.id AS player_quest_id, pq.progress,
             q.key AS quest_key, q.title, q.objective_target, q.zone_id
      FROM player_quests pq
      JOIN quests q ON pq.quest_id = q.id
      WHERE pq.player_id = $1
        AND pq.status = 'active'
        AND q.objective_type = $2
    `;
    const params = [playerId, objectiveType];

    // Optional zone filter: only advance zone-specific quests if context matches
    if (context.zoneId) {
      matchQuery += ` AND (q.zone_id IS NULL OR q.zone_id = $3)`;
      params.push(context.zoneId);
    }

    matchQuery += ` FOR UPDATE OF pq`;

    const { rows: matchingQuests } = await client.query(matchQuery, params);

    if (matchingQuests.length === 0) {
      return { updated: [], newlyCompleted: [] };
    }

    // 2. Increment progress and check for completion
    const updated = [];
    const newlyCompleted = [];

    for (const mq of matchingQuests) {
      const newProgress = Math.min(mq.progress + amount, mq.objective_target);
      const isNowComplete = newProgress >= mq.objective_target;

      if (isNowComplete) {
        // Transition to 'completed'
        await client.query(
          `UPDATE player_quests
           SET progress = $1, status = 'completed', completed_at = now()
           WHERE id = $2`,
          [newProgress, mq.player_quest_id]
        );
        newlyCompleted.push(mq.quest_key);
      } else {
        await client.query(
          `UPDATE player_quests SET progress = $1 WHERE id = $2`,
          [newProgress, mq.player_quest_id]
        );
      }

      updated.push({
        quest_key: mq.quest_key,
        title: mq.title,
        progress: newProgress,
        target: mq.objective_target,
        completed: isNowComplete,
      });
    }

    return { updated, newlyCompleted };
  });
}

/**
 * Claim the rewards for a completed quest.
 *
 * Server-authoritative:
 *   1. Verifies the quest status is 'completed' (not 'active' or 'claimed')
 *   2. Grants gold and XP to hero_stats
 *   3. Grants reward_items to inventory via item catalog lookup
 *   4. Transitions status to 'claimed'
 *
 * All operations are wrapped in a single transaction.
 *
 * @param {string} playerId
 * @param {string} questKey - The quest catalog key
 * @returns {Promise<{
 *   data: {
 *     reward_gold: number,
 *     reward_xp: number,
 *     reward_items: Object[],
 *     hero_gold: number,
 *     hero_xp: number
 *   }|null,
 *   error: Error|null
 * }>}
 */
export async function claimQuestReward(playerId, questKey) {
  return transaction(async (client) => {
    // 1. Fetch the player_quest + quest catalog definition
    const { rows } = await client.query(
      `SELECT pq.id AS player_quest_id, pq.status, pq.progress,
              q.id AS quest_id, q.key AS quest_key, q.title,
              q.objective_target, q.reward_gold, q.reward_xp, q.reward_items
       FROM player_quests pq
       JOIN quests q ON pq.quest_id = q.id
       WHERE pq.player_id = $1 AND q.key = $2
       FOR UPDATE OF pq`,
      [playerId, questKey]
    );

    if (rows.length === 0) {
      throw new Error(`Quest "${questKey}" not found in your quest log`);
    }

    const pq = rows[0];

    if (pq.status !== 'completed') {
      if (pq.status === 'active') {
        throw new Error(
          `Quest "${pq.title}" is not finished yet (${pq.progress}/${pq.objective_target})`
        );
      }
      if (pq.status === 'claimed') {
        throw new Error(`Quest "${pq.title}" rewards have already been claimed`);
      }
      throw new Error(`Quest is in unexpected status: ${pq.status}`);
    }

    // 2. Grant gold + XP to hero_stats atomically
    const { rows: heroRows } = await client.query(
      `UPDATE hero_stats
       SET gold = gold + $1, xp = xp + $2
       WHERE player_id = $3
       RETURNING gold, xp`,
      [pq.reward_gold, pq.reward_xp, playerId]
    );

    if (heroRows.length === 0) throw new Error('Hero not found');

    // 3. Grant reward items (if any)
    const grantedItems = [];
    const rewardItems = pq.reward_items || [];

    for (const reward of rewardItems) {
      if (!reward.item_key || !reward.quantity) continue;

      const { rows: itemRows } = await client.query(
        `SELECT id, is_stackable, max_stack FROM items WHERE key = $1`,
        [reward.item_key]
      );

      if (itemRows.length === 0) {
        console.warn(`[QUEST REWARD] Unknown item_key: ${reward.item_key}`);
        continue;
      }

      const item = itemRows[0];

      // Stack if possible
      if (item.is_stackable) {
        const { rows: existing } = await client.query(
          `SELECT id, quantity FROM inventory
           WHERE player_id = $1 AND item_id = $2 AND is_locked = false
           LIMIT 1 FOR UPDATE`,
          [playerId, item.id]
        );

        if (existing.length > 0) {
          const newQty = Math.min(existing[0].quantity + reward.quantity, item.max_stack || 99);
          await client.query(
            `UPDATE inventory SET quantity = $1 WHERE id = $2`,
            [newQty, existing[0].id]
          );
          grantedItems.push({ item_key: reward.item_key, quantity: reward.quantity, stacked: true });
          continue;
        }
      }

      await client.query(
        `INSERT INTO inventory (player_id, item_id, quantity)
         VALUES ($1, $2, $3)`,
        [playerId, item.id, reward.quantity]
      );
      grantedItems.push({ item_key: reward.item_key, quantity: reward.quantity, stacked: false });
    }

    // 4. Mark quest as claimed
    await client.query(
      `UPDATE player_quests
       SET status = 'claimed', claimed_at = now()
       WHERE id = $1`,
      [pq.player_quest_id]
    );

    return {
      reward_gold: pq.reward_gold,
      reward_xp: pq.reward_xp,
      reward_items: grantedItems,
      hero_gold: heroRows[0].gold,
      hero_xp: heroRows[0].xp,
    };
  });
}

/**
 * Abandon an active quest. For non-repeatable quests, the row
 * transitions to 'abandoned'. For repeatables, the row is deleted
 * so they can be re-accepted.
 *
 * @param {string} playerId
 * @param {string} questKey
 * @returns {Promise<{ data: { abandoned: boolean, quest_key: string }|null, error: Error|null }>}
 */
export async function abandonQuest(playerId, questKey) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT pq.id AS player_quest_id, pq.status,
              q.key AS quest_key, q.title, q.is_repeatable
       FROM player_quests pq
       JOIN quests q ON pq.quest_id = q.id
       WHERE pq.player_id = $1 AND q.key = $2
       FOR UPDATE OF pq`,
      [playerId, questKey]
    );

    if (rows.length === 0) {
      throw new Error(`Quest "${questKey}" not found in your quest log`);
    }

    const pq = rows[0];

    if (pq.status !== 'active') {
      throw new Error(`Cannot abandon quest in "${pq.status}" status`);
    }

    if (pq.is_repeatable) {
      // Delete so it can be re-accepted
      await client.query(`DELETE FROM player_quests WHERE id = $1`, [pq.player_quest_id]);
    } else {
      // Mark as abandoned for history
      await client.query(
        `UPDATE player_quests SET status = 'abandoned' WHERE id = $1`,
        [pq.player_quest_id]
      );
    }

    return { abandoned: true, quest_key: pq.quest_key };
  });
}


// ═════════════════════════════════════════════════════════════════
//  DAILY / WEEKLY QUEST ROTATION
// ═════════════════════════════════════════════════════════════════

/**
 * Get the daily quest rotation for a player.
 * Returns available daily quests that the player hasn't accepted today.
 *
 * @param {string} playerId
 * @param {number} playerLevel
 * @returns {Promise<{ data: QuestDef[]|null, count: number, error: Error|null }>}
 */
export function getDailyQuests(playerId, playerLevel) {
  return sql(
    `SELECT q.*
     FROM quests q
     WHERE q.type = 'DAILY'
       AND q.is_active = true
       AND q.level_required <= $2
       AND NOT EXISTS (
         SELECT 1 FROM player_quests pq
         WHERE pq.quest_id = q.id
           AND pq.player_id = $1
           AND pq.status IN ('active', 'completed')
           AND pq.accepted_at >= CURRENT_DATE
       )
     ORDER BY q.sort_order`,
    [playerId, playerLevel]
  );
}

/**
 * Get the weekly quest rotation for a player.
 * Returns available weekly quests that the player hasn't accepted this week.
 *
 * @param {string} playerId
 * @param {number} playerLevel
 * @returns {Promise<{ data: QuestDef[]|null, count: number, error: Error|null }>}
 */
export function getWeeklyQuests(playerId, playerLevel) {
  return sql(
    `SELECT q.*
     FROM quests q
     WHERE q.type = 'WEEKLY'
       AND q.is_active = true
       AND q.level_required <= $2
       AND NOT EXISTS (
         SELECT 1 FROM player_quests pq
         WHERE pq.quest_id = q.id
           AND pq.player_id = $1
           AND pq.status IN ('active', 'completed')
           AND pq.accepted_at >= date_trunc('week', CURRENT_DATE)
       )
     ORDER BY q.sort_order`,
    [playerId, playerLevel]
  );
}
