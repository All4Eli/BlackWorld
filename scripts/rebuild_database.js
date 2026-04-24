const { Client } = require('pg');

// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — PRODUCTION DATABASE SCHEMA v2.0
// ═══════════════════════════════════════════════════════════════════
// Design principles:
//   1. Database-first — all game logic derives from this schema
//   2. No redundant tables — each table has a single responsibility
//   3. Foreign keys with ON DELETE CASCADE where ownership is clear
//   4. CHECK constraints for all enums/ranges
//   5. GIN indexes on JSONB for query performance
//   6. Composite indexes for hot query paths
//   7. Timestamptz everywhere (timezone-aware)
//   8. UUID primary keys for horizontal scaling
//   9. Text-based player_id FK pattern for auth compatibility
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const client = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'E87319ee',
    database: 'blackworld'
  });
  await client.connect();
  console.log('[CONNECTED] blackworld database\n');

  // ══════════════════════════════════════
  //  DROP EVERYTHING — CLEAN SLATE
  // ══════════════════════════════════════
  console.log('═══ DROPPING ALL TABLES ═══');
  await client.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
  console.log('[OK] All tables dropped\n');

  // ══════════════════════════════════════════════════════════════════
  //  TIER 1 — IDENTITY & AUTH
  // ══════════════════════════════════════════════════════════════════
  console.log('═══ TIER 1: IDENTITY & AUTH ═══');

  await client.query(`
    CREATE TABLE players (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id   text UNIQUE NOT NULL,
      email           text UNIQUE,
      password_hash   text,
      username        text NOT NULL,
      avatar_url      text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      last_login      timestamptz DEFAULT now(),
      is_banned       boolean NOT NULL DEFAULT false,
      ban_reason      text,
      ban_expires_at  timestamptz
    );
  `);
  console.log('[OK] players');

  await client.query(`
    CREATE TABLE sessions (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      token_hash      text NOT NULL,
      ip_address      inet,
      user_agent      text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      expires_at      timestamptz NOT NULL,
      revoked_at      timestamptz
    );
  `);
  console.log('[OK] sessions');

  await client.query(`
    CREATE TABLE login_history (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      ip_address      inet,
      user_agent      text,
      success         boolean NOT NULL,
      failure_reason  text,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] login_history');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 2 — PLAYER GAME STATE
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 2: PLAYER GAME STATE ═══');

  await client.query(`
    CREATE TABLE hero_stats (
      player_id         text PRIMARY KEY REFERENCES players(clerk_user_id) ON DELETE CASCADE,

      -- Stage / Progression
      stage             text NOT NULL DEFAULT 'BOOT' CHECK (stage IN ('BOOT','CREATION','PLAYING','DEAD')),
      level             integer NOT NULL DEFAULT 1 CHECK (level >= 1),
      xp                integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
      gold              integer NOT NULL DEFAULT 0 CHECK (gold >= 0),
      kills             integer NOT NULL DEFAULT 0,
      deaths            integer NOT NULL DEFAULT 0,

      -- Core Attributes
      str               integer NOT NULL DEFAULT 5 CHECK (str >= 0),
      def               integer NOT NULL DEFAULT 5 CHECK (def >= 0),
      dex               integer NOT NULL DEFAULT 5 CHECK (dex >= 0),
      int               integer NOT NULL DEFAULT 5 CHECK (int >= 0),
      vit               integer NOT NULL DEFAULT 5 CHECK (vit >= 0),
      unspent_points    integer NOT NULL DEFAULT 0 CHECK (unspent_points >= 0),

      -- Vitals
      hp                integer NOT NULL DEFAULT 100,
      max_hp            integer NOT NULL DEFAULT 100,
      mana              integer NOT NULL DEFAULT 50,
      max_mana          integer NOT NULL DEFAULT 50,

      -- Combat
      base_dmg          integer NOT NULL DEFAULT 12,
      flasks            integer NOT NULL DEFAULT 3 CHECK (flasks >= 0),
      max_flasks        integer NOT NULL DEFAULT 3,

      -- Resources
      essence           integer NOT NULL DEFAULT 100 CHECK (essence >= 0),
      max_essence       integer NOT NULL DEFAULT 100,
      essence_regen_at  timestamptz NOT NULL DEFAULT now(),

      -- Economy
      bank_balance      integer NOT NULL DEFAULT 0 CHECK (bank_balance >= 0),

      -- Skill Tree (skill_id -> rank)
      skill_points      jsonb NOT NULL DEFAULT '{}'::jsonb,
      skill_points_unspent integer NOT NULL DEFAULT 0 CHECK (skill_points_unspent >= 0),

      -- Tomes  
      learned_tomes     text[] DEFAULT '{}',

      -- Daily Quest State
      daily_quests      jsonb NOT NULL DEFAULT '[]'::jsonb,
      accepted_quests   jsonb NOT NULL DEFAULT '[]'::jsonb,
      daily_quest_date  date,

      -- Daily Login
      login_streak      integer NOT NULL DEFAULT 0,
      last_daily_claim  date,

      -- Timestamps
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),

      -- Legacy JSONB (backwards compat during migration)
      hero_data         jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  console.log('[OK] hero_stats');

  await client.query(`
    CREATE TABLE player_titles (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      title_key       text NOT NULL,
      title_name      text NOT NULL,
      is_equipped     boolean NOT NULL DEFAULT false,
      earned_at       timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, title_key)
    );
  `);
  console.log('[OK] player_titles');

  await client.query(`
    CREATE TABLE player_buffs (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      buff_type       text NOT NULL,
      buff_name       text NOT NULL,
      effect          jsonb NOT NULL DEFAULT '{}'::jsonb,
      stacks          integer NOT NULL DEFAULT 1,
      applied_at      timestamptz NOT NULL DEFAULT now(),
      expires_at      timestamptz,
      source          text
    );
  `);
  console.log('[OK] player_buffs');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 3 — ITEMS, INVENTORY & EQUIPMENT
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 3: ITEMS & INVENTORY ═══');

  await client.query(`
    CREATE TABLE items (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key             text UNIQUE NOT NULL,
      name            text NOT NULL,
      type            text NOT NULL CHECK (type IN ('WEAPON','ARMOR','ACCESSORY','CONSUMABLE','MATERIAL','TOME','CURRENCY')),
      slot            text CHECK (slot IN ('mainHand','offHand','body','head','ring','amulet','boots',NULL)),
      tier            text NOT NULL DEFAULT 'COMMON' CHECK (tier IN ('COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC','CELESTIAL')),
      description     text,
      icon            text,
      base_stats      jsonb NOT NULL DEFAULT '{}'::jsonb,
      buy_price       integer,
      sell_price      integer,
      level_required  integer NOT NULL DEFAULT 1 CHECK (level_required >= 1),
      drop_weight     integer NOT NULL DEFAULT 50 CHECK (drop_weight >= 0),
      min_zone_level  integer NOT NULL DEFAULT 1,
      is_tradeable    boolean NOT NULL DEFAULT true,
      is_craftable    boolean NOT NULL DEFAULT false,
      is_stackable    boolean NOT NULL DEFAULT false,
      max_stack       integer DEFAULT 99,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] items');

  await client.query(`
    CREATE TABLE inventory (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      item_id         uuid REFERENCES items(id) ON DELETE SET NULL,
      custom_name     text,
      custom_tier     text,
      enhancement     integer NOT NULL DEFAULT 0 CHECK (enhancement >= 0),
      rolled_stats    jsonb NOT NULL DEFAULT '{}'::jsonb,
      quantity        integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
      is_locked       boolean NOT NULL DEFAULT false,
      acquired_at     timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] inventory');

  await client.query(`
    CREATE TABLE equipment (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      slot            text NOT NULL CHECK (slot IN ('mainHand','offHand','body','head','ring1','ring2','amulet','boots')),
      inventory_id    uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      equipped_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, slot)
    );
  `);
  console.log('[OK] equipment');

  await client.query(`
    CREATE TABLE item_enhancements (
      inventory_id        uuid PRIMARY KEY REFERENCES inventory(id) ON DELETE CASCADE,
      current_level       integer NOT NULL DEFAULT 0,
      highest_level       integer NOT NULL DEFAULT 0,
      times_broken        integer NOT NULL DEFAULT 0,
      protection_used     integer NOT NULL DEFAULT 0,
      total_gold_spent    integer NOT NULL DEFAULT 0,
      last_attempt_at     timestamptz
    );
  `);
  console.log('[OK] item_enhancements');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 4 — WORLD, ZONES & CREATURES
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 4: WORLD & ZONES ═══');

  await client.query(`
    CREATE TABLE zones (
      id              text PRIMARY KEY,
      name            text NOT NULL,
      description     text,
      icon            text,
      level_required  integer NOT NULL DEFAULT 1,
      essence_cost    integer NOT NULL DEFAULT 8,
      gold_multiplier real NOT NULL DEFAULT 1.0,
      xp_multiplier   real NOT NULL DEFAULT 1.0,
      danger_level    text NOT NULL DEFAULT 'normal' CHECK (danger_level IN ('safe','normal','dangerous','lethal')),
      is_active       boolean NOT NULL DEFAULT true,
      sort_order      integer NOT NULL DEFAULT 0,
      environment     jsonb DEFAULT '{}'::jsonb
    );
  `);
  console.log('[OK] zones');

  await client.query(`
    CREATE TABLE monsters (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name            text NOT NULL,
      zone_id         text NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
      base_hp         integer NOT NULL CHECK (base_hp > 0),
      base_dmg        integer NOT NULL CHECK (base_dmg > 0),
      defense         integer NOT NULL DEFAULT 0,
      dodge_chance    real NOT NULL DEFAULT 0.0 CHECK (dodge_chance >= 0 AND dodge_chance <= 1),
      tier            text NOT NULL DEFAULT 'COMMON' CHECK (tier IN ('COMMON','UNCOMMON','RARE','ELITE','LEGENDARY','BOSS')),
      is_boss         boolean NOT NULL DEFAULT false,
      xp_reward       integer NOT NULL DEFAULT 20,
      gold_reward     integer NOT NULL DEFAULT 10,
      loot_table      jsonb NOT NULL DEFAULT '[]'::jsonb,
      special_abilities jsonb DEFAULT '[]'::jsonb,
      is_active       boolean NOT NULL DEFAULT true
    );
  `);
  console.log('[OK] monsters');

  await client.query(`
    CREATE TABLE npcs (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key             text UNIQUE NOT NULL,
      name            text NOT NULL,
      role            text NOT NULL CHECK (role IN ('merchant','healer','blacksmith','quest_giver','banker','gambler','arena_master','trainer')),
      zone_id         text REFERENCES zones(id),
      description     text,
      icon            text,
      dialogue        jsonb DEFAULT '{}'::jsonb,
      inventory_config jsonb DEFAULT '{}'::jsonb,
      is_active       boolean NOT NULL DEFAULT true
    );
  `);
  console.log('[OK] npcs');

  await client.query(`
    CREATE TABLE npc_shop_inventory (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      npc_id          uuid NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
      item_id         uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      stock           integer,
      restock_interval interval,
      last_restock    timestamptz DEFAULT now(),
      price_override  integer,
      sort_order      integer DEFAULT 0,
      UNIQUE (npc_id, item_id)
    );
  `);
  console.log('[OK] npc_shop_inventory');

  await client.query(`
    CREATE TABLE gathering_nodes (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      zone_id         text NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
      node_type       text NOT NULL CHECK (node_type IN ('ore','herb','wood','gem','essence','skin')),
      name            text NOT NULL,
      tier            text NOT NULL DEFAULT 'COMMON' CHECK (tier IN ('COMMON','UNCOMMON','RARE','EPIC','LEGENDARY')),
      respawn_seconds integer NOT NULL DEFAULT 300,
      gather_time_seconds integer NOT NULL DEFAULT 5,
      loot_table      jsonb NOT NULL DEFAULT '{}'::jsonb,
      min_skill_level integer NOT NULL DEFAULT 1,
      is_active       boolean NOT NULL DEFAULT true
    );
  `);
  console.log('[OK] gathering_nodes');

  await client.query(`
    CREATE TABLE player_gathering (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      skill_type      text NOT NULL CHECK (skill_type IN ('mining','herbalism','woodcutting','gemcraft','skinning')),
      skill_level     integer NOT NULL DEFAULT 1 CHECK (skill_level >= 1),
      skill_xp        integer NOT NULL DEFAULT 0 CHECK (skill_xp >= 0),
      total_gathered  integer NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, skill_type)
    );
  `);
  console.log('[OK] player_gathering');

  await client.query(`
    CREATE TABLE dungeons (
      id              text PRIMARY KEY,
      name            text NOT NULL,
      description     text,
      zone_id         text REFERENCES zones(id),
      icon            text,
      min_level       integer NOT NULL DEFAULT 1,
      max_players     integer NOT NULL DEFAULT 1,
      floor_count     integer NOT NULL DEFAULT 5,
      boss_id         uuid REFERENCES monsters(id),
      rewards         jsonb NOT NULL DEFAULT '{}'::jsonb,
      cooldown_hours  integer NOT NULL DEFAULT 24,
      difficulty      text NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('normal','hard','nightmare','inferno')),
      is_active       boolean NOT NULL DEFAULT true
    );
  `);
  console.log('[OK] dungeons');

  await client.query(`
    CREATE TABLE dungeon_runs (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      dungeon_id      text NOT NULL REFERENCES dungeons(id),
      floor_reached   integer NOT NULL DEFAULT 0,
      result          text NOT NULL CHECK (result IN ('in_progress','completed','failed','abandoned')),
      loot_earned     jsonb DEFAULT '[]'::jsonb,
      gold_earned     integer DEFAULT 0,
      xp_earned       integer DEFAULT 0,
      time_elapsed_ms integer,
      started_at      timestamptz NOT NULL DEFAULT now(),
      completed_at    timestamptz
    );
  `);
  console.log('[OK] dungeon_runs');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 5 — PROGRESSION & QUESTS
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 5: PROGRESSION & QUESTS ═══');

  await client.query(`
    CREATE TABLE quests (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key             text UNIQUE NOT NULL,
      title           text NOT NULL,
      description     text,
      type            text NOT NULL CHECK (type IN ('DAILY','STORY','BOUNTY','SIDE','WEEKLY','EVENT')),
      icon            text DEFAULT '⚔',
      objective_type  text NOT NULL,
      objective_target integer NOT NULL DEFAULT 1 CHECK (objective_target > 0),
      reward_gold     integer NOT NULL DEFAULT 0,
      reward_xp       integer NOT NULL DEFAULT 0,
      reward_items    jsonb DEFAULT '[]'::jsonb,
      prerequisite_quest uuid REFERENCES quests(id),
      level_required  integer NOT NULL DEFAULT 1,
      difficulty      text NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy','normal','hard','elite')),
      zone_id         text REFERENCES zones(id),
      npc_giver_id    uuid REFERENCES npcs(id),
      is_repeatable   boolean NOT NULL DEFAULT false,
      is_active       boolean NOT NULL DEFAULT true,
      sort_order      integer DEFAULT 0
    );
  `);
  console.log('[OK] quests');

  await client.query(`
    CREATE TABLE player_quests (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      quest_id        uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','claimed','abandoned')),
      progress        integer NOT NULL DEFAULT 0,
      accepted_at     timestamptz NOT NULL DEFAULT now(),
      completed_at    timestamptz,
      claimed_at      timestamptz,
      UNIQUE (player_id, quest_id)
    );
  `);
  console.log('[OK] player_quests');

  await client.query(`
    CREATE TABLE achievements (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      key             text NOT NULL,
      name            text NOT NULL,
      description     text,
      icon            text DEFAULT '★',
      category        text NOT NULL DEFAULT 'general',
      points          integer NOT NULL DEFAULT 10,
      unlocked_at     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (player_id, key)
    );
  `);
  console.log('[OK] achievements');

  await client.query(`
    CREATE TABLE daily_login_rewards (
      day_number      integer PRIMARY KEY CHECK (day_number >= 1 AND day_number <= 31),
      reward_type     text NOT NULL,
      reward_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
      streak_bonus    jsonb DEFAULT '{}'::jsonb,
      is_milestone    boolean NOT NULL DEFAULT false
    );
  `);
  console.log('[OK] daily_login_rewards');

  await client.query(`
    CREATE TABLE player_login_calendar (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      year_month      text NOT NULL,
      days_logged     integer NOT NULL DEFAULT 0,
      login_days      integer[] DEFAULT '{}',
      streak_current  integer NOT NULL DEFAULT 0,
      streak_best     integer NOT NULL DEFAULT 0,
      monthly_reward_claimed boolean NOT NULL DEFAULT false,
      PRIMARY KEY (player_id, year_month)
    );
  `);
  console.log('[OK] player_login_calendar');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 6 — CRAFTING & ENHANCEMENT
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 6: CRAFTING & ENHANCEMENT ═══');

  await client.query(`
    CREATE TABLE crafting_recipes (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key             text UNIQUE NOT NULL,
      name            text NOT NULL,
      description     text,
      category        text NOT NULL DEFAULT 'general' CHECK (category IN ('weapons','armor','accessories','consumables','materials','general')),
      ingredients     jsonb NOT NULL DEFAULT '[]'::jsonb,
      result_item_key text,
      result_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
      level_required  integer NOT NULL DEFAULT 1 CHECK (level_required >= 1),
      craft_time_sec  integer NOT NULL DEFAULT 0,
      gathering_skill text CHECK (gathering_skill IN ('mining','herbalism','woodcutting','gemcraft','skinning',NULL)),
      gathering_level integer DEFAULT 1,
      is_active       boolean NOT NULL DEFAULT true,
      sort_order      integer DEFAULT 0
    );
  `);
  console.log('[OK] crafting_recipes');

  await client.query(`
    CREATE TABLE enhancement_config (
      level           integer PRIMARY KEY CHECK (level >= 0 AND level <= 20),
      success_rate    real NOT NULL CHECK (success_rate > 0 AND success_rate <= 1),
      gold_cost       integer NOT NULL CHECK (gold_cost >= 0),
      break_chance    real NOT NULL DEFAULT 0 CHECK (break_chance >= 0 AND break_chance <= 1),
      stat_multiplier real NOT NULL DEFAULT 1.0,
      materials_required jsonb DEFAULT '[]'::jsonb
    );
  `);
  console.log('[OK] enhancement_config');

  await client.query(`
    CREATE TABLE enhancement_log (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      inventory_id    uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      from_level      integer NOT NULL,
      to_level        integer NOT NULL,
      success         boolean NOT NULL,
      broke           boolean NOT NULL DEFAULT false,
      gold_spent      integer NOT NULL DEFAULT 0,
      materials_used  jsonb DEFAULT '{}'::jsonb,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] enhancement_log');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 7 — SOCIAL SYSTEMS
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 7: SOCIAL SYSTEMS ═══');

  await client.query(`
    CREATE TABLE covens (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name            text UNIQUE NOT NULL,
      tag             text UNIQUE,
      leader_id       text NOT NULL REFERENCES players(clerk_user_id),
      description     text DEFAULT '',
      banner_icon     text DEFAULT '⛨',
      max_members     integer NOT NULL DEFAULT 20,
      level           integer NOT NULL DEFAULT 1,
      xp              integer NOT NULL DEFAULT 0,
      treasury        integer NOT NULL DEFAULT 0 CHECK (treasury >= 0),
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] covens');

  await client.query(`
    CREATE TABLE coven_members (
      coven_id        uuid NOT NULL REFERENCES covens(id) ON DELETE CASCADE,
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      role            text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','officer','member')),
      contribution    integer NOT NULL DEFAULT 0,
      joined_at       timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (coven_id, player_id)
    );
  `);
  console.log('[OK] coven_members');

  await client.query(`
    CREATE TABLE coven_treasury_log (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coven_id        uuid NOT NULL REFERENCES covens(id) ON DELETE CASCADE,
      player_id       text NOT NULL,
      action          text NOT NULL CHECK (action IN ('deposit','withdraw','tax','reward','upgrade')),
      amount          integer NOT NULL,
      balance_after   integer NOT NULL,
      note            text,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] coven_treasury_log');

  await client.query(`
    CREATE TABLE friends (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      friend_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
      created_at      timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, friend_id),
      CHECK (player_id <> friend_id)
    );
  `);
  console.log('[OK] friends');

  await client.query(`
    CREATE TABLE global_chat (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      username        text NOT NULL,
      message         text NOT NULL CHECK (char_length(message) <= 500),
      channel         text NOT NULL DEFAULT 'global',
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] global_chat');

  await client.query(`
    CREATE TABLE messages (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id       text NOT NULL,
      receiver_id     text NOT NULL,
      subject         text,
      content         text NOT NULL,
      is_read         boolean NOT NULL DEFAULT false,
      is_archived     boolean NOT NULL DEFAULT false,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] messages');

  await client.query(`
    CREATE TABLE notifications (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      type            text NOT NULL,
      message         text NOT NULL,
      is_read         boolean NOT NULL DEFAULT false,
      metadata        jsonb DEFAULT '{}'::jsonb,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] notifications');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 8 — ECONOMY & MARKETPLACE
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 8: ECONOMY & MARKETPLACE ═══');

  await client.query(`
    CREATE TABLE auction_listings (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id       text NOT NULL REFERENCES players(clerk_user_id),
      seller_name     text,
      item_data       jsonb NOT NULL,
      inventory_id    uuid REFERENCES inventory(id) ON DELETE SET NULL,
      price           integer NOT NULL CHECK (price > 0),
      buyout_price    integer CHECK (buyout_price IS NULL OR buyout_price > price),
      status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','expired','cancelled')),
      buyer_id        text REFERENCES players(clerk_user_id),
      created_at      timestamptz NOT NULL DEFAULT now(),
      expires_at      timestamptz NOT NULL DEFAULT (now() + interval '48 hours')
    );
  `);
  console.log('[OK] auction_listings');

  await client.query(`
    CREATE TABLE trade_log (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      action          text NOT NULL CHECK (action IN ('buy','sell','auction_buy','auction_sell','craft','enhance','deposit','withdraw','gamble','quest_reward','loot','daily_login','pvp_reward')),
      item_name       text,
      gold_amount     integer NOT NULL DEFAULT 0,
      metadata        jsonb DEFAULT '{}'::jsonb,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] trade_log');

  await client.query(`
    CREATE TABLE casino_history (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      game_type       text NOT NULL CHECK (game_type IN ('coin_flip','high_low','slots','dice','blackjack')),
      wager           integer NOT NULL CHECK (wager > 0),
      payout          integer NOT NULL DEFAULT 0 CHECK (payout >= 0),
      result          text NOT NULL CHECK (result IN ('win','loss','jackpot','push')),
      roll_data       jsonb DEFAULT '{}'::jsonb,
      played_at       timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] casino_history');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 9 — PVP & COMPETITIVE
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 9: PVP & COMPETITIVE ═══');

  await client.query(`
    CREATE TABLE pvp_stats (
      player_id       text PRIMARY KEY REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      elo_rating      integer NOT NULL DEFAULT 1000,
      wins            integer NOT NULL DEFAULT 0,
      losses          integer NOT NULL DEFAULT 0,
      win_streak      integer NOT NULL DEFAULT 0,
      best_streak     integer NOT NULL DEFAULT 0,
      is_active       boolean NOT NULL DEFAULT false,
      rank_tier       text DEFAULT 'bronze' CHECK (rank_tier IN ('bronze','silver','gold','platinum','diamond','champion','sovereign')),
      last_match      timestamptz
    );
  `);
  console.log('[OK] pvp_stats');

  await client.query(`
    CREATE TABLE pvp_matches (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attacker_id     text NOT NULL REFERENCES players(clerk_user_id),
      defender_id     text NOT NULL REFERENCES players(clerk_user_id),
      winner_id       text REFERENCES players(clerk_user_id),
      attacker_elo_before integer NOT NULL,
      defender_elo_before integer NOT NULL,
      elo_change      integer NOT NULL DEFAULT 0,
      rounds          integer NOT NULL DEFAULT 0,
      combat_log      jsonb DEFAULT '[]'::jsonb,
      gold_wagered    integer DEFAULT 0,
      fought_at       timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] pvp_matches');

  await client.query(`
    CREATE TABLE pvp_seasons (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      season_number   integer UNIQUE NOT NULL,
      name            text NOT NULL,
      starts_at       timestamptz NOT NULL,
      ends_at         timestamptz NOT NULL,
      rewards         jsonb DEFAULT '{}'::jsonb,
      is_active       boolean NOT NULL DEFAULT false
    );
  `);
  console.log('[OK] pvp_seasons');


  // ══════════════════════════════════════════════════════════════════
  //  TIER 10 — WORLD EVENTS & CONFIG
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ TIER 10: WORLD EVENTS & CONFIG ═══');

  await client.query(`
    CREATE TABLE world_events (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key             text UNIQUE,
      title           text NOT NULL,
      description     text,
      event_type      text NOT NULL DEFAULT 'global' CHECK (event_type IN ('global','zone','seasonal','boss_spawn','invasion','tournament')),
      is_active       boolean NOT NULL DEFAULT false,
      bonus           jsonb NOT NULL DEFAULT '{}'::jsonb,
      requirements    jsonb DEFAULT '{}'::jsonb,
      rewards         jsonb DEFAULT '{}'::jsonb,
      starts_at       timestamptz NOT NULL DEFAULT now(),
      ends_at         timestamptz
    );
  `);
  console.log('[OK] world_events');

  await client.query(`
    CREATE TABLE combat_log (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      zone_id         text,
      enemy_name      text NOT NULL,
      result          text NOT NULL CHECK (result IN ('victory','defeat','fled')),
      gold_earned     integer NOT NULL DEFAULT 0,
      xp_earned       integer NOT NULL DEFAULT 0,
      loot_dropped    jsonb DEFAULT '[]'::jsonb,
      rounds          integer NOT NULL DEFAULT 0,
      damage_dealt    integer DEFAULT 0,
      damage_taken    integer DEFAULT 0,
      fought_at       timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log('[OK] combat_log');

  await client.query(`
    CREATE TABLE server_config (
      key             text PRIMARY KEY,
      value           jsonb NOT NULL,
      description     text,
      updated_at      timestamptz NOT NULL DEFAULT now(),
      updated_by      text
    );
  `);
  console.log('[OK] server_config');

  await client.query(`
    CREATE TABLE resource_config (
      resource_type       text PRIMARY KEY,
      base_max            integer NOT NULL,
      regen_seconds       integer NOT NULL,
      regen_amount        integer NOT NULL DEFAULT 1,
      max_scaling_stat    text,
      max_per_stat_point  real DEFAULT 0,
      max_per_level       real DEFAULT 0
    );
  `);
  console.log('[OK] resource_config');


  // ══════════════════════════════════════════════════════════════════
  //  INDEXES — Performance-critical query paths
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ CREATING INDEXES ═══');

  const indexes = [
    // Auth & lookup
    'CREATE INDEX idx_players_email ON players(email)',
    'CREATE INDEX idx_players_username ON players(username)',
    'CREATE INDEX idx_sessions_player ON sessions(player_id)',
    'CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked_at IS NULL',
    'CREATE INDEX idx_login_history_player ON login_history(player_id, created_at DESC)',
    
    // Hero stats hot paths
    'CREATE INDEX idx_hero_stats_level ON hero_stats(level DESC)',
    'CREATE INDEX idx_hero_stats_stage ON hero_stats(stage)',
    'CREATE INDEX idx_hero_stats_gold ON hero_stats(gold DESC)',
    
    // JSONB GIN for skill_points and hero_data queries
    'CREATE INDEX idx_hero_stats_skill_points ON hero_stats USING gin(skill_points)',
    'CREATE INDEX idx_hero_stats_hero_data ON hero_stats USING gin(hero_data)',
    
    // Item catalog
    'CREATE INDEX idx_items_type ON items(type)',
    'CREATE INDEX idx_items_tier ON items(tier)',
    'CREATE INDEX idx_items_slot ON items(slot) WHERE slot IS NOT NULL',
    
    // Inventory hot path
    'CREATE INDEX idx_inventory_player ON inventory(player_id)',
    'CREATE INDEX idx_inventory_item ON inventory(item_id) WHERE item_id IS NOT NULL',
    
    // Equipment
    'CREATE INDEX idx_equipment_inventory ON equipment(inventory_id)',
    
    // World
    'CREATE INDEX idx_monsters_zone ON monsters(zone_id)',
    'CREATE INDEX idx_monsters_boss ON monsters(zone_id) WHERE is_boss = true',
    'CREATE INDEX idx_gathering_nodes_zone ON gathering_nodes(zone_id)',
    'CREATE INDEX idx_npcs_zone ON npcs(zone_id) WHERE zone_id IS NOT NULL',
    
    // Quests
    'CREATE INDEX idx_player_quests_player ON player_quests(player_id)',
    'CREATE INDEX idx_player_quests_active ON player_quests(player_id) WHERE status = \'active\'',
    
    // Achievements
    'CREATE INDEX idx_achievements_player ON achievements(player_id)',
    'CREATE INDEX idx_achievements_category ON achievements(player_id, category)',
    
    // Social
    'CREATE INDEX idx_coven_members_player ON coven_members(player_id)',
    'CREATE INDEX idx_friends_player ON friends(player_id)',
    'CREATE INDEX idx_friends_status ON friends(player_id, status)',
    'CREATE INDEX idx_chat_channel_time ON global_chat(channel, created_at DESC)',
    'CREATE INDEX idx_messages_receiver ON messages(receiver_id, is_read)',
    'CREATE INDEX idx_messages_sender ON messages(sender_id)',
    'CREATE INDEX idx_notifications_player ON notifications(player_id, is_read)',
    
    // Economy
    'CREATE INDEX idx_auction_status ON auction_listings(status) WHERE status = \'active\'',
    'CREATE INDEX idx_auction_seller ON auction_listings(seller_id)',
    'CREATE INDEX idx_auction_expires ON auction_listings(expires_at) WHERE status = \'active\'',
    'CREATE INDEX idx_trade_log_player ON trade_log(player_id, created_at DESC)',
    'CREATE INDEX idx_casino_player ON casino_history(player_id, played_at DESC)',
    
    // PvP
    'CREATE INDEX idx_pvp_elo ON pvp_stats(elo_rating DESC) WHERE is_active = true',
    'CREATE INDEX idx_pvp_matches_players ON pvp_matches(attacker_id, defender_id)',
    'CREATE INDEX idx_pvp_matches_time ON pvp_matches(fought_at DESC)',
    
    // Combat & world
    'CREATE INDEX idx_combat_log_player ON combat_log(player_id, fought_at DESC)',
    'CREATE INDEX idx_world_events_active ON world_events(is_active) WHERE is_active = true',
    'CREATE INDEX idx_dungeon_runs_player ON dungeon_runs(player_id, started_at DESC)',
    
    // Buffs (expire checks)
    'CREATE INDEX idx_player_buffs_active ON player_buffs(player_id, expires_at)',
    
    // Enhancement log
    'CREATE INDEX idx_enhancement_log_player ON enhancement_log(player_id, created_at DESC)',
    
    // Gathering
    'CREATE INDEX idx_player_gathering_player ON player_gathering(player_id)',
    
    // Titles
    'CREATE INDEX idx_player_titles_equipped ON player_titles(player_id) WHERE is_equipped = true',
  ];

  for (const idx of indexes) {
    await client.query(idx);
  }
  console.log(`[OK] ${indexes.length} indexes created`);


  // ══════════════════════════════════════════════════════════════════
  //  FINAL REPORT
  // ══════════════════════════════════════════════════════════════════
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);

  const indexCount = await client.query(`
    SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
  `);

  const fkCount = await client.query(`
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'
  `);

  const checkCount = await client.query(`
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE constraint_type = 'CHECK' AND table_schema = 'public'
  `);

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║     BLACKWORLD — PRODUCTION SCHEMA v2.0            ║');
  console.log('╠════════════════════════════════════════════════════╣');
  tables.rows.forEach((r, i) => {
    console.log(`║  ${String(i+1).padStart(2)}. ${r.table_name.padEnd(43)} ║`);
  });
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Tables:      ${String(tables.rows.length).padEnd(38)}║`);
  console.log(`║  Indexes:     ${String(indexCount.rows[0].count).padEnd(38)}║`);
  console.log(`║  Foreign Keys: ${String(fkCount.rows[0].count).padEnd(37)}║`);
  console.log(`║  CHECK rules: ${String(checkCount.rows[0].count).padEnd(38)}║`);
  console.log('╚════════════════════════════════════════════════════╝');

  await client.end();
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
