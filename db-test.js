import { pool } from './src/lib/db/pool.js';
async function test() {
  const res = await pool.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'player_bounties' AND column_name = 'gold_amount'`);
  console.log('gold_amount type:', res.rows[0].data_type);
  process.exit();
}
test();
