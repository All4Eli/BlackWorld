// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Leaderboards DAL
// ═══════════════════════════════════════════════════════════════════

import { sql } from '@/lib/db/pool';

/**
 * Fetches the Level Leaderboard (Top 100).
 * Materialized View: mv_leaderboard_level
 * Pre-sorted by level DESC, xp DESC.
 * 
 * @returns {Promise<{ data?: Array<Object>, error?: Error }>}
 */
export async function getLevelLeaderboard() {
    try {
        const { data, error } = await sql(
            `SELECT * FROM mv_leaderboard_level LIMIT 100`
        );
        if (error) throw error;
        return { data };
    } catch (err) {
        return { error: err };
    }
}

/**
 * Fetches the Wealth Leaderboard (Top 100).
 * Materialized View: mv_leaderboard_wealth
 * Pre-sorted by total_wealth DESC (gold + bank_balance).
 * 
 * @returns {Promise<{ data?: Array<Object>, error?: Error }>}
 */
export async function getWealthLeaderboard() {
    try {
        const { data, error } = await sql(
            `SELECT * FROM mv_leaderboard_wealth LIMIT 100`
        );
        if (error) throw error;
        return { data };
    } catch (err) {
        return { error: err };
    }
}

/**
 * Fetches the PvP Leaderboard (Top 100).
 * Materialized View: mv_leaderboard_pvp
 * Pre-sorted by pvp_elo DESC.
 * 
 * @returns {Promise<{ data?: Array<Object>, error?: Error }>}
 */
export async function getPvPLeaderboard() {
    try {
        const { data, error } = await sql(
            `SELECT * FROM mv_leaderboard_pvp LIMIT 100`
        );
        if (error) throw error;
        return { data };
    } catch (err) {
        return { error: err };
    }
}
