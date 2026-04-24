const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/blackworld',
});

async function run() {
  await client.connect();
  console.log('Connected to local PostgreSQL Blackworld Database');

  try {
    await client.query(`
      ALTER TABLE players ADD COLUMN IF NOT EXISTS email text UNIQUE;
      ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash text;
      ALTER TABLE players ADD COLUMN IF NOT EXISTS session_token text;
    `);
    console.log('[SUCCESS] Auth Columns added to players table');
  } catch (e) {
    // If the table doesn't exist, create it (mocking Supabase default structure)
    if (e.message.includes('relation "players" does not exist')) {
       console.log('Players table missing, building initial schema...');
       await client.query(`
          CREATE TABLE players (
             id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             clerk_user_id text UNIQUE NOT NULL,
             username text,
             hero_data jsonb DEFAULT '{}'::jsonb,
             created_at timestamp with time zone DEFAULT now(),
             level integer DEFAULT 1,
             email text UNIQUE,
             password_hash text,
             session_token text
          );
       `);
       console.log('[SUCCESS] Created players table with Auth extensions.');
    } else {
       console.error('[ERROR]', e);
    }
  }

  await client.end();
}

run();
