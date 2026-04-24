import { sql, sqlOne, pool } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

/**
 * Creates a new coven and automatically assigns the creator as the LEADER.
 * Deducts the creation fee (5,000 gold) from the player atomically.
 *
 * @param {string} userId - The player's ID establishing the coven.
 * @param {string} name - Coven name (2-32 chars)
 * @param {string} tag - Coven tag (3-4 chars)
 * @param {string} description - Optional description text
 * @returns {Promise<{ data?: Object, error?: Error }>}
 */
export async function createCoven(userId, name, tag, description = '') {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Verify player state and funds (Cost: 5,000 Gold from GDD)
        const CREATE_COST = 5000;
        const { rows: heroRows } = await client.query(
            `SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`, 
            [userId]
        );
        
        if (heroRows.length === 0) throw new Error("Player not found.");
        if (heroRows[0].gold < CREATE_COST) throw new Error("Insufficient gold. Requires 5,000 to found a Coven.");

        // 2. Prevent creating if already in a coven
        const { rows: existingMemberRows } = await client.query(
            `SELECT coven_id FROM coven_members WHERE player_id = $1`,
            [userId]
        );

        if (existingMemberRows.length > 0) throw new Error("You are already in a Coven. Leave first.");

        // 3. Deduct gold
        await client.query(
            `UPDATE hero_stats SET gold = gold - $1 WHERE player_id = $2`,
            [CREATE_COST, userId]
        );

        // 4. Create the Coven
        const newCovenId = randomUUID();
        const { rows: covenRows } = await client.query(
            `INSERT INTO covens (id, name, tag, description, leader_id, level, xp, treasury, max_members)
             VALUES ($1, $2, $3, $4, $5, 1, 0, 0, 20)
             RETURNING *`,
            [newCovenId, name.trim(), tag.trim().toUpperCase(), description.trim(), userId]
        );

        // 5. Add Creator as LEADER
        await client.query(
            `INSERT INTO coven_members (coven_id, player_id, role, contribution)
             VALUES ($1, $2, 'LEADER', 0)`,
            [newCovenId, userId]
        );

        await client.query('COMMIT');
        return { data: covenRows[0] };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[DAL/Covens] createCoven:', err.message);
        return { error: err };
    } finally {
        client.release();
    }
}

/**
 * Adds a player to a generic coven (MEMBER role). 
 * Normally this would require an application/invite handshake depending on logic.
 *
 * @param {string} userId - The joining player
 * @param {string} covenId - The target guild
 * @returns {Promise<{ data?: Object, error?: Error }>}
 */
export async function joinCoven(userId, covenId) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Check if player is already in a coven
        const { rows: memberRows } = await client.query(`SELECT coven_id FROM coven_members WHERE player_id = $1`, [userId]);
        if (memberRows.length > 0) throw new Error("You are already in a Coven.");

        // Check coven member capacity
        const { rows: covenRows } = await client.query(
            `SELECT max_members FROM covens WHERE id = $1 AND deleted_at IS NULL FOR SHARE`,
            [covenId]
        );
        if (covenRows.length === 0) throw new Error("Coven does not exist or was disbanded.");
        
        const { rows: countRows } = await client.query(
            `SELECT COUNT(*)::int AS count FROM coven_members WHERE coven_id = $1`,
            [covenId]
        );

        if (countRows[0].count >= covenRows[0].max_members) {
            throw new Error("Coven is at maximum capacity.");
        }

        const { rows: newMember } = await client.query(
            `INSERT INTO coven_members (coven_id, player_id, role, contribution)
             VALUES ($1, $2, 'MEMBER', 0) RETURNING *`,
            [covenId, userId]
        );

        await client.query('COMMIT');
        return { data: newMember[0] };
    } catch (err) {
        await client.query('ROLLBACK');
        return { error: err };
    } finally {
        client.release();
    }
}

/**
 * Deposits gold from a player's inventory directly into the Coven Treasury.
 *
 * @param {string} userId - The acting player
 * @param {number} amount - Amount of gold to deposit
 * @returns {Promise<{ data?: Object, error?: Error }>}
 */
