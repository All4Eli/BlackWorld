// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Premium / Monetization DAL
// ═══════════════════════════════════════════════════════════════════

import { transaction } from '@/lib/db/pool';
import { BS_SHOP_ITEMS } from '@/lib/packs';

/**
 * The strict Catalog of premium items that can be purchased with Blood Stones.
 * The truth is locked server-side, not on the client.
 */
export const PREMIUM_CATALOG = Object.fromEntries(
  BS_SHOP_ITEMS.map(item => [item.key, { name: item.name, cost: item.cost, description: item.desc }])
);

// Legacy catalog aliases for backward compat
PREMIUM_CATALOG['scroll_of_protection'] = { name: 'Enhancement Protection Scroll', cost: 50, description: 'Prevents item break on one failed enhancement.' };
PREMIUM_CATALOG['elixir_of_life'] = { name: 'Elixir of Life', cost: 50, description: 'Fully restores HP.' };
PREMIUM_CATALOG['elixir_of_mana'] = { name: 'Elixir of Mana', cost: 50, description: 'Fully restores Mana.' };
PREMIUM_CATALOG['reset_attributes'] = { name: 'Amnesia Draught', cost: 500, description: 'Resets all allocated attributes.' };

/**
 * Process a transaction purchasing a premium item using Blood Stones.
 * Uses strict row-locking to prevent race conditions on currency deduction.
 * 
 * @param {string} playerId 
 * @param {string} itemKey - Must map to a key in PREMIUM_CATALOG
 */
export async function purchasePremiumItem(playerId, itemKey) {
    const item = PREMIUM_CATALOG[itemKey];
    if (!item) {
        return { data: null, error: new Error('Invalid premium item requested.') };
    }

    return transaction(async (client) => {
        // 1. Lock the hero row to prevent multi-buying overlaps
        const { rows } = await client.query(
            `SELECT blood_stones, hp, max_hp, mana, max_mana, essence, max_essence,
                    str, def, dex, int, vit, unspent_points, flasks, max_flasks
             FROM hero_stats 
             WHERE player_id = $1 
             FOR UPDATE`,
            [playerId]
        );

        if (rows.length === 0) throw new Error('Hero not found.');
        
        const hero = rows[0];
        const stones = hero.blood_stones || 0;

        // 2. Validate Funds
        if (stones < item.cost) {
            throw new Error(`Insufficient Blood Stones. Requires ${item.cost}, but you have ${stones}.`);
        }

        // 3. Deduct Currency atomically — GREATEST prevents going below zero,
        //    RETURNING gives us the actual DB balance (not stale JS calc)
        const { rows: deductedRows } = await client.query(
            `UPDATE hero_stats 
             SET blood_stones = GREATEST(0, blood_stones - $1)
             WHERE player_id = $2
             RETURNING blood_stones`,
            [item.cost, playerId]
        );
        const newBalance = deductedRows[0].blood_stones;

        // 4. Grant specific effects
        let effectMessage = `You purchased ${item.name}.`;

        switch (itemKey) {
            case 'scroll_of_protection':
            case 'protection_scroll': {
                // Add as a buff flag that the forge system can consume
                await client.query(
                    `INSERT INTO player_buffs (player_id, buff_type, buff_name, effect, source)
                     VALUES ($1, 'protection_scroll', 'Enhancement Protection', '{"charges": 1}'::jsonb, 'blood_stone_shop')`,
                    [playerId]
                );
                effectMessage = 'Enhancement Protection Scroll added! Your next enhancement cannot break.';
                break;
            }
            
            case 'elixir_of_life':
                await client.query('UPDATE hero_stats SET hp = max_hp WHERE player_id = $1', [playerId]);
                effectMessage = 'Your HP has been fully restored.';
                break;
            
            case 'elixir_of_mana':
                await client.query('UPDATE hero_stats SET mana = max_mana WHERE player_id = $1', [playerId]);
                effectMessage = 'Your Mana has been fully restored.';
                break;
            
            case 'essence_refill':
                await client.query('UPDATE hero_stats SET essence = max_essence WHERE player_id = $1', [playerId]);
                effectMessage = 'Blood Essence fully restored!';
                break;

            case 'flask_restock':
                await client.query('UPDATE hero_stats SET flasks = max_flasks WHERE player_id = $1', [playerId]);
                effectMessage = 'All combat flasks restocked!';
                break;

            case 'reset_attributes': {
                const spent = (hero.str - 5) + (hero.def - 5) + (hero.dex - 5) + (hero.int - 5) + (hero.vit - 5);
                if (spent <= 0) throw new Error('No attribute points to reset.');
                await client.query(
                    `UPDATE hero_stats 
                     SET str = 5, def = 5, dex = 5, int = 5, vit = 5, unspent_points = unspent_points + $1
                     WHERE player_id = $2`,
                    [spent, playerId]
                );
                effectMessage = `${spent} attribute points have been refunded.`;
                break;
            }

            case 'inventory_expansion': {
                // Check max expansions (5)
                const { rows: countRows } = await client.query(
                    `SELECT COUNT(*) as cnt FROM blood_stone_transactions
                     WHERE player_id = $1 AND description LIKE '%Inventory Expansion%'`,
                    [playerId]
                );
                if (parseInt(countRows[0]?.cnt || 0) >= 5) {
                    throw new Error('Maximum inventory expansions reached (5).');
                }
                // Actually apply the expansion: +10 max_inventory_slots
                await client.query(
                    `UPDATE hero_stats 
                     SET max_inventory_slots = COALESCE(max_inventory_slots, 50) + 10
                     WHERE player_id = $1`,
                    [playerId]
                );
                effectMessage = '+10 inventory slots permanently added!';
                break;
            }

            case 'loot_charm':
            case 'xp_incense': {
                const buffType = itemKey === 'loot_charm' ? 'loot_bonus' : 'xp_bonus';
                const buffValue = itemKey === 'loot_charm' ? 0.10 : 0.15;
                await client.query(
                    `INSERT INTO player_buffs (player_id, buff_type, buff_name, effect, expires_at, source)
                     VALUES ($1, $2, $3, $4, now() + interval '24 hours', 'blood_stone_shop')`,
                    [playerId, buffType, item.name, JSON.stringify({ multiplier: buffValue })]
                );
                effectMessage = `${item.name} activated for 24 hours!`;
                break;
            }

            case 'name_color_crimson':
            case 'name_color_amber':
            case 'name_color_void': {
                const colorMap = {
                    name_color_crimson: '#cf2a2a',
                    name_color_amber: '#f59e0b',
                    name_color_void: '#a855f7',
                };
                await client.query(
                    `UPDATE hero_stats SET hero_data = jsonb_set(COALESCE(hero_data, '{}'), '{nameColor}', $2::jsonb)
                     WHERE player_id = $1`,
                    [playerId, JSON.stringify(colorMap[itemKey])]
                );
                effectMessage = `Name color changed to ${itemKey.split('_').pop()}!`;
                break;
            }
        }

        // 5. Log to blood_stone_transactions
        //
        // Schema columns: player_id, amount, balance_after, transaction_type, reference_id, description
        // transaction_type must be one of: 'purchase', 'daily_login', 'achievement',
        //   'battle_pass', 'event_reward', 'quest_reward', 'pvp_season', 'compensation',
        //   'enhancement_protection', 'cosmetic_purchase', 'battle_pass_purchase',
        //   'inventory_expansion', 'crafting_boost', 'name_change', 'refund'
        //
        // We map the itemKey to the most appropriate transaction_type.
        const txTypeMap = {
          protection_scroll: 'enhancement_protection',
          scroll_of_protection: 'enhancement_protection',
          inventory_expansion: 'inventory_expansion',
          name_color_crimson: 'cosmetic_purchase',
          name_color_amber: 'cosmetic_purchase',
          name_color_void: 'cosmetic_purchase',
          reset_attributes: 'name_change',
        };
        const txType = txTypeMap[itemKey] || 'purchase';

        await client.query(
            `INSERT INTO blood_stone_transactions (player_id, amount, balance_after, transaction_type, description)
             VALUES ($1, $2, $3, $4, $5)`,
            [playerId, -item.cost, newBalance, txType, `Purchased ${item.name}`]
        );

        return { data: { success: true, message: effectMessage, newBalance } };
    });
}

