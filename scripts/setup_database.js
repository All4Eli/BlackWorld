const { Client } = require('pg');

async function main() {
  // First connect to 'postgres' default DB to create our database
  const adminClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'E87319ee',
    database: 'postgres'
  });

  await adminClient.connect();
  console.log('[OK] Connected to PostgreSQL');

  // Check if blackworld DB exists
  const dbCheck = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = 'blackworld'"
  );

  if (dbCheck.rows.length === 0) {
    console.log('[CREATING] blackworld database...');
    await adminClient.query('CREATE DATABASE blackworld');
    console.log('[OK] blackworld database created');
  } else {
    console.log('[OK] blackworld database already exists');
  }
  await adminClient.end();

  // Now connect to blackworld and build the schema
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'E87319ee',
    database: 'blackworld'
  });

  await client.connect();
  console.log('[OK] Connected to blackworld database');

  // ============================================
  // CORE TABLES
  // ============================================

  // 1. PLAYERS — The central hub of all game state
  await client.query(`
    CREATE TABLE IF NOT EXISTS players (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id text UNIQUE NOT NULL,
      email text UNIQUE,
      password_hash text,
      username text,
      hero_data jsonb DEFAULT '{}'::jsonb,
      stage text DEFAULT 'BOOT',
      level integer DEFAULT 1,
      achievement_points integer DEFAULT 0,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] players table');

  // 2. MESSAGES — Player-to-player mail system
  await client.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id text NOT NULL,
      receiver_id text NOT NULL,
      subject text,
      content text NOT NULL,
      is_read boolean DEFAULT false,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] messages table');

  // 3. NOTIFICATIONS — Server alerts & system notifications
  await client.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      type text NOT NULL,
      message text NOT NULL,
      is_read boolean DEFAULT false,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] notifications table');

  // 4. CHAT_MESSAGES — Global chat system
  await client.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      username text NOT NULL,
      message text NOT NULL,
      channel text DEFAULT 'global',
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] chat_messages table');

  // 5. COVENS — Guild/clan system
  await client.query(`
    CREATE TABLE IF NOT EXISTS covens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      leader_id text NOT NULL,
      description text DEFAULT '',
      members jsonb DEFAULT '[]'::jsonb,
      max_members integer DEFAULT 20,
      level integer DEFAULT 1,
      treasury integer DEFAULT 0,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] covens table');

  // 6. AUCTION_LISTINGS — Player marketplace
  await client.query(`
    CREATE TABLE IF NOT EXISTS auction_listings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id text NOT NULL,
      seller_name text,
      item jsonb NOT NULL,
      price integer NOT NULL,
      status text DEFAULT 'active',
      buyer_id text,
      created_at timestamp with time zone DEFAULT now(),
      expires_at timestamp with time zone
    );
  `);
  console.log('[OK] auction_listings table');

  // 7. PVP_STATS — Player versus Player rankings
  await client.query(`
    CREATE TABLE IF NOT EXISTS pvp_stats (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id text UNIQUE NOT NULL,
      elo_rating integer DEFAULT 1000,
      wins integer DEFAULT 0,
      losses integer DEFAULT 0,
      is_active boolean DEFAULT false,
      last_match timestamp with time zone,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] pvp_stats table');

  // 8. CRAFTING_RECIPES — Recipe definitions
  await client.query(`
    CREATE TABLE IF NOT EXISTS crafting_recipes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
      result jsonb NOT NULL DEFAULT '{}'::jsonb,
      level_required integer DEFAULT 1,
      category text DEFAULT 'general',
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] crafting_recipes table');

  // 9. BOUNTIES — Active bounty/quest board
  await client.query(`
    CREATE TABLE IF NOT EXISTS bounties (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      reward_gold integer DEFAULT 0,
      reward_xp integer DEFAULT 0,
      reward_items jsonb DEFAULT '[]'::jsonb,
      requirements jsonb DEFAULT '{}'::jsonb,
      difficulty text DEFAULT 'normal',
      is_active boolean DEFAULT true,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] bounties table');

  // 10. LEADERBOARD VIEW — We'll use the players table directly,
  //     but create an index for fast leaderboard queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_players_level ON players (level DESC);
    CREATE INDEX IF NOT EXISTS idx_players_clerk_user_id ON players (clerk_user_id);
    CREATE INDEX IF NOT EXISTS idx_players_email ON players (email);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages (receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages (channel, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auction_status ON auction_listings (status);
    CREATE INDEX IF NOT EXISTS idx_pvp_elo ON pvp_stats (elo_rating DESC);
    CREATE INDEX IF NOT EXISTS idx_covens_name ON covens (name);
  `);
  console.log('[OK] All indexes created');

  // ============================================
  // SEED DATA — Default crafting recipes
  // ============================================
  const recipeCount = await client.query('SELECT COUNT(*) FROM crafting_recipes');
  if (parseInt(recipeCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO crafting_recipes (name, description, ingredients, result, level_required, category) VALUES
      ('Iron Sword', 'A sturdy blade forged from iron ingots.', '[{"name":"Iron Ingot","qty":3},{"name":"Leather Wrap","qty":1}]', '{"name":"Iron Sword","type":"WEAPON","tier":"COMMON","stat":8}', 1, 'weapons'),
      ('Steel Shield', 'A defensive shield of reinforced steel.', '[{"name":"Steel Plate","qty":2},{"name":"Iron Ingot","qty":1}]', '{"name":"Steel Shield","type":"WEAPON","tier":"UNCOMMON","stat":12}', 3, 'weapons'),
      ('Shadow Cloak', 'A cloak woven from shadow essence.', '[{"name":"Shadow Thread","qty":5},{"name":"Dark Crystal","qty":1}]', '{"name":"Shadow Cloak","type":"ARMOR","tier":"RARE","stat":15}', 5, 'armor'),
      ('Blood Amulet', 'An amulet pulsing with dark energy.', '[{"name":"Blood Ruby","qty":1},{"name":"Gold Chain","qty":1},{"name":"Dark Crystal","qty":1}]', '{"name":"Blood Amulet","type":"ACCESSORY","tier":"EPIC","stat":20}', 8, 'accessories'),
      ('Healing Salve', 'Restores a moderate amount of HP.', '[{"name":"Herb Bundle","qty":2},{"name":"Pure Water","qty":1}]', '{"name":"Healing Salve","type":"CONSUMABLE","effect":"heal","value":30}', 1, 'consumables'),
      ('Mana Crystal', 'Restores mana during combat.', '[{"name":"Crystal Shard","qty":3},{"name":"Arcane Dust","qty":1}]', '{"name":"Mana Crystal","type":"CONSUMABLE","effect":"mana","value":25}', 2, 'consumables')
    `);
    console.log('[OK] Seeded 6 default crafting recipes');
  }

  // Seed default bounties
  const bountyCount = await client.query('SELECT COUNT(*) FROM bounties');
  if (parseInt(bountyCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO bounties (title, description, reward_gold, reward_xp, difficulty) VALUES
      ('Blood Harvest', 'Slay 5 enemies in any zone.', 200, 80, 'easy'),
      ('Essence Expenditure', 'Spend 40 Essence exploring.', 100, 50, 'easy'),
      ('Dark Tithe', 'Loot 150 Gold from the Catacombs.', 300, 100, 'normal'),
      ('Bone Collector', 'Defeat 10 Skeletal enemies.', 400, 150, 'normal'),
      ('Abyssal Walker', 'Explore 3 different zones in one session.', 500, 200, 'hard')
    `);
    console.log('[OK] Seeded 5 default bounties');
  }

  // ============================================
  // SUMMARY
  // ============================================
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('\n========================================');
  console.log('  BLACKWORLD DATABASE — SCHEMA COMPLETE');
  console.log('========================================');
  console.log('Tables:');
  tables.rows.forEach(r => console.log('  ✓ ' + r.table_name));

  const playerCount = await client.query('SELECT COUNT(*) FROM players');
  console.log('\nTotal players:', playerCount.rows[0].count);
  console.log('========================================\n');

  await client.end();
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
