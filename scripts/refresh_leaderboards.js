const { pool } = require('../src/lib/db/pool');

/**
 * Triggered by an external CRON job (e.g. Vercel Cron or a worker dyno).
 * Uses CONCURRENTLY to prevent blocking reads on the leaderboards while rebuilding.
 */
async function refreshMaterializedViews() {
    const client = await pool.connect();
    console.log('🔄 Starting Concurrent Materialized View Refresh...');

    try {
        const views = [
            'mv_leaderboard_level',
            'mv_leaderboard_wealth',
            'mv_leaderboard_pvp'
        ];

        for (const view of views) {
            console.log(`Refreshing ${view}...`);
            // Note: CONCURRENTLY requires a UNIQUE INDEX on the view,
            // which was established in Phase 1 scaling migration.
            await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
            console.log(`✅ ${view} refreshed successfully.`);
        }

        console.log('🎉 All leaderboards updated.');
    } catch (err) {
        console.error('❌ Failed to refresh leaderboards:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

refreshMaterializedViews();