/**
 * Credit Blood Stones to a player (from purchases, rewards, etc.)
 */
export async function creditBloodStones(playerId, amount, source, description, client = null) {
    const query = async (c) => {
        const { rows } = await c.query(
            `UPDATE hero_stats SET blood_stones = COALESCE(blood_stones, 0) + $2
             WHERE player_id = $1 RETURNING blood_stones`,
            [playerId, amount]
        );
        const balance = rows[0]?.blood_stones || amount;
        await c.query(
            `INSERT INTO blood_stone_transactions (player_id, amount, balance_after, transaction_type, description)
             VALUES ($1, $2, $3, $4, $5)`,
            [playerId, amount, balance, source, description]
        );
        return balance;
    };

    if (client) return query(client);
    return transaction(query);
}

/**
 * Get Blood Stone balance and transaction history
 */
export async function getBloodStoneInfo(playerId) {
    const { sql, sqlOne } = await import('@/lib/db/pool');
    const { data: hero } = await sqlOne('SELECT COALESCE(blood_stones, 0) AS blood_stones FROM hero_stats WHERE player_id = $1', [playerId]);
    const { data: history } = await sql(
        'SELECT * FROM blood_stone_transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT 20',
        [playerId]
    );

    // Donator/subscription columns may not exist on all deployments.
    // Gracefully degrade if the query fails.
    let donator = false;
    let donatorExpires = null;
    let subscriptionActive = false;
    try {
      const { data: player } = await sqlOne(
          'SELECT donator_status, donator_expires_at, subscription_status FROM players WHERE clerk_user_id = $1',
          [playerId]
      );
      donator = player?.donator_status || false;
      donatorExpires = player?.donator_expires_at;
      subscriptionActive = player?.subscription_status === 'active';
    } catch {
      // Columns not yet deployed — degrade gracefully
    }

    return {
        balance: hero?.blood_stones || 0,
        totalEarned: 0,
        history: history || [],
        donator,
        donatorExpires,
        subscriptionActive,
    };
}
