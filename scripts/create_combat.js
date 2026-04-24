const { pool } = require('../src/lib/db/pool');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS combat_sessions (
      player_id text PRIMARY KEY REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      monster_id text NOT NULL,
      zone_id text NOT NULL,
      player_hp int NOT NULL,
      monster_hp int NOT NULL,
      turn_count int DEFAULT 0,
      player_statuses jsonb DEFAULT '{}'::jsonb,
      monster_statuses jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  console.log('table created');
  process.exit();
}

main();
