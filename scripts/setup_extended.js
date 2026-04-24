const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'E87319ee',
    database: 'blackworld'
  });

  await client.connect();
  console.log('[OK] Connected to blackworld');

  // WORLD_EVENTS — Global event banners
  await client.query(`
    CREATE TABLE IF NOT EXISTS world_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      event_type text DEFAULT 'global',
      is_active boolean DEFAULT true,
      bonus jsonb DEFAULT '{}'::jsonb,
      starts_at timestamp with time zone DEFAULT now(),
      ends_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] world_events table');

  // BOSS_MONSTERS — Zone boss definitions
  await client.query(`
    CREATE TABLE IF NOT EXISTS boss_monsters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      zone_id text NOT NULL,
      hp integer NOT NULL DEFAULT 200,
      damage integer NOT NULL DEFAULT 20,
      defense integer DEFAULT 5,
      tier text DEFAULT 'ELITE',
      loot_table jsonb DEFAULT '[]'::jsonb,
      xp_reward integer DEFAULT 100,
      gold_reward integer DEFAULT 50,
      is_active boolean DEFAULT true,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] boss_monsters table');

  // ACHIEVEMENTS — Achievement definitions
  await client.query(`
    CREATE TABLE IF NOT EXISTS achievements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text UNIQUE NOT NULL,
      name text NOT NULL,
      description text,
      icon text DEFAULT '★',
      category text DEFAULT 'general',
      points integer DEFAULT 10,
      requirement jsonb DEFAULT '{}'::jsonb,
      created_at timestamp with time zone DEFAULT now()
    );
  `);
  console.log('[OK] achievements table');

  // PLAYER_ACHIEVEMENTS — Tracking which achievements players have unlocked
  await client.query(`
    CREATE TABLE IF NOT EXISTS player_achievements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id text NOT NULL,
      achievement_id uuid NOT NULL REFERENCES achievements(id),
      unlocked_at timestamp with time zone DEFAULT now(),
      UNIQUE(player_id, achievement_id)
    );
  `);
  console.log('[OK] player_achievements table');

  // Add indexes
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_boss_monsters_zone ON boss_monsters (zone_id);
    CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements (player_id);
    CREATE INDEX IF NOT EXISTS idx_world_events_active ON world_events (is_active);
  `);
  console.log('[OK] Indexes created');

  // ============================================
  // SEED: Achievements
  // ============================================
  const achCount = await client.query('SELECT COUNT(*) FROM achievements');
  if (parseInt(achCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO achievements (key, name, description, icon, category, points, requirement) VALUES
      ('first_blood',    'First Blood',       'Slay your first enemy.',           '⚔', 'combat',      10, '{"kills": 1}'),
      ('dozen_slayer',   'Dozen Slayer',      'Slay 12 enemies.',                 '⚔', 'combat',      20, '{"kills": 12}'),
      ('centurion',      'Centurion',         'Slay 100 enemies.',                '⚔', 'combat',      50, '{"kills": 100}'),
      ('reach_level_5',  'Acolyte',           'Reach level 5.',                   '✦', 'progression', 15, '{"level": 5}'),
      ('reach_level_10', 'Dark Apprentice',   'Reach level 10.',                  '✦', 'progression', 30, '{"level": 10}'),
      ('reach_level_25', 'Shadow Master',     'Reach level 25.',                  '✦', 'progression', 75, '{"level": 25}'),
      ('first_artifact', 'Collector',         'Obtain your first artifact.',      '◆', 'loot',        10, '{"artifacts": 1}'),
      ('ten_artifacts',  'Hoarder',           'Collect 10 artifacts.',            '◆', 'loot',        25, '{"artifacts": 10}'),
      ('gold_hoarder',   'Gold Hoarder',      'Accumulate 1000 gold.',            '◆', 'wealth',      20, '{"gold": 1000}'),
      ('bank_baron',     'Bank Baron',        'Store 5000 gold in the bank.',     '◆', 'wealth',      40, '{"bankedGold": 5000}'),
      ('join_coven',     'Brotherhood',       'Join or create a coven.',          '⛨', 'social',      15, '{"coven": true}'),
      ('first_craft',    'Apprentice Smith',  'Craft your first item.',           '⚒', 'crafting',    10, '{"crafts": 1}'),
      ('die_once',       'Mortal Coil',       'Die for the first time.',          '☠', 'misc',        5,  '{"deaths": 1}'),
      ('survive_10',     'Deathless',         'Win 10 combats without dying.',    '☠', 'combat',      35, '{"winStreak": 10}'),
      ('max_enhance',    'Master Forger',     'Enhance an artifact to +10.',      '⚒', 'crafting',    50, '{"maxEnhance": 10}')
    `);
    console.log('[OK] Seeded 15 achievements');
  }

  // ============================================
  // SEED: Boss Monsters
  // ============================================
  const bossCount = await client.query('SELECT COUNT(*) FROM boss_monsters');
  if (parseInt(bossCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO boss_monsters (name, zone_id, hp, damage, defense, tier, xp_reward, gold_reward, loot_table) VALUES
      ('Bone Wraith',         'bone_crypts',      300,  25, 8,  'ELITE',     150, 80,  '[{"name":"Bone Crown","type":"ARMOR","tier":"RARE","stat":14}]'),
      ('The Hollow King',     'bone_crypts',      600,  40, 15, 'LEGENDARY', 400, 200, '[{"name":"Hollowed Scepter","type":"WEAPON","tier":"EPIC","stat":22}]'),
      ('Shadow Serpent',      'shadow_forest',     250,  30, 6,  'ELITE',     120, 60,  '[{"name":"Serpent Fang","type":"WEAPON","tier":"RARE","stat":16}]'),
      ('The Watcher',         'shadow_forest',     500,  35, 12, 'LEGENDARY', 350, 180, '[{"name":"Eye of the Watcher","type":"ACCESSORY","tier":"EPIC","stat":18}]'),
      ('Crimson Golem',       'crimson_wastes',    400,  45, 20, 'ELITE',     200, 100, '[{"name":"Crimson Core","type":"ACCESSORY","tier":"RARE","stat":15}]'),
      ('The Defiler',         'crimson_wastes',    800,  55, 25, 'LEGENDARY', 500, 300, '[{"name":"Defilers Edge","type":"WEAPON","tier":"LEGENDARY","stat":30}]'),
      ('Plague Bearer',       'plaguelands',       350,  35, 10, 'ELITE',     180, 90,  '[{"name":"Plague Mask","type":"ARMOR","tier":"RARE","stat":13}]'),
      ('Abyssal Hydra',       'the_abyss',         1000, 60, 30, 'LEGENDARY', 750, 500, '[{"name":"Abyssal Trident","type":"WEAPON","tier":"CELESTIAL","stat":40}]')
    `);
    console.log('[OK] Seeded 8 boss monsters');
  }

  // ============================================
  // SEED: A sample world event
  // ============================================
  const eventCount = await client.query('SELECT COUNT(*) FROM world_events');
  if (parseInt(eventCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO world_events (title, description, event_type, is_active, bonus) VALUES
      ('Blood Moon Rising', 'The blood moon empowers all who fight beneath it. +25% XP and +15% Gold for all combat encounters.', 'global', true, '{"xpBonus": 0.25, "goldBonus": 0.15}')
    `);
    console.log('[OK] Seeded 1 world event');
  }

  // Final summary
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('\n========================================');
  console.log('  BLACKWORLD DATABASE — FULLY BUILT');
  console.log('========================================');
  tables.rows.forEach(r => console.log('  ✓ ' + r.table_name));
  console.log('========================================\n');

  await client.end();
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
