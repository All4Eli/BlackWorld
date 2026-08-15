const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'E87319ee',
    database: 'blackworld'
  });
  await client.connect();
  console.log('[CONNECTED] blackworld database');

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_bounties (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        target_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
        setter_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
        gold_amount     integer NOT NULL,
        status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLAIMED')),
        created_at      timestamptz NOT NULL DEFAULT now(),
        claimed_by      text REFERENCES players(clerk_user_id),
        claimed_at      timestamptz
      );
    `);
    console.log('[OK] player_bounties table created');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
