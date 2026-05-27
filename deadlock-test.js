import { pool } from './src/lib/db/pool.js';
import { buyLairTransactional, upgradeLairTransactional } from './src/lib/db/dal/lairs.js';

async function test() {
  const playerId = 'deadlock-test';
  
  // Setup
  await pool.query("INSERT INTO hero_stats (player_id, gold) VALUES ($1, 1000000) ON CONFLICT DO NOTHING", [playerId]);
  await pool.query("INSERT INTO lair_types (type, base_cost, essence_bonus, bank_bonus) VALUES ('shack', 10, 10, 10), ('mansion', 100, 100, 100) ON CONFLICT DO NOTHING");
  await pool.query("INSERT INTO player_lairs (player_id, lair_type, tier) VALUES ($1, 'shack', 1) ON CONFLICT DO NOTHING", [playerId]);
  
  console.log("Setup complete, firing concurrent requests...");

  try {
    const results = await Promise.allSettled([
      buyLairTransactional(playerId, 'mansion'),
      upgradeLairTransactional(playerId)
    ]);
    console.log(results);
  } catch (err) {
    console.log("Caught:", err);
  } finally {
    // Teardown
    await pool.query("DELETE FROM player_lairs WHERE player_id = $1", [playerId]);
    await pool.query("DELETE FROM hero_stats WHERE player_id = $1", [playerId]);
    await pool.query("DELETE FROM lair_types WHERE type IN ('shack', 'mansion')");
    pool.end();
  }
}

test();