export async function depositToTreasury(userId, amount) {
    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount <= 0) return { error: new Error("Invalid deposit amount.") };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch player's coven
        const { rows: memberInfo } = await client.query(`SELECT coven_id FROM coven_members WHERE player_id = $1`, [userId]);
        if (memberInfo.length === 0) throw new Error("You are not in a Coven.");
        const covenId = memberInfo[0].coven_id;

        // 2. Lock hero_stats and coven for update to prevent concurrent double-spending
        const { rows: heroRows } = await client.query(`SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`, [userId]);
        if (heroRows[0].gold < parsedAmount) throw new Error("Insufficient personal gold for deposit.");

        const { rows: covenRows } = await client.query(`SELECT treasury FROM covens WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [covenId]);
        if (covenRows.length === 0) throw new Error("Coven not found.");

        // 3. Atomically transfer gold
        await client.query(`UPDATE hero_stats SET gold = gold - $1 WHERE player_id = $2`, [parsedAmount, userId]);
        
        const { rows: updatedCoven } = await client.query(
            `UPDATE covens SET treasury = treasury + $1 WHERE id = $2 RETURNING treasury`, 
            [parsedAmount, covenId]
        );

        // Track member contribution
        await client.query(
            `UPDATE coven_members SET contribution = contribution + $1 WHERE player_id = $2 AND coven_id = $3`,
            [parsedAmount, userId, covenId]
        );

        // Optional: Could log into a coven_treasury_log table here

        await client.query('COMMIT');
        return { data: { success: true, newTreasuryBalance: updatedCoven[0].treasury, deposited: parsedAmount } };
    } catch (err) {
        await client.query('ROLLBACK');
        return { error: err };
    } finally {
        client.release();
    }
}

/**
 * Withdraws gold from the Treasury giving it to the authorized player.
 * ONLY LEADER and OFFICER roles are permitted to withdraw.
 *
 * @param {string} userId - The acting player
 * @param {number} amount - Amount of gold to withdraw
 * @returns {Promise<{ data?: Object, error?: Error }>}
 */
export async function withdrawFromTreasury(userId, amount) {
    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount <= 0) return { error: new Error("Invalid withdrawal amount.") };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch player's coven and role
        const { rows: memberInfo } = await client.query(`SELECT coven_id, role FROM coven_members WHERE player_id = $1`, [userId]);
        if (memberInfo.length === 0) throw new Error("You are not in a Coven.");
        
        const { coven_id: covenId, role } = memberInfo[0];

        // 2. Validate Role
        if (role !== 'LEADER' && role !== 'OFFICER') {
            throw new Error("Unauthorized: Only Leaders and Officers can withdraw from the treasury.");
        }

        // 3. Lock rows for atomic update
        const { rows: covenRows } = await client.query(`SELECT treasury FROM covens WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [covenId]);
        if (covenRows.length === 0) throw new Error("Coven not found.");
        if (covenRows[0].treasury < parsedAmount) throw new Error("Insufficient funds in Coven Treasury.");

        // Lock hero stats just for the safety of keeping row modifications serialized
        await client.query(`SELECT id FROM hero_stats WHERE player_id = $1 FOR UPDATE`, [userId]);

        // 4. Atomically transfer gold
        const { rows: updatedCoven } = await client.query(
            `UPDATE covens SET treasury = treasury - $1 WHERE id = $2 RETURNING treasury`, 
            [parsedAmount, covenId]
        );
        await client.query(`UPDATE hero_stats SET gold = gold + $1 WHERE player_id = $2`, [parsedAmount, userId]);

        // Optional: Could log into a coven_treasury_log table here

        await client.query('COMMIT');
        return { data: { success: true, newTreasuryBalance: updatedCoven[0].treasury, withdrawn: parsedAmount } };
    } catch (err) {
        await client.query('ROLLBACK');
        return { error: err };
    } finally {
        client.release();
    }
}
