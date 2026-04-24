-- BLACKWORLD PRODUCTION SCHEMA --


    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  ;


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
  ;


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
  ;


    CREATE TABLE login_history (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      ip_address      inet,
      user_agent      text,
      success         boolean NOT NULL,
      failure_reason  text,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  ;


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
  ;


    CREATE TABLE player_titles (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      title_key       text NOT NULL,
      title_name      text NOT NULL,
      is_equipped     boolean NOT NULL DEFAULT false,
      earned_at       timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, title_key)
    );
  ;


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
  ;


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
  ;


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
  ;


    CREATE TABLE equipment (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      slot            text NOT NULL CHECK (slot IN ('mainHand','offHand','body','head','ring1','ring2','amulet','boots')),
      inventory_id    uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      equipped_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, slot)
    );
  ;


    CREATE TABLE item_enhancements (
      inventory_id        uuid PRIMARY KEY REFERENCES inventory(id) ON DELETE CASCADE,
      current_level       integer NOT NULL DEFAULT 0,
      highest_level       integer NOT NULL DEFAULT 0,
      times_broken        integer NOT NULL DEFAULT 0,
      protection_used     integer NOT NULL DEFAULT 0,
      total_gold_spent    integer NOT NULL DEFAULT 0,
      last_attempt_at     timestamptz
    );
  ;


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
  ;


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
  ;


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
  ;


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
  ;


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
  ;


    CREATE TABLE player_gathering (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      skill_type      text NOT NULL CHECK (skill_type IN ('mining','herbalism','woodcutting','gemcraft','skinning')),
      skill_level     integer NOT NULL DEFAULT 1 CHECK (skill_level >= 1),
      skill_xp        integer NOT NULL DEFAULT 0 CHECK (skill_xp >= 0),
      total_gathered  integer NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, skill_type)
    );
  ;


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
  ;


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
  ;


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
  ;


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
  ;


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
  ;


    CREATE TABLE daily_login_rewards (
      day_number      integer PRIMARY KEY CHECK (day_number >= 1 AND day_number <= 31),
      reward_type     text NOT NULL,
      reward_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
      streak_bonus    jsonb DEFAULT '{}'::jsonb,
      is_milestone    boolean NOT NULL DEFAULT false
    );
  ;


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
  ;


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
  ;


    CREATE TABLE enhancement_config (
      level           integer PRIMARY KEY CHECK (level >= 0 AND level <= 20),
      success_rate    real NOT NULL CHECK (success_rate > 0 AND success_rate <= 1),
      gold_cost       integer NOT NULL CHECK (gold_cost >= 0),
      break_chance    real NOT NULL DEFAULT 0 CHECK (break_chance >= 0 AND break_chance <= 1),
      stat_multiplier real NOT NULL DEFAULT 1.0,
      materials_required jsonb DEFAULT '[]'::jsonb
    );
  ;


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
  ;


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
  ;


    CREATE TABLE coven_members (
      coven_id        uuid NOT NULL REFERENCES covens(id) ON DELETE CASCADE,
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      role            text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','officer','member')),
      contribution    integer NOT NULL DEFAULT 0,
      joined_at       timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (coven_id, player_id)
    );
  ;


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
  ;


    CREATE TABLE friends (
      player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      friend_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
      status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
      created_at      timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, friend_id),
      CHECK (player_id <> friend_id)
    );
  ;


    CREATE TABLE global_chat (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      username        text NOT NULL,
      message         text NOT NULL CHECK (char_length(message) <= 500),
      channel         text NOT NULL DEFAULT 'global',
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  ;


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
  ;


    CREATE TABLE notifications (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      type            text NOT NULL,
      message         text NOT NULL,
      is_read         boolean NOT NULL DEFAULT false,
      metadata        jsonb DEFAULT '{}'::jsonb,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  ;


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
  ;


    CREATE TABLE trade_log (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      action          text NOT NULL CHECK (action IN ('buy','sell','auction_buy','auction_sell','craft','enhance','deposit','withdraw','gamble','quest_reward','loot','daily_login','pvp_reward')),
      item_name       text,
      gold_amount     integer NOT NULL DEFAULT 0,
      metadata        jsonb DEFAULT '{}'::jsonb,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  ;


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
  ;


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
  ;


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
  ;


    CREATE TABLE pvp_seasons (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      season_number   integer UNIQUE NOT NULL,
      name            text NOT NULL,
      starts_at       timestamptz NOT NULL,
      ends_at         timestamptz NOT NULL,
      rewards         jsonb DEFAULT '{}'::jsonb,
      is_active       boolean NOT NULL DEFAULT false
    );
  ;


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
  ;


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
  ;


    CREATE TABLE server_config (
      key             text PRIMARY KEY,
      value           jsonb NOT NULL,
      description     text,
      updated_at      timestamptz NOT NULL DEFAULT now(),
      updated_by      text
    );
  ;


    CREATE TABLE resource_config (
      resource_type       text PRIMARY KEY,
      base_max            integer NOT NULL,
      regen_seconds       integer NOT NULL,
      regen_amount        integer NOT NULL DEFAULT 1,
      max_scaling_stat    text,
      max_per_stat_point  real DEFAULT 0,
      max_per_level       real DEFAULT 0
    );
  ;


    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  ;


    SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
  ;


    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'
  ;


    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE constraint_type = 'CHECK' AND table_schema = 'public'
  ;


    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  ;


      DROP TRIGGER IF EXISTS set_updated_at ON ${table};
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_updated_at();
    ;


      CREATE INDEX IF NOT EXISTS idx_${table}_not_deleted 
      ON ${table}(id) WHERE deleted_at IS NULL;
    ;


    CREATE TABLE IF NOT EXISTS rate_limits (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id       text NOT NULL,
      action          text NOT NULL,
      window_start    timestamptz NOT NULL DEFAULT now(),
      request_count   integer NOT NULL DEFAULT 1,
      
      -- Composite key: one row per player+action per window
      UNIQUE (player_id, action, window_start)
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
      ON rate_limits(player_id, action, window_start DESC);
  ;


    CREATE TABLE IF NOT EXISTS rate_limit_config (
      action          text PRIMARY KEY,
      max_requests    integer NOT NULL DEFAULT 60,
      window_seconds  integer NOT NULL DEFAULT 60,
      penalty_seconds integer DEFAULT 0,
      description     text
    );
  ;


    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key             text PRIMARY KEY,
      player_id       text NOT NULL,
      action          text NOT NULL,
      response        jsonb,
      created_at      timestamptz NOT NULL DEFAULT now(),
      expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires 
      ON idempotency_keys(expires_at);
    CREATE INDEX IF NOT EXISTS idx_idempotency_player 
      ON idempotency_keys(player_id);
  ;


    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leaderboard_level AS
    SELECT 
      p.username,
      p.clerk_user_id,
      h.level,
      h.xp,
      h.kills,
      h.gold,
      RANK() OVER (ORDER BY h.level DESC, h.xp DESC) as rank
    FROM players p
    JOIN hero_stats h ON p.clerk_user_id = h.player_id
    WHERE p.deleted_at IS NULL AND h.stage = 'PLAYING'
    ORDER BY h.level DESC, h.xp DESC
    LIMIT 500;
  ;


    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_level_rank 
    ON mv_leaderboard_level(clerk_user_id);
  ;


    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leaderboard_pvp AS
    SELECT 
      p.username,
      p.clerk_user_id,
      pv.elo_rating,
      pv.wins,
      pv.losses,
      pv.rank_tier,
      pv.best_streak,
      RANK() OVER (ORDER BY pv.elo_rating DESC) as rank
    FROM players p
    JOIN pvp_stats pv ON p.clerk_user_id = pv.player_id
    WHERE p.deleted_at IS NULL AND pv.is_active = true
    ORDER BY pv.elo_rating DESC
    LIMIT 500;
  ;


    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pvp_rank 
    ON mv_leaderboard_pvp(clerk_user_id);
  ;


    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leaderboard_wealth AS
    SELECT
      p.username,
      p.clerk_user_id,
      (h.gold + h.bank_balance) as total_wealth,
      h.gold,
      h.bank_balance,
      h.level,
      RANK() OVER (ORDER BY (h.gold + h.bank_balance) DESC) as rank
    FROM players p
    JOIN hero_stats h ON p.clerk_user_id = h.player_id
    WHERE p.deleted_at IS NULL AND h.stage = 'PLAYING'
    ORDER BY total_wealth DESC
    LIMIT 500;
  ;


    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_wealth_rank 
    ON mv_leaderboard_wealth(clerk_user_id);
  ;

,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_combat_log_p_player ON combat_log(player_id, fought_at DESC)',
      ]
    },
    {
      name: 'trade_log',
      timeCol: 'created_at',
      definition: ;

,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_trade_log_p_player ON trade_log(player_id, created_at DESC)',
      ]
    },
    {
      name: 'global_chat',
      timeCol: 'created_at',
      definition: ;

,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_chat_p_channel ON global_chat(channel, created_at DESC)',
      ]
    },
    {
      name: 'login_history',
      timeCol: 'created_at',
      definition: ;

,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_login_hist_p_player ON login_history(player_id, created_at DESC)',
      ]
    },
    {
      name: 'casino_history',
      timeCol: 'played_at',
      definition: ;

,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_casino_p_player ON casino_history(player_id, played_at DESC)',
      ]
    },
    {
      name: 'enhancement_log',
      timeCol: 'created_at',
      definition: ;

,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_enhance_p_player ON enhancement_log(player_id, created_at DESC)',
      ]
    }
  ];

  // Generate month partitions for the next 12 months
  const partitionMonths = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const nextD = new Date(year, d.getMonth() + 1, 1);
    const nextYear = nextD.getFullYear();
    const nextMonth = String(nextD.getMonth() + 1).padStart(2, '0');
    partitionMonths.push({
      suffix: ;


      CREATE TABLE ${table.name} (
        ${table.definition}
      ) PARTITION BY RANGE (${table.timeCol});
    ;


        CREATE TABLE IF NOT EXISTS ${table.name}_${m.suffix}
        PARTITION OF ${table.name}
        FOR VALUES FROM ('${m.from}') TO ('${m.to}');
      ;


      CREATE TABLE IF NOT EXISTS ${table.name}_default
      PARTITION OF ${table.name} DEFAULT;
    ;


    CREATE OR REPLACE FUNCTION refresh_leaderboards()
    RETURNS void AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard_level;
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard_pvp;
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard_wealth;
    END;
    $$ LANGUAGE plpgsql;
  ;


    CREATE OR REPLACE FUNCTION cleanup_idempotency_keys()
    RETURNS integer AS $$
    DECLARE
      deleted_count integer;
    BEGIN
      DELETE FROM idempotency_keys WHERE expires_at < now();
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;
  ;


    CREATE OR REPLACE FUNCTION cleanup_rate_limits()
    RETURNS integer AS $$
    DECLARE
      deleted_count integer;
    BEGIN
      DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;
  ;


    CREATE OR REPLACE FUNCTION expire_old_auctions()
    RETURNS integer AS $$
    DECLARE
      expired_count integer;
    BEGIN
      UPDATE auction_listings 
      SET status = 'expired' 
      WHERE status = 'active' AND expires_at < now();
      GET DIAGNOSTICS expired_count = ROW_COUNT;
      RETURN expired_count;
    END;
    $$ LANGUAGE plpgsql;
  ;


    CREATE OR REPLACE FUNCTION cleanup_expired_buffs()
    RETURNS integer AS $$
    DECLARE
      deleted_count integer;
    BEGIN
      DELETE FROM player_buffs WHERE expires_at IS NOT NULL AND expires_at < now();
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;
  ;

-- PHASE 13 MONETIZATION AND PREMIUM LAYER

-- SECTION 1
CREATE TABLE IF NOT EXISTS player_premium (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  blood_stones INT DEFAULT 0,
  blood_stones_purchased BIGINT DEFAULT 0,
  blood_stones_earned BIGINT DEFAULT 0,
  blood_stones_spent BIGINT DEFAULT 0,
  first_purchase_bonus_claimed BOOLEAN DEFAULT false,
  last_daily_claim DATE,
  consecutive_daily_claims INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blood_stone_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  transaction_type TEXT CHECK (transaction_type IN (
    'purchase', 'daily_login', 'achievement', 'battle_pass', 
    'event_reward', 'quest_reward', 'pvp_season', 'compensation',
    'enhancement_protection', 'cosmetic_purchase', 'battle_pass_purchase',
    'inventory_expansion', 'crafting_boost', 'name_change', 'refund'
  )),
  reference_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS premium_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN (
    'blood_stone_pack', 'cosmetic', 'convenience', 'battle_pass', 
    'bundle', 'limited_time', 'starter_pack'
  )),
  blood_stone_cost INT,
  real_money_cost_cents INT,
  blood_stones_granted INT,
  bonus_blood_stones INT DEFAULT 0,
  items_granted JSONB,
  is_one_time_purchase BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  limited_quantity INT,
  purchased_count INT DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  store_item_id UUID REFERENCES premium_store(id),
  blood_stones_spent INT DEFAULT 0,
  real_money_cents INT DEFAULT 0,
  payment_provider TEXT,
  payment_reference TEXT,
  status TEXT CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);


-- SECTION 2: Enhancement
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
); -- mock items table if not fully defined

-- We alter inventory to hold enhancement tracking
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS enhancement_level INT DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS times_broken INT DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS protection_used INT DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS highest_level_reached INT DEFAULT 0;
-- Or use item_enhancements if it existed... Wait, original said "ALTER TABLE item_enhancements", let's create it if it didn't exist.
CREATE TABLE IF NOT EXISTS item_enhancements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_instance_id UUID REFERENCES inventory(id) UNIQUE,
    level INT DEFAULT 0,
    times_broken INT DEFAULT 0,
    protection_used INT DEFAULT 0,
    highest_level_reached INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS enhancement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  item_instance_id UUID REFERENCES inventory(id),
  from_level INT,
  to_level INT,
  success BOOLEAN,
  broke BOOLEAN DEFAULT false,
  protection_type TEXT,
  blood_stones_used INT DEFAULT 0,
  materials_used JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enhancement_protection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  protection_type TEXT CHECK (protection_type IN ('downgrade', 'full', 'chance_boost')),
  protection_value FLOAT,
  applicable_levels INT[],
  blood_stone_cost INT,
  craftable BOOLEAN DEFAULT true,
  craft_recipe_id UUID REFERENCES recipes(id),
  created_at TIMESTAMPTZ DEFAULT now()
);


-- SECTION 3: Battle Pass
CREATE TABLE IF NOT EXISTS battle_pass_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number INT UNIQUE,
  name TEXT NOT NULL,
  theme TEXT,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  max_tier INT DEFAULT 50,
  xp_per_tier INT DEFAULT 1000,
  premium_cost_blood_stones INT DEFAULT 1000,
  premium_plus_cost_blood_stones INT DEFAULT 2500,
  premium_plus_tier_skips INT DEFAULT 10,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_pass_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES battle_pass_seasons(id),
  tier INT NOT NULL,
  track TEXT CHECK (track IN ('free', 'premium')),
  reward_type TEXT CHECK (reward_type IN (
    'blood_stones', 'gold', 'item', 'cosmetic', 'title', 
    'enhancement_scroll', 'crafting_materials', 'xp_boost',
    'skill_point', 'attribute_point', 'unique_skill', 'emote'
  )),
  reward_data JSONB,
  is_highlighted BOOLEAN DEFAULT false,
  UNIQUE(season_id, tier, track)
);

CREATE TABLE IF NOT EXISTS player_battle_pass (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  season_id UUID REFERENCES battle_pass_seasons(id),
  current_tier INT DEFAULT 0,
  current_xp INT DEFAULT 0,
  is_premium BOOLEAN DEFAULT false,
  is_premium_plus BOOLEAN DEFAULT false,
  premium_purchased_at TIMESTAMPTZ,
  claimed_free_rewards INT[] DEFAULT '{}',
  claimed_premium_rewards INT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season_id)
);

CREATE TABLE IF NOT EXISTS battle_pass_xp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  season_id UUID REFERENCES battle_pass_seasons(id),
  xp_gained INT,
  source TEXT CHECK (source IN (
    'daily_quest', 'weekly_quest', 'bp_challenge', 'monster_kill',
    'boss_kill', 'pvp_win', 'event_participation', 'achievement',
    'crafting', 'exploration', 'tier_purchase'
  )),
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_pass_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES battle_pass_seasons(id),
  week_number INT,
  name TEXT,
  description TEXT,
  objective_type TEXT,
  objective_target INT,
  xp_reward INT,
  is_premium_only BOOLEAN DEFAULT false,
  UNIQUE(season_id, week_number, name)
);

CREATE TABLE IF NOT EXISTS player_bp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  challenge_id UUID REFERENCES battle_pass_challenges(id),
  progress INT DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  claimed BOOLEAN DEFAULT false,
  UNIQUE(player_id, challenge_id)
);


-- SECTION 5: Daily Login
CREATE TABLE IF NOT EXISTS daily_login_rewards (
  day_number INT PRIMARY KEY,
  reward_type TEXT,
  reward_data JSONB,
  streak_bonus JSONB
);

CREATE TABLE IF NOT EXISTS player_monthly_login (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  year_month TEXT,
  days_logged INT DEFAULT 0,
  login_days INT[] DEFAULT '{}',
  streak_current INT DEFAULT 0,
  streak_best INT DEFAULT 0,
  monthly_reward_claimed BOOLEAN DEFAULT false,
  UNIQUE(player_id, year_month)
);


-- PHASE 14 RESOURCE SYSTEM

-- Config Table
CREATE TABLE IF NOT EXISTS resource_config (
  resource_type TEXT PRIMARY KEY,
  base_max INT,
  regen_seconds INT,
  regen_amount INT DEFAULT 1,
  max_scaling_stat TEXT,
  max_per_stat_point FLOAT,
  max_per_level FLOAT,
  premium_refill_cost INT,
  premium_regen_boost FLOAT DEFAULT 1.5
);

-- Player Resources
CREATE TABLE IF NOT EXISTS player_resources (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  vitae_current INT NOT NULL DEFAULT 100,
  vitae_max INT NOT NULL DEFAULT 100,
  vitae_last_update TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolve_current INT NOT NULL DEFAULT 50,
  resolve_max INT NOT NULL DEFAULT 50,
  resolve_last_update TIMESTAMPTZ NOT NULL DEFAULT now(),
  essence_current INT NOT NULL DEFAULT 75,
  essence_max INT NOT NULL DEFAULT 75,
  essence_last_update TIMESTAMPTZ NOT NULL DEFAULT now(),
  bonus_regen_until TIMESTAMPTZ,
  bonus_regen_multiplier FLOAT DEFAULT 1.0
);

-- Resource Transactions
CREATE TABLE IF NOT EXISTS resource_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) NOT NULL,
  resource_type TEXT CHECK (resource_type IN ('vitae', 'resolve', 'essence')),
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  action_type TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Refill Items Template Definition
CREATE TABLE IF NOT EXISTS resource_refill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  resource_type TEXT CHECK (resource_type IN ('vitae', 'resolve', 'essence', 'all')),
  restore_amount INT,
  restore_percent FLOAT,
  restore_full BOOLEAN DEFAULT false,
  blood_stone_cost INT,
  craftable BOOLEAN DEFAULT false,
  recipe_id UUID REFERENCES recipes(id),
  tier TEXT CHECK (tier IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Celestial'))
);

-- Insert starting Config
INSERT INTO resource_config (resource_type, base_max, regen_seconds, max_scaling_stat, max_per_stat_point, max_per_level, premium_refill_cost)
VALUES 
  ('vitae', 100, 300, 'vit', 2, 1, 50),
  ('resolve', 50, 600, 'cun', 1, 0.5, 25),
  ('essence', 75, 180, 'int', 1.5, 0.75, 75)
ON CONFLICT (resource_type) DO UPDATE SET
  base_max = EXCLUDED.base_max,
  regen_seconds = EXCLUDED.regen_seconds,
  max_scaling_stat = EXCLUDED.max_scaling_stat,
  max_per_stat_point = EXCLUDED.max_per_stat_point,
  max_per_level = EXCLUDED.max_per_level,
  premium_refill_cost = EXCLUDED.premium_refill_cost;

-- Link existing players
INSERT INTO player_resources (player_id, vitae_current, vitae_max, resolve_current, resolve_max, essence_current, essence_max)
SELECT id, 100, 100, 50, 50, 75, 75 FROM players
ON CONFLICT (player_id) DO NOTHING;


-- 1. Atomic Purchase Execution
CREATE OR REPLACE FUNCTION execute_auction_purchase(p_buyer_id TEXT, p_auction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auction RECORD;
    v_buyer_gold INT;
    v_item JSONB;
BEGIN
    -- 1. Lock auction row
    SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id AND status = 'ACTIVE' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Auction not found or already sold.';
    END IF;

    IF v_auction.seller_id = p_buyer_id THEN
        RAISE EXCEPTION 'Cannot buy your own auction.';
    END IF;

    -- 2. Lock buyer row
    SELECT gold INTO v_buyer_gold FROM players WHERE clerk_user_id = p_buyer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Buyer not found.'; END IF;

    IF v_buyer_gold < v_auction.buyout_price THEN
        RAISE EXCEPTION 'Insufficient gold.';
    END IF;

    -- 3. Lock seller row to prevent simultaneous writes to bank_balance
    PERFORM id FROM players WHERE clerk_user_id = v_auction.seller_id FOR UPDATE;

    -- 4. Reconstruct Item JSONB
    v_item := jsonb_build_object(
        'id', v_auction.item_id,
        'name', v_auction.item_name,
        'type', v_auction.item_type,
        'rarity', v_auction.item_rarity,
        'stats', v_auction.item_stats
    );

    -- 5. Atomic State Updates
    -- Deduct buyer gold & push item to array
    UPDATE players 
    SET gold = gold - v_auction.buyout_price,
        artifacts = COALESCE(artifacts, '[]'::jsonb) || v_item
    WHERE clerk_user_id = p_buyer_id;

    -- Give seller the gold to their bank
    UPDATE players
    SET bank_balance = COALESCE(bank_balance, 0) + v_auction.buyout_price
    WHERE clerk_user_id = v_auction.seller_id;

    -- Mark status sold
    UPDATE auctions SET status = 'SOLD' WHERE id = p_auction_id;

    -- Notify
    INSERT INTO notifications (user_id, type, message)
    VALUES (v_auction.seller_id, 'MARKET', 'Your auction for [' || v_auction.item_name || '] has sold for ' || v_auction.buyout_price || 'g! The funds have been deposited in your Bank.');

    RETURN v_item;
END;
$$;


-- 2. Atomic Listing Execution
CREATE OR REPLACE FUNCTION execute_auction_list(
    p_seller_id TEXT, 
    p_seller_name TEXT,
    p_item_id TEXT, 
    p_item_name TEXT,
    p_item_type TEXT,
    p_item_rarity TEXT,
    p_item_stats JSONB,
    p_buyout_price INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_seller_gold INT;
    v_fee INT;
    v_artifacts JSONB;
    v_item_index INT;
    v_new_auction RECORD;
    v_active_count INT;
BEGIN
    -- Check active listing limits
    SELECT count(*) INTO v_active_count FROM auctions WHERE seller_id = p_seller_id AND status = 'ACTIVE';
    IF v_active_count >= 10 THEN
        RAISE EXCEPTION 'You cannot have more than 10 active listings.';
    END IF;

    v_fee := CEIL(p_buyout_price * 0.05);

    -- Lock seller
    SELECT gold, artifacts INTO v_seller_gold, v_artifacts FROM players WHERE clerk_user_id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Player not found.'; END IF;

    IF v_seller_gold < v_fee THEN
        RAISE EXCEPTION 'Insufficient gold for listing fee.';
    END IF;

    -- Ensure they actually own the item by finding its index in the array
    SELECT position - 1 INTO v_item_index
    FROM jsonb_array_elements(v_artifacts) WITH ORDINALITY arr(elem, position)
    WHERE elem->>'id' = p_item_id;

    IF v_item_index IS NULL THEN
        RAISE EXCEPTION 'Item not found in inventory.';
    END IF;

    -- Remove item and deduct fee
    UPDATE players
    SET gold = gold - v_fee,
        artifacts = v_artifacts - v_item_index
    WHERE clerk_user_id = p_seller_id;

    -- Create auction
    INSERT INTO auctions (seller_id, seller_name, item_id, item_name, item_type, item_rarity, item_stats, buyout_price, status)
    VALUES (p_seller_id, p_seller_name, p_item_id, p_item_name, p_item_type, p_item_rarity, p_item_stats, p_buyout_price, 'ACTIVE')
    RETURNING * INTO v_new_auction;

    RETURN row_to_json(v_new_auction)::jsonb;
END;
$$;




INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('bone_crypts', 'The Bone Crypts', 'Shallow graves stretch endlessly. The dead here are restless.', '✟', 1, 8, 1, 1, 'normal', true, 1, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('ashen_wastes', 'The Ashen Wastes', 'A scorched plain where demons drag the damned into cinders.', '◬', 5, 12, 1.5, 1.4, 'normal', true, 2, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('hollow_cathedral', 'The Hollow Cathedral', 'God abandoned this place. What remains worships something far older.', '⛫', 10, 18, 2.2, 2, 'dangerous', true, 3, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('abyssal_rift', 'The Abyssal Rift', 'A tear in reality. Greater demons spill through, screaming.', '❂', 20, 25, 3.5, 3.2, 'dangerous', true, 4, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('throne_of_nothing', 'The Throne of Nothing', 'Where the world ends. The Sovereign sits and waits.', '☠', 35, 40, 6, 5, 'lethal', true, 5, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('crimson_depths', 'The Crimson Depths', 'Subterranean lakes of blood feed creatures that have never seen light.', '⚗', 15, 20, 2.8, 2.5, 'dangerous', true, 6, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('iron_wastes', 'The Iron Wastes', 'Rusted battlefields where ancient war machines still patrol, hunting the living.', '⚙', 25, 30, 4, 3.8, 'dangerous', true, 7, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('void_spire', 'The Void Spire', 'A tower that pierces dimensions. Reality frays with every step upward.', '⚶', 40, 50, 8, 7, 'lethal', true, 8, '{}'::jsonb);
INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, is_active, sort_order, environment) VALUES ('the_shallows', 'The Shallows', 'A relatively safe training ground near the capital.', '🏕', 1, 8, 1, 1, 'normal', true, 0, '{}'::jsonb);

INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('de43b851-6201-462c-895a-441eb60b2d61', 'story_first_blood', 'First Blood', 'Prove yourself. Kill your first enemy in the Bone Crypts.', 'STORY', '⚔', 'KILL_ENEMIES', 1, 50, 30, '[]'::jsonb, NULL, 1, 'easy', 'bone_crypts', NULL, false, true, 1);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('45d58801-0e4c-4be2-827c-9bc088e71842', 'story_crypt_cleared', 'Crypt Warden''s Demise', 'Defeat the Crypt Warden, guardian of the Bone Crypts.', 'STORY', '☠', 'KILL_BOSS', 1, 200, 100, '[]'::jsonb, NULL, 3, 'normal', 'bone_crypts', NULL, false, true, 2);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('09ec3780-f030-433e-8867-5cbda818a5aa', 'story_ashen_journey', 'Into the Ashes', 'Venture into the Ashen Wastes and survive 3 encounters.', 'STORY', '◬', 'KILL_ENEMIES', 3, 400, 200, '[]'::jsonb, NULL, 5, 'normal', 'ashen_wastes', NULL, false, true, 3);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('07bae202-1fc2-4a74-ba60-3a4954dcb4e8', 'story_ember_fallen', 'Fall of the Ember Sovereign', 'Defeat the Ember Sovereign to claim dominion over the Wastes.', 'STORY', '♛', 'KILL_BOSS', 1, 800, 400, '[]'::jsonb, NULL, 8, 'hard', 'ashen_wastes', NULL, false, true, 4);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('7622259d-49f9-4ebf-abfb-dd993a0b4633', 'story_cathedral_gates', 'The Hollow Gates', 'Enter the Hollow Cathedral and face what lurks within.', 'STORY', '⛫', 'KILL_ENEMIES', 5, 1000, 500, '[]'::jsonb, NULL, 10, 'normal', 'hollow_cathedral', NULL, false, true, 5);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('2f91cc46-d84d-4303-baaa-cea590ccf2d8', 'story_nameless_one', 'The Nameless One', 'Confront the Nameless Sovereign deep within the Cathedral.', 'STORY', '❂', 'KILL_BOSS', 1, 2500, 1200, '[]'::jsonb, NULL, 15, 'hard', 'hollow_cathedral', NULL, false, true, 6);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('e9c825ff-69b4-4335-ac17-96da93b7afd1', 'story_rift_breaker', 'Rift Breaker', 'Seal the Abyssal Rift by destroying the Warden.', 'STORY', '✦', 'KILL_BOSS', 1, 5000, 2500, '[]'::jsonb, NULL, 25, 'elite', 'abyssal_rift', NULL, false, true, 7);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('f581598f-2964-469b-94ee-87791fa8ca1d', 'story_final_throne', 'The Final Throne', 'Face the Throne Sovereign. End this.', 'STORY', '☠', 'KILL_BOSS', 1, 10000, 5000, '[]'::jsonb, NULL, 35, 'elite', 'throne_of_nothing', NULL, false, true, 8);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('db6b25d8-0d0b-4819-88cb-859ddd83a861', 'daily_blood_harvest', 'Blood Harvest', 'Slay 5 enemies in any zone.', 'DAILY', '⚔', 'KILL_ENEMIES', 5, 200, 80, '[]'::jsonb, NULL, 1, 'easy', NULL, NULL, true, true, 1);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('ece10ab1-484d-4fa1-89ba-2cf1e1c50143', 'daily_dark_tithe', 'Dark Tithe', 'Loot 150 Gold from combat.', 'DAILY', '¤', 'GOLD_EARNED', 150, 300, 100, '[]'::jsonb, NULL, 1, 'easy', NULL, NULL, true, true, 2);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('a83fb8c5-0c39-4a32-be4d-ea62a7a8fb4b', 'daily_dungeon_crawler', 'Dungeon Crawler', 'Complete any dungeon run.', 'DAILY', '⛫', 'COMPLETE_DUNGEON', 1, 400, 150, '[]'::jsonb, NULL, 5, 'normal', NULL, NULL, true, true, 3);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('bb29103a-4287-417d-9402-5a6c91428df9', 'daily_forge_master', 'Forge Master', 'Successfully enhance any item.', 'DAILY', '⚒', 'ENHANCE_ITEM', 1, 250, 100, '[]'::jsonb, NULL, 5, 'normal', NULL, NULL, true, true, 4);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('cb85d116-a4d0-46cc-a319-08fa82f2cf16', 'daily_arena_blood', 'Arena Blood', 'Win a PvP match.', 'DAILY', '⚔', 'PVP_WIN', 1, 350, 120, '[]'::jsonb, NULL, 10, 'normal', NULL, NULL, true, true, 5);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('610fe655-904b-4cfd-92e7-39adc1fcbc60', 'weekly_boss_slayer', 'Boss Slayer', 'Defeat 3 bosses in any zone.', 'WEEKLY', '♛', 'KILL_BOSS', 3, 1000, 500, '[]'::jsonb, NULL, 5, 'hard', NULL, NULL, true, true, 1);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('c41508db-e0d9-48d4-9077-56dce32304ce', 'weekly_gatherer', 'Master Gatherer', 'Gather 50 resources from any nodes.', 'WEEKLY', '⚗', 'GATHER_RESOURCES', 50, 800, 400, '[]'::jsonb, NULL, 5, 'normal', NULL, NULL, true, true, 2);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('9b704fc9-59ca-4ffc-866f-90213872dbb7', 'weekly_merchant_king', 'Merchant King', 'Sell 10 items on the auction house.', 'WEEKLY', '⚖', 'AUCTION_SELL', 10, 1500, 600, '[]'::jsonb, NULL, 10, 'normal', NULL, NULL, true, true, 3);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('9f0ea35d-7df1-426d-be82-8cfc11b32721', 'bounty_colossus', 'The Ashen Colossus', 'Hunt the Ashen Colossus. Bring proof of the kill.', 'BOUNTY', '☠', 'KILL_BOSS', 1, 1500, 800, '[]'::jsonb, NULL, 8, 'hard', 'ashen_wastes', NULL, false, true, 1);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('523883a4-6e2f-4c11-a352-e1e21a1dac0e', 'bounty_blood_matriarch', 'The Blood Mother', 'End the Blood Matriarch''s reign in the Crimson Depths.', 'BOUNTY', '☠', 'KILL_BOSS', 1, 3000, 1500, '[]'::jsonb, NULL, 18, 'elite', 'crimson_depths', NULL, false, true, 2);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('b424f9c5-7ead-43d8-9045-b7f28fa997ce', 'bounty_iron_tyrant', 'The Iron Tyrant', 'Destroy the Iron Tyrant war machine.', 'BOUNTY', '☠', 'KILL_BOSS', 1, 5000, 2500, '[]'::jsonb, NULL, 28, 'elite', 'iron_wastes', NULL, false, true, 3);
INSERT INTO quests (id, key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, reward_items, prerequisite_quest, level_required, difficulty, zone_id, npc_giver_id, is_repeatable, is_active, sort_order) VALUES ('b1429a37-d340-49ca-9a2f-c0a30fb7fca2', 'bounty_architect', 'The Architect of Ruin', 'Ascend the Void Spire and destroy the Architect.', 'BOUNTY', '☠', 'KILL_BOSS', 1, 15000, 8000, '[]'::jsonb, NULL, 42, 'elite', 'void_spire', NULL, false, true, 4);

INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('e47dff85-e869-44f6-80ee-b9bb0ca2927e', 'bone_crypts', 'ore', 'Bone-Crusted Iron Vein', 'COMMON', 300, 5, '{"iron_ore":{"max":3,"min":1}}'::jsonb, 1, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('d6cc7fdc-4f0e-4435-a4d3-19737007d93a', 'bone_crypts', 'herb', 'Grave Moss', 'COMMON', 240, 4, '{"charred_bone":{"max":2,"min":1}}'::jsonb, 1, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('e4fc6b7c-1b70-4c4c-8edf-7a2b6aa935c7', 'ashen_wastes', 'ore', 'Smoldering Ore Deposit', 'UNCOMMON', 360, 6, '{"iron_ore":{"max":4,"min":2}}'::jsonb, 3, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('19331fb8-ca1a-4509-bd53-c3b0db7ecef4', 'ashen_wastes', 'herb', 'Cinder Bloom', 'UNCOMMON', 300, 5, '{"demon_fang":{"max":2,"min":1}}'::jsonb, 3, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('a3624ecd-8902-4f27-be4b-c82dc518866c', 'ashen_wastes', 'skin', 'Charred Hide', 'UNCOMMON', 420, 7, '{"grave_silk":{"max":3,"min":1}}'::jsonb, 4, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('68469ed3-b530-46ca-ac90-b28340280e1a', 'hollow_cathedral', 'gem', 'Sanctified Crystal', 'RARE', 480, 8, '{"ancient_core":{"max":1,"min":1}}'::jsonb, 6, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('55bf322b-eb94-4883-86a9-dc97adaef9c8', 'hollow_cathedral', 'herb', 'Voidbloom', 'RARE', 420, 7, '{"vampiric_bloodlet":{"max":1,"min":1}}'::jsonb, 7, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('8ff90225-387f-42dc-99a8-4c4ed43a009e', 'crimson_depths', 'ore', 'Bloodstone Vein', 'RARE', 420, 7, '{"blood_crystal":{"max":2,"min":1}}'::jsonb, 5, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('11c5ea90-6e66-4495-8c99-fd0ce08aacd0', 'crimson_depths', 'herb', 'Crimson Lotus', 'RARE', 360, 6, '{"vampiric_bloodlet":{"max":2,"min":1}}'::jsonb, 6, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('8004c58e-0734-4e48-ad6c-1e60f83e047f', 'abyssal_rift', 'essence', 'Rift Essence Pool', 'EPIC', 600, 10, '{"pure_void_essence":{"max":1,"min":1}}'::jsonb, 8, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('9dbff7dd-0812-4a87-b856-7c13914b9553', 'abyssal_rift', 'gem', 'Void Crystal Cluster', 'EPIC', 540, 9, '{"void_fragment":{"max":1,"min":1}}'::jsonb, 9, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('aff3ca20-bd08-4bb3-9433-75f63f0e3113', 'iron_wastes', 'ore', 'Ancient War-Steel Node', 'EPIC', 480, 8, '{"iron_ore":{"max":6,"min":3},"ancient_core":{"max":1,"min":0}}'::jsonb, 8, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('f49f56b2-8282-4a90-8836-77079e47ddd1', 'void_spire', 'essence', 'Dimensional Tear', 'LEGENDARY', 900, 12, '{"void_fragment":{"max":2,"min":1},"celestial_dust":{"max":1,"min":0}}'::jsonb, 10, true);
INSERT INTO gathering_nodes (id, zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, is_active) VALUES ('dc9e5503-ae45-4f6e-a8b2-35cb3550b069', 'void_spire', 'gem', 'Reality Shard', 'LEGENDARY', 720, 10, '{"celestial_dust":{"max":1,"min":1}}'::jsonb, 10, true);

INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('4b82f4ed-8763-4f53-a097-4d0e79d1cfa6', 'Lich Initiate', 'bone_crypts', 45, 12, 3, 0.03, 'COMMON', false, 20, 12, '[{"qty_max":2,"qty_min":1,"item_key":"charred_bone","drop_chance":0.35},{"qty_max":1,"qty_min":1,"item_key":"rusty_scrap","drop_chance":0.3},{"qty_max":1,"qty_min":1,"item_key":"leather_coif","drop_chance":0.06},{"qty_max":1,"qty_min":1,"item_key":"minor_health_flask","drop_chance":0.18}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('895abcd0-7ab6-4a54-bae1-9910e9d8d596', 'Grave Shambler', 'bone_crypts', 55, 7, 5, 0.02, 'UNCOMMON', false, 25, 15, '[{"qty_max":3,"qty_min":1,"item_key":"charred_bone","drop_chance":0.4},{"qty_max":1,"qty_min":1,"item_key":"grave_silk","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"dusty_burial_shroud","drop_chance":0.07},{"qty_max":1,"qty_min":1,"item_key":"iron_mace","drop_chance":0.05}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('8c72a369-329c-495c-8ccc-00859e2d025f', 'The Crypt Warden', 'bone_crypts', 180, 18, 8, 0.05, 'BOSS', true, 80, 60, '[{"qty_max":1,"qty_min":1,"item_key":"bone_ring","drop_chance":0.25},{"qty_max":1,"qty_min":1,"item_key":"iron_mace","drop_chance":0.2},{"qty_max":4,"qty_min":2,"item_key":"charred_bone","drop_chance":0.5},{"qty_max":2,"qty_min":1,"item_key":"grave_silk","drop_chance":0.3},{"qty_max":1,"qty_min":1,"item_key":"tome_blood_pact","drop_chance":0.05}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('e2f38fea-df29-4ef3-bfb1-17f556bb178c', 'Ash Wraith', 'ashen_wastes', 60, 18, 4, 0.1, 'COMMON', false, 30, 20, '[{"qty_max":1,"qty_min":1,"item_key":"demon_fang","drop_chance":0.3},{"qty_max":2,"qty_min":1,"item_key":"rusty_scrap","drop_chance":0.35},{"qty_max":1,"qty_min":1,"item_key":"shadow_dagger","drop_chance":0.06}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('bdf70f6d-1042-447f-9104-12e3f369e9b4', 'Cinder Golem', 'ashen_wastes', 100, 10, 12, 0.02, 'COMMON', false, 35, 25, '[{"qty_max":3,"qty_min":1,"item_key":"iron_ore","drop_chance":0.35},{"qty_max":2,"qty_min":1,"item_key":"rusty_scrap","drop_chance":0.4},{"qty_max":1,"qty_min":1,"item_key":"ashen_aegis","drop_chance":0.04}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('5ab0a301-2f95-46a2-9d24-2df5aa1db6e3', 'Smoldering Fiend', 'ashen_wastes', 75, 22, 5, 0.08, 'UNCOMMON', false, 40, 30, '[{"qty_max":2,"qty_min":1,"item_key":"demon_fang","drop_chance":0.35},{"qty_max":1,"qty_min":1,"item_key":"grave_silk","drop_chance":0.25},{"qty_max":1,"qty_min":1,"item_key":"cinderforged_blade","drop_chance":0.05},{"qty_max":1,"qty_min":1,"item_key":"ember_band","drop_chance":0.06}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('d6e9dd2b-605e-4755-8ebc-b1b5902ffcd0', 'The Ember Sovereign', 'ashen_wastes', 280, 28, 10, 0.05, 'BOSS', true, 120, 90, '[{"qty_max":4,"qty_min":2,"item_key":"demon_fang","drop_chance":0.5},{"qty_max":3,"qty_min":2,"item_key":"iron_ore","drop_chance":0.4},{"qty_max":1,"qty_min":1,"item_key":"cinderforged_blade","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"iron_helm","drop_chance":0.12},{"qty_max":1,"qty_min":1,"item_key":"tome_iron_will","drop_chance":0.04}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('02a8fccc-fe46-40d8-b8f6-075950ed28ae', 'Void Acolyte', 'hollow_cathedral', 130, 20, 10, 0.06, 'UNCOMMON', false, 65, 50, '[{"qty_max":1,"qty_min":1,"item_key":"ancient_core","drop_chance":0.18},{"qty_max":2,"qty_min":1,"item_key":"demon_fang","drop_chance":0.25},{"qty_max":1,"qty_min":1,"item_key":"mana_potion","drop_chance":0.2},{"qty_max":1,"qty_min":1,"item_key":"sanctified_bone_plate","drop_chance":0.03}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('07170ed4-a4f4-4214-893c-d9f5729ab3e8', 'Sanguine Leech', 'crimson_depths', 80, 35, 4, 0.18, 'UNCOMMON', false, 75, 55, '[{"qty_max":2,"qty_min":1,"item_key":"vampiric_bloodlet","drop_chance":0.3},{"qty_max":1,"qty_min":1,"item_key":"blood_crystal","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"bloodforged_cleaver","drop_chance":0.03}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('9e43fe5b-5620-40c1-96cb-854e0aafc7d1', 'Greater Demon', 'abyssal_rift', 220, 42, 14, 0.08, 'RARE', false, 100, 75, '[{"qty_max":1,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"rift_torn_executioner","drop_chance":0.03},{"qty_max":1,"qty_min":1,"item_key":"greater_health_flask","drop_chance":0.18}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('b8fb8e48-601d-4ea1-aa36-e6aee0bfab08', 'Rusted Sentinel', 'iron_wastes', 250, 45, 22, 0.03, 'UNCOMMON', false, 120, 90, '[{"qty_max":6,"qty_min":3,"item_key":"iron_ore","drop_chance":0.45},{"qty_max":1,"qty_min":1,"item_key":"ancient_core","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"void_reaper","drop_chance":0.02}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('388c33d4-114b-4024-a3d0-1df0d2c1a520', 'Death Aspect', 'throne_of_nothing', 300, 60, 18, 0.1, 'RARE', false, 180, 130, '[{"qty_max":2,"qty_min":1,"item_key":"void_fragment","drop_chance":0.25},{"qty_max":1,"qty_min":1,"item_key":"celestial_dust","drop_chance":0.05},{"qty_max":1,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.2}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('1d74e50c-2f6b-4525-9511-865b266ce80a', 'Reality Fracture', 'void_spire', 400, 80, 25, 0.12, 'ELITE', false, 280, 200, '[{"qty_max":2,"qty_min":1,"item_key":"celestial_dust","drop_chance":0.15},{"qty_max":3,"qty_min":2,"item_key":"void_fragment","drop_chance":0.35},{"qty_max":1,"qty_min":1,"item_key":"entropy_blade","drop_chance":0.01}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('04d7bde5-3f16-46db-97f1-3e608eebf9e9', 'Fallen Paladin', 'hollow_cathedral', 110, 25, 8, 0.05, 'COMMON', false, 55, 40, '[{"qty_max":1,"qty_min":1,"item_key":"ancient_core","drop_chance":0.12},{"qty_max":2,"qty_min":1,"item_key":"grave_silk","drop_chance":0.3},{"qty_max":1,"qty_min":1,"item_key":"heretics_warblade","drop_chance":0.04}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('6a19fcd4-7af3-405a-b536-c7174883afa0', 'Soul Reaper', 'hollow_cathedral', 90, 30, 5, 0.12, 'UNCOMMON', false, 60, 45, '[{"qty_max":1,"qty_min":1,"item_key":"vampiric_bloodlet","drop_chance":0.15},{"qty_max":2,"qty_min":1,"item_key":"grave_silk","drop_chance":0.28},{"qty_max":1,"qty_min":1,"item_key":"soul_amulet","drop_chance":0.04},{"qty_max":1,"qty_min":1,"item_key":"health_flask","drop_chance":0.2}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('0d705157-cd84-427e-9867-d8c1147d4248', 'High Priest of Nothing', 'hollow_cathedral', 450, 45, 12, 0.1, 'BOSS', true, 280, 200, '[{"qty_max":1,"qty_min":1,"item_key":"soul_amulet","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"dreadplate_greaves","drop_chance":0.1},{"qty_max":3,"qty_min":1,"item_key":"vampiric_bloodlet","drop_chance":0.4},{"qty_max":1,"qty_min":1,"item_key":"blood_crystal","drop_chance":0.2},{"qty_max":1,"qty_min":1,"item_key":"tome_resurrection","drop_chance":0.01}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('0f5e8a92-9605-45df-bd74-4df53eda66b0', 'Blood Lurker', 'crimson_depths', 120, 28, 8, 0.12, 'COMMON', false, 70, 50, '[{"qty_max":1,"qty_min":1,"item_key":"blood_crystal","drop_chance":0.18},{"qty_max":1,"qty_min":1,"item_key":"vampiric_bloodlet","drop_chance":0.22},{"qty_max":1,"qty_min":1,"item_key":"health_flask","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"crimson_mail","drop_chance":0.03}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('495414b4-2fbd-458b-ad32-a1e0e71e0a8c', 'Crimson Behemoth', 'crimson_depths', 160, 22, 15, 0.04, 'UNCOMMON', false, 80, 60, '[{"qty_max":4,"qty_min":2,"item_key":"iron_ore","drop_chance":0.35},{"qty_max":1,"qty_min":1,"item_key":"blood_crystal","drop_chance":0.2},{"qty_max":1,"qty_min":1,"item_key":"ancient_core","drop_chance":0.1}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('ace0b5af-7190-4ee7-a232-d56ffb2cca5a', 'The Blood Matriarch', 'crimson_depths', 600, 48, 18, 0.08, 'BOSS', true, 350, 250, '[{"qty_max":1,"qty_min":1,"item_key":"bloodforged_cleaver","drop_chance":0.12},{"qty_max":1,"qty_min":1,"item_key":"crimson_mail","drop_chance":0.1},{"qty_max":4,"qty_min":2,"item_key":"blood_crystal","drop_chance":0.45},{"qty_max":3,"qty_min":2,"item_key":"vampiric_bloodlet","drop_chance":0.4},{"qty_max":2,"qty_min":1,"item_key":"greater_health_flask","drop_chance":0.25},{"qty_max":1,"qty_min":1,"item_key":"tome_blood_pact","drop_chance":0.05}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('06fa4ad7-3603-40fc-ad6c-5e2d86102f12', 'Void Stalker', 'abyssal_rift', 180, 38, 10, 0.15, 'UNCOMMON', false, 90, 65, '[{"qty_max":1,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.1},{"qty_max":1,"qty_min":1,"item_key":"void_fragment","drop_chance":0.08},{"qty_max":1,"qty_min":1,"item_key":"void_signet","drop_chance":0.03}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('de9a9424-7f6d-46e7-9394-aae885b9c32c', 'Rift Horror', 'abyssal_rift', 160, 50, 8, 0.2, 'RARE', false, 110, 80, '[{"qty_max":1,"qty_min":1,"item_key":"void_fragment","drop_chance":0.12},{"qty_max":1,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.18},{"qty_max":1,"qty_min":1,"item_key":"abyssal_carapace","drop_chance":0.02}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('f8ce4772-3094-424d-9a22-040521613284', 'Warden of the Abyss', 'abyssal_rift', 800, 60, 20, 0.1, 'BOSS', true, 500, 350, '[{"qty_max":1,"qty_min":1,"item_key":"rift_torn_executioner","drop_chance":0.15},{"qty_max":1,"qty_min":1,"item_key":"abyssal_carapace","drop_chance":0.1},{"qty_max":1,"qty_min":1,"item_key":"void_treads","drop_chance":0.1},{"qty_max":1,"qty_min":1,"item_key":"void_signet","drop_chance":0.08},{"qty_max":3,"qty_min":2,"item_key":"void_fragment","drop_chance":0.4},{"qty_max":2,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.35},{"qty_max":1,"qty_min":1,"item_key":"tome_void_walk","drop_chance":0.005}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('2141550a-b2b9-473a-b4db-ae9dfca5e9a0', 'The Eternal Devourer', 'abyssal_rift', 1000, 55, 25, 0.08, 'BOSS', true, 600, 400, '[{"qty_max":1,"qty_min":1,"item_key":"void_reaper","drop_chance":0.08},{"qty_max":4,"qty_min":2,"item_key":"void_fragment","drop_chance":0.45},{"qty_max":3,"qty_min":2,"item_key":"pure_void_essence","drop_chance":0.4},{"qty_max":1,"qty_min":1,"item_key":"void_signet","drop_chance":0.12},{"qty_max":1,"qty_min":1,"item_key":"tome_inferno","drop_chance":0.02}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('98fb5880-8b14-4458-9879-d9d8b183e7ef', 'Scrap Harvester', 'iron_wastes', 180, 55, 12, 0.1, 'RARE', false, 130, 100, '[{"qty_max":5,"qty_min":2,"item_key":"iron_ore","drop_chance":0.4},{"qty_max":1,"qty_min":1,"item_key":"ancient_core","drop_chance":0.2},{"qty_max":1,"qty_min":1,"item_key":"void_fragment","drop_chance":0.08}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('f274759d-6f5b-4407-b288-66b5b3ec3a79', 'Dire Rat', 'the_shallows', 30, 4, 1, 0.05, 'COMMON', false, 20, 10, '[]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('86c92f2a-4204-4377-a09b-837b7b20f18a', 'Slime', 'the_shallows', 45, 6, 2, 0, 'UNCOMMON', false, 20, 10, '[]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('ab973957-82ce-4362-b963-eaed2ee2a83e', 'Rat King', 'the_shallows', 80, 12, 4, 0.05, 'BOSS', false, 20, 10, '[]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('b52de9ff-78ce-4526-81aa-812118dc09f3', 'Skeletal Archer', 'bone_crypts', 35, 8, 2, 0.05, 'COMMON', false, 15, 8, '[{"qty_max":2,"qty_min":1,"item_key":"rusty_scrap","drop_chance":0.4},{"qty_max":1,"qty_min":1,"item_key":"charred_bone","drop_chance":0.3},{"qty_max":1,"qty_min":1,"item_key":"bone_shard_dagger","drop_chance":0.08},{"qty_max":1,"qty_min":1,"item_key":"minor_health_flask","drop_chance":0.15}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('8dda3ed8-fcf6-4e32-a393-fedcf92df138', 'Ashen Colossus', 'ashen_wastes', 350, 22, 18, 0.03, 'BOSS', true, 150, 110, '[{"qty_max":5,"qty_min":2,"item_key":"iron_ore","drop_chance":0.5},{"qty_max":1,"qty_min":1,"item_key":"ancient_core","drop_chance":0.12},{"qty_max":1,"qty_min":1,"item_key":"ashen_aegis","drop_chance":0.1},{"qty_max":1,"qty_min":1,"item_key":"tome_essence_mastery","drop_chance":0.08}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('1a9a5465-b3f6-4394-b4e3-2f5cf03b9cf8', 'The Nameless Sovereign', 'hollow_cathedral', 500, 40, 15, 0.08, 'BOSS', true, 250, 180, '[{"qty_max":1,"qty_min":1,"item_key":"heretics_warblade","drop_chance":0.18},{"qty_max":1,"qty_min":1,"item_key":"sanctified_bone_plate","drop_chance":0.12},{"qty_max":1,"qty_min":1,"item_key":"soul_amulet","drop_chance":0.1},{"qty_max":2,"qty_min":1,"item_key":"ancient_core","drop_chance":0.35},{"qty_max":1,"qty_min":1,"item_key":"dreadplate_greaves","drop_chance":0.08},{"qty_max":1,"qty_min":1,"item_key":"tome_inferno","drop_chance":0.02}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('96f95fd1-74fb-49dd-aee4-176f7ddd46a9', 'War Machine Alpha', 'iron_wastes', 320, 38, 28, 0.02, 'RARE', false, 140, 110, '[{"qty_max":6,"qty_min":3,"item_key":"iron_ore","drop_chance":0.5},{"qty_max":2,"qty_min":1,"item_key":"ancient_core","drop_chance":0.25},{"qty_max":1,"qty_min":1,"item_key":"void_fragment","drop_chance":0.1}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('e64b9a37-7d47-4066-8c36-4a7b77ced5f9', 'The Iron Tyrant', 'iron_wastes', 1200, 70, 30, 0.06, 'BOSS', true, 700, 500, '[{"qty_max":1,"qty_min":1,"item_key":"void_reaper","drop_chance":0.1},{"qty_max":8,"qty_min":4,"item_key":"iron_ore","drop_chance":0.6},{"qty_max":3,"qty_min":2,"item_key":"ancient_core","drop_chance":0.4},{"qty_max":2,"qty_min":1,"item_key":"void_fragment","drop_chance":0.2},{"qty_max":1,"qty_min":1,"item_key":"tome_iron_will","drop_chance":0.04}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('9290d626-36ab-4263-80c8-fc67b0188e13', 'Void Incarnate', 'throne_of_nothing', 280, 70, 15, 0.15, 'ELITE', false, 200, 150, '[{"qty_max":2,"qty_min":1,"item_key":"void_fragment","drop_chance":0.3},{"qty_max":1,"qty_min":1,"item_key":"celestial_dust","drop_chance":0.08},{"qty_max":2,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.25}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('701abaf9-39a6-4b85-b8e6-0cea30537321', 'Dimensional Wraith', 'void_spire', 350, 75, 20, 0.18, 'RARE', false, 250, 180, '[{"qty_max":1,"qty_min":1,"item_key":"celestial_dust","drop_chance":0.12},{"qty_max":2,"qty_min":1,"item_key":"void_fragment","drop_chance":0.3},{"qty_max":2,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.28}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('dd9bf149-b09c-44aa-8a02-1b6aae9fb4e7', 'Entropy Weaver', 'void_spire', 300, 90, 15, 0.22, 'ELITE', false, 300, 220, '[{"qty_max":2,"qty_min":1,"item_key":"celestial_dust","drop_chance":0.18},{"qty_max":2,"qty_min":1,"item_key":"pure_void_essence","drop_chance":0.3},{"qty_max":3,"qty_min":1,"item_key":"void_fragment","drop_chance":0.35}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('a2392de4-f386-4eb6-89ec-b537cb766611', 'The Architect of Ruin', 'void_spire', 3000, 110, 40, 0.1, 'BOSS', true, 2000, 1500, '[{"qty_max":1,"qty_min":1,"item_key":"entropy_blade","drop_chance":0.03},{"qty_max":6,"qty_min":3,"item_key":"celestial_dust","drop_chance":0.45},{"qty_max":5,"qty_min":3,"item_key":"void_fragment","drop_chance":0.55},{"qty_max":4,"qty_min":2,"item_key":"pure_void_essence","drop_chance":0.5},{"qty_max":1,"qty_min":1,"item_key":"sovereign_amulet","drop_chance":0.04},{"qty_max":1,"qty_min":1,"item_key":"tome_void_walk","drop_chance":0.005},{"qty_max":1,"qty_min":1,"item_key":"tome_resurrection","drop_chance":0.01}]'::jsonb, '[]'::jsonb, true);
INSERT INTO monsters (id, name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward, loot_table, special_abilities, is_active) VALUES ('fab7668b-7419-4823-85fc-825e12fc1acc', 'The Throne Sovereign', 'throne_of_nothing', 2000, 90, 35, 0.12, 'BOSS', true, 1200, 800, '[{"qty_max":1,"qty_min":1,"item_key":"sovereigns_edge","drop_chance":0.05},{"qty_max":1,"qty_min":1,"item_key":"crown_eternal_night","drop_chance":0.05},{"qty_max":1,"qty_min":1,"item_key":"sovereign_amulet","drop_chance":0.05},{"qty_max":4,"qty_min":2,"item_key":"celestial_dust","drop_chance":0.3},{"qty_max":5,"qty_min":3,"item_key":"void_fragment","drop_chance":0.5},{"qty_max":1,"qty_min":1,"item_key":"tome_void_walk","drop_chance":0.005},{"qty_max":1,"qty_min":1,"item_key":"tome_resurrection","drop_chance":0.01}]'::jsonb, '[]'::jsonb, true);

INSERT INTO dungeons (id, name, description, zone_id, icon, min_level, max_players, floor_count, boss_id, rewards, cooldown_hours, difficulty, is_active) VALUES ('crypt_descent', 'Crypt Descent', 'Descend through 5 floors of the deepest Bone Crypts.', 'bone_crypts', '⛫', 5, 1, 5, NULL, '{"xp":200,"gold":300}'::jsonb, 24, 'normal', true);
INSERT INTO dungeons (id, name, description, zone_id, icon, min_level, max_players, floor_count, boss_id, rewards, cooldown_hours, difficulty, is_active) VALUES ('cathedral_depths', 'Cathedral Depths', 'The Cathedral hides floors that go far below sanctified ground.', 'hollow_cathedral', '⛫', 15, 1, 7, NULL, '{"xp":600,"gold":800}'::jsonb, 24, 'hard', true);
INSERT INTO dungeons (id, name, description, zone_id, icon, min_level, max_players, floor_count, boss_id, rewards, cooldown_hours, difficulty, is_active) VALUES ('void_ascent', 'Void Ascent', 'Climb the Spire. Each floor bends reality further.', 'void_spire', '⛫', 35, 1, 10, NULL, '{"xp":2500,"gold":3000}'::jsonb, 24, 'nightmare', true);
INSERT INTO dungeons (id, name, description, zone_id, icon, min_level, max_players, floor_count, boss_id, rewards, cooldown_hours, difficulty, is_active) VALUES ('rats_nest', 'The Rats Nest', 'A festering den of vermin beneath the Shallows. Perfect for fledglings.', 'the_shallows', '🐀', 1, 1, 3, NULL, '{"xp":100,"gold":50}'::jsonb, 1, 'normal', true);

INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('f3d343a7-0631-4d32-99d2-2e0c2c36d504', 'bone_shard_dagger', 'Bone Shard Dagger', 'WEAPON', 'mainHand', 'COMMON', 'A crude blade fashioned from crypt bones.', NULL, '{"dmg":6}'::jsonb, 80, 20, 1, 80, 1, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('88739d03-97e9-4531-a9d7-46dbb1203e82', 'cinderforged_blade', 'Cinderforged Blade', 'WEAPON', 'mainHand', 'UNCOMMON', 'Forged in the eternal ash fires.', NULL, '{"dmg":14}'::jsonb, 250, 60, 5, 50, 2, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('771c2706-9b3f-41c8-b0af-f10aa58fbff3', 'heretics_warblade', 'Heretic''s Warblade', 'WEAPON', 'mainHand', 'RARE', 'Once wielded by paladins who lost their faith.', NULL, '{"dmg":24}'::jsonb, 600, 150, 10, 30, 3, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('374fcb3e-c3dc-4e0a-ae69-e18c1aa37ccc', 'rift_torn_executioner', 'Rift-Torn Executioner', 'WEAPON', 'mainHand', 'EPIC', 'The blade phases between dimensions.', NULL, '{"dmg":38}'::jsonb, 1500, 375, 20, 15, 4, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('f2161b22-f963-4a32-8955-19a653694589', 'sovereigns_edge', 'The Sovereign''s Edge', 'WEAPON', 'mainHand', 'LEGENDARY', 'The final blade. It hungers for a throne.', NULL, '{"dmg":60}'::jsonb, 5000, 1250, 35, 5, 5, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('f310769d-62a9-4dd5-a5f2-ac5f4bc4fbb5', 'bloodforged_cleaver', 'Bloodforged Cleaver', 'WEAPON', 'mainHand', 'RARE', 'Drinks deeply from every wound it inflicts.', NULL, '{"dmg":20,"lifesteal":3}'::jsonb, 800, 200, 12, 25, 3, true, true, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('28878101-6020-4d1e-abde-6593889795a5', 'void_reaper', 'Void Reaper', 'WEAPON', 'mainHand', 'EPIC', 'Cuts through armor as if it were air.', NULL, '{"dmg":42,"crit":5}'::jsonb, 2000, 500, 25, 10, 4, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('8619c722-8705-4ce0-9258-e7be52924a75', 'entropy_blade', 'Entropy Blade', 'WEAPON', 'mainHand', 'MYTHIC', 'Reality unravels where this blade strikes.', NULL, '{"dmg":75,"crit":8,"lifesteal":5}'::jsonb, 10000, 2500, 40, 2, 5, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('389ef75e-615d-4b9d-a60a-99bb7bd95c7b', 'iron_mace', 'Iron Mace', 'WEAPON', 'mainHand', 'COMMON', 'Heavy and reliable. Crunches bones nicely.', NULL, '{"dmg":8}'::jsonb, 100, 25, 1, 90, 1, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('21e2c848-8a33-4f86-b1a3-384b44b5de23', 'shadow_dagger', 'Shadow Dagger', 'WEAPON', 'offHand', 'UNCOMMON', 'A quick offhand blade that finds gaps in armor.', NULL, '{"dmg":8,"crit":3}'::jsonb, 200, 50, 5, 40, 2, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('fc8633ad-66ab-4578-bf61-d7f8ba121c8c', 'dusty_burial_shroud', 'Dusty Burial Shroud', 'ARMOR', 'body', 'COMMON', 'Offers meager protection. Smells of death.', NULL, '{"hp":20,"def":4}'::jsonb, 60, 15, 1, 80, 1, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('919ebc6d-066a-49bf-9b6f-59e066becdc5', 'ashen_aegis', 'Ashen Aegis', 'ARMOR', 'body', 'UNCOMMON', 'Hardened in volcanic heat.', NULL, '{"hp":40,"def":8}'::jsonb, 300, 75, 5, 50, 2, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('b75ba7dd-e725-4938-b014-f2f12ff36ceb', 'sanctified_bone_plate', 'Sanctified Bone Plate', 'ARMOR', 'body', 'RARE', 'Blessed by a dead god, then cursed by a living one.', NULL, '{"hp":70,"def":14}'::jsonb, 700, 175, 10, 30, 3, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('c115e24c-1ffe-4735-94bc-3b434966687c', 'abyssal_carapace', 'Abyssal Carapace', 'ARMOR', 'body', 'EPIC', 'Grown from the chitin of rift creatures.', NULL, '{"hp":110,"def":22}'::jsonb, 1800, 450, 20, 15, 4, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('a86455ce-bd1d-45eb-ab60-0744afee0bc1', 'crown_eternal_night', 'Crown of Eternal Night', 'ARMOR', 'head', 'LEGENDARY', 'The final crown. It weighs more than kingdoms.', NULL, '{"hp":200,"def":30,"maxMana":50}'::jsonb, 6000, 1500, 35, 5, 5, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('26d1b576-2107-4987-8530-dbbbd9d72047', 'leather_coif', 'Leather Coif', 'ARMOR', 'head', 'COMMON', 'Simple leather head protection.', NULL, '{"hp":10,"def":2}'::jsonb, 40, 10, 1, 85, 1, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('c4ffaabc-e9b9-4175-a33f-274188221149', 'iron_helm', 'Iron Helm', 'ARMOR', 'head', 'UNCOMMON', 'Solid iron. Keeps your brains inside your skull.', NULL, '{"hp":25,"def":6}'::jsonb, 180, 45, 5, 55, 2, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('55ec9200-8b1c-41e4-930b-34f5be719fd4', 'dreadplate_greaves', 'Dreadplate Greaves', 'ARMOR', 'boots', 'RARE', 'Heavy boots that shake the earth with each step.', NULL, '{"hp":35,"def":10}'::jsonb, 500, 125, 10, 35, 3, true, true, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('a110ac72-c987-441a-b574-bad8d78c00ce', 'void_treads', 'Void Treads', 'ARMOR', 'boots', 'EPIC', 'Leave no footprints. Leave no trace.', NULL, '{"hp":50,"def":16,"crit":3}'::jsonb, 1200, 300, 20, 12, 4, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('cd500708-bfa1-41fc-b7d5-aa57c2740aab', 'crimson_mail', 'Crimson Mail', 'ARMOR', 'body', 'RARE', 'Woven from bloodsteel threads. Self-repairing.', NULL, '{"hp":60,"def":12,"lifesteal":2}'::jsonb, 650, 160, 15, 28, 3, true, true, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('66421343-9b20-4789-b21d-5337f80eabb0', 'bone_ring', 'Bone Ring', 'ACCESSORY', 'ring', 'COMMON', 'A crude ring carved from a finger bone.', NULL, '{"hp":5,"crit":1}'::jsonb, 50, 12, 1, 70, 1, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('4dc215a9-f14d-4d7c-9472-4a6c16db38ff', 'ember_band', 'Ember Band', 'ACCESSORY', 'ring', 'UNCOMMON', 'Warm to the touch. Never cools.', NULL, '{"hp":15,"dmg":2,"crit":3}'::jsonb, 200, 50, 5, 40, 2, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('09cf0765-51dd-43f9-a250-fddb43c419e2', 'soul_amulet', 'Soul Amulet', 'ACCESSORY', 'amulet', 'RARE', 'Contains a trapped soul that whispers dark secrets.', NULL, '{"maxMana":30,"magicDmg":8}'::jsonb, 550, 140, 10, 25, 3, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('ef0c26e2-907d-4b40-8255-2b0e02e6c635', 'void_signet', 'Void Signet', 'ACCESSORY', 'ring', 'EPIC', 'Phase through attacks. Sometimes.', NULL, '{"hp":30,"def":5,"crit":6}'::jsonb, 1400, 350, 20, 10, 4, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('44189754-ec53-4168-83c8-7d8e86f10476', 'sovereign_amulet', 'Sovereign''s Pendant', 'ACCESSORY', 'amulet', 'LEGENDARY', 'Grants authority over lesser beings.', NULL, '{"hp":50,"crit":5,"maxMana":60,"magicDmg":15}'::jsonb, 5500, 1375, 35, 3, 5, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('ba045538-59c7-4d43-87ef-7648eac97f01', 'minor_health_flask', 'Minor Health Flask', 'CONSUMABLE', NULL, 'COMMON', 'Restores 50 HP.', NULL, '{"restore_hp":50}'::jsonb, 30, 8, 1, 100, 1, true, true, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('85b79cfb-c34b-47a7-87da-231e02b25909', 'health_flask', 'Health Flask', 'CONSUMABLE', NULL, 'UNCOMMON', 'Restores 120 HP.', NULL, '{"restore_hp":120}'::jsonb, 80, 20, 5, 60, 2, true, true, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('01925424-a158-4339-afc9-7f9f0bb7ad67', 'greater_health_flask', 'Greater Health Flask', 'CONSUMABLE', NULL, 'RARE', 'Restores 250 HP.', NULL, '{"restore_hp":250}'::jsonb, 200, 50, 15, 30, 3, true, true, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('0d5c4ebf-72ad-4ad6-a0be-9fd808ce91a0', 'mana_potion', 'Mana Potion', 'CONSUMABLE', NULL, 'UNCOMMON', 'Restores 40 Mana.', NULL, '{"restore_mana":40}'::jsonb, 60, 15, 5, 50, 2, true, true, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('8731f71d-b319-4856-9f9a-1a5e9dbf57eb', 'essence_vial', 'Essence Vial', 'CONSUMABLE', NULL, 'RARE', 'Restores 25 Blood Essence.', NULL, '{"restore_essence":25}'::jsonb, 150, 38, 10, 25, 3, true, true, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('04085759-5532-4aee-bd41-86cb53d1d019', 'elixir_of_fury', 'Elixir of Fury', 'CONSUMABLE', NULL, 'EPIC', 'Increases damage by 20% for 5 combats.', NULL, '{"buff_dmg_pct":20,"buff_duration":5}'::jsonb, 500, 125, 15, 12, 3, true, true, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('926ffd5f-cb1a-42f9-ac1a-3c9b8b77119e', 'rusty_scrap', 'Rusty Scrap', 'MATERIAL', NULL, 'COMMON', 'Might be useful for crafting.', NULL, '{}'::jsonb, 5, 2, 1, 100, 1, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('26a9ea3d-03f4-4c47-8cee-4aad2cc92fe9', 'charred_bone', 'Charred Bone', 'MATERIAL', NULL, 'COMMON', 'A remnant of a lost soul.', NULL, '{}'::jsonb, 8, 3, 1, 90, 1, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('e4981210-29ad-40f6-a941-1e393c7930e6', 'demon_fang', 'Demon Fang', 'MATERIAL', NULL, 'UNCOMMON', 'Sharp and corrupted.', NULL, '{}'::jsonb, 25, 8, 5, 50, 2, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('2db6f9e3-a54b-4932-bbfc-1b05136aec04', 'grave_silk', 'Grave Silk', 'MATERIAL', NULL, 'UNCOMMON', 'Woven with dark intent.', NULL, '{}'::jsonb, 30, 10, 5, 45, 2, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('b477222d-cfa5-4c2d-b6bd-0395e33e5724', 'ancient_core', 'Ancient Core', 'MATERIAL', NULL, 'RARE', 'Power source from an old age.', NULL, '{}'::jsonb, 100, 30, 10, 20, 3, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('eddd93a1-384e-4b13-9f65-d2a37529ad76', 'vampiric_bloodlet', 'Vampiric Bloodlet', 'MATERIAL', NULL, 'RARE', 'Pulsing with dark energy.', NULL, '{}'::jsonb, 120, 35, 10, 15, 3, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('e7081512-ac47-4379-9670-44a691f57e6c', 'pure_void_essence', 'Pure Void Essence', 'MATERIAL', NULL, 'EPIC', 'Raw creation material.', NULL, '{}'::jsonb, 500, 150, 20, 5, 4, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('5134eb73-0c26-415a-9955-5922c9e238d4', 'iron_ore', 'Iron Ore', 'MATERIAL', NULL, 'COMMON', 'Rough iron ore. Can be smelted.', NULL, '{}'::jsonb, 10, 3, 1, 100, 1, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('d7f5722c-005a-44c8-b371-1e84fd5c2382', 'blood_crystal', 'Blood Crystal', 'MATERIAL', NULL, 'RARE', 'Crystallized blood with magical properties.', NULL, '{}'::jsonb, 80, 25, 10, 18, 3, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('62401542-be7e-46f0-aca3-2606465481b7', 'void_fragment', 'Void Fragment', 'MATERIAL', NULL, 'EPIC', 'A shard of collapsed reality.', NULL, '{}'::jsonb, 400, 120, 25, 6, 4, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('3b57f115-3a70-4336-83e6-4e52141a5e3b', 'celestial_dust', 'Celestial Dust', 'MATERIAL', NULL, 'LEGENDARY', 'Stardust from the before-times.', NULL, '{}'::jsonb, 1500, 450, 35, 2, 5, true, false, true, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('298bdb24-2571-4476-b93f-7cb71a949eae', 'tome_inferno', 'Tome of Inferno', 'TOME', NULL, 'LEGENDARY', 'Unlocks Inferno Strike: Deal 2x damage, costs 30 Mana.', NULL, '{"ability":"inferno_strike","mana_cost":30,"damage_multi":2}'::jsonb, NULL, 2000, 20, 2, 4, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('9ecbccc1-17f7-4697-898b-8828e3ae7d39', 'tome_resurrection', 'Tome of Resurrection', 'TOME', NULL, 'LEGENDARY', 'On death, revive once with 50% HP.', NULL, '{"ability":"resurrection","passive":true,"revive_hp_pct":50}'::jsonb, NULL, 3000, 25, 1, 5, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('d48701c2-1212-4323-8fa8-e1482225c645', 'tome_void_walk', 'Tome of Void Walk', 'TOME', NULL, 'MYTHIC', 'Unlocks Void Walk: Skip enemy turn, costs 50 Mana.', NULL, '{"ability":"void_walk","mana_cost":50,"skip_turn":true}'::jsonb, NULL, 5000, 30, 1, 5, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('e672acb1-7945-4ff2-b4ab-2a5630c08ee2', 'tome_blood_pact', 'Tome of the Blood Pact', 'TOME', NULL, 'EPIC', '+5 permanent Base Damage.', NULL, '{"passive":true,"flat_dmg":5}'::jsonb, NULL, 1000, 15, 5, 3, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('84b2f685-cb18-4426-973f-0f5a805475c3', 'tome_iron_will', 'Tome of Iron Will', 'TOME', NULL, 'EPIC', '+30 permanent Max HP.', NULL, '{"flat_hp":30,"passive":true}'::jsonb, NULL, 1000, 15, 4, 3, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('84d52d3a-1dfc-4d9f-9a9b-a4132474ed2a', 'tome_essence_mastery', 'Tome of Essence Mastery', 'TOME', NULL, 'RARE', '+20 Max Blood Essence permanently.', NULL, '{"passive":true,"flat_essence":20}'::jsonb, NULL, 600, 10, 8, 3, true, false, false, 99, '"2026-04-21T03:41:15.028Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('fa20586e-7ba1-4f8b-be47-4b6be74ffcd4', 'splintered_buckler', 'Splintered Buckler', 'ARMOR', 'offHand', 'COMMON', 'A cracked shield scavenged from the crypts.', NULL, '{"hp":10,"def":2}'::jsonb, 45, 11, 1, 75, 1, true, false, false, 99, '"2026-04-23T06:59:18.851Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('df9344b4-82b3-4cf3-84fa-43ec6822241c', 'gravewrapped_boots', 'Gravewrapped Boots', 'ARMOR', 'boots', 'COMMON', 'Bandaged feet, wrapped in graveyard linen.', NULL, '{"hp":8,"def":2}'::jsonb, 55, 14, 1, 80, 1, true, false, false, 99, '"2026-04-23T06:59:18.851Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('1bd17162-c9d1-4298-822f-e9207535857c', 'cracked_bone_pendant', 'Cracked Bone Pendant', 'ACCESSORY', 'amulet', 'COMMON', 'A fractured talisman that hums with fading power.', NULL, '{"maxMana":10,"magicDmg":1}'::jsonb, 60, 15, 1, 70, 1, true, false, false, 99, '"2026-04-23T06:59:18.851Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('a9e96db5-00b4-4d45-90ff-2f15f22eabc6', 'ember_ward', 'Ember Ward', 'ARMOR', 'offHand', 'UNCOMMON', 'A branding iron reshaped into a shield. Still warm.', NULL, '{"hp":20,"def":5,"dmg":2}'::jsonb, 220, 55, 5, 45, 2, true, false, false, 99, '"2026-04-23T06:59:18.851Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('58c09de9-bffe-4848-8d3e-5b421f32a194', 'bloodstone_signet', 'Bloodstone Signet', 'ACCESSORY', 'ring', 'RARE', 'Cut from crystallized blood of the Crimson Depths.', NULL, '{"hp":20,"def":3,"crit":4}'::jsonb, 480, 120, 10, 22, 3, true, false, false, 99, '"2026-04-23T06:59:18.851Z"'::jsonb);
INSERT INTO items (id, key, name, type, slot, tier, description, icon, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_tradeable, is_craftable, is_stackable, max_stack, created_at) VALUES ('6455f9ae-3239-4a7f-98df-d9f9e55b8b94', 'abyssal_crown', 'Abyssal Crown', 'ARMOR', 'head', 'EPIC', 'A crown forged from rift shards. Whispers constantly.', NULL, '{"hp":60,"def":15,"maxMana":20}'::jsonb, 1600, 400, 20, 12, 4, true, false, false, 99, '"2026-04-23T06:59:18.851Z"'::jsonb);

INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('d1145755-9821-41ea-8123-2e15cd45d9db', 'healer_mara', 'Sister Mara', 'healer', NULL, 'A blind seer who mends flesh with whispered prayers.', '✚', '{"heal":"The blood obeys. You are whole again.","full_hp":"You carry no wounds. Go make some.","greeting":"Your wounds cry out. Let me silence them."}'::jsonb, '{}'::jsonb, true);
INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('bff4f701-887e-4d45-bd0a-85f80e2a5a4d', 'smith_vorn', 'Vorn the Shattered', 'blacksmith', NULL, 'A demon-scarred smith. His hammer rings with old fury.', '⚒', '{"greeting":"Steel speaks louder than gods. What needs breaking?","enhance_fail":"Even good steel can shatter.","enhance_success":"The metal remembers its purpose."}'::jsonb, '{}'::jsonb, true);
INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('b31d1c8c-c5e6-4168-9531-3798bffca378', 'banker_nyx', 'Nyx, the Pale Clerk', 'banker', NULL, 'Counts coins in a vault built from bones.', '⚖', '{"deposit":"Stored. The vault remembers.","greeting":"Your gold is safe with the dead. How much do you trust us?","withdraw":"Returned. Spend it before it spends you."}'::jsonb, '{}'::jsonb, true);
INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'merchant_kael', 'Kael Duskmantle', 'merchant', NULL, 'Trades in artifacts dragged from the abyss.', '⚗', '{"buy":"A fine choice. May it serve you better than its last owner.","greeting":"I sell what the dead no longer need. Browse carefully.","insufficient":"Come back when your pockets are heavier."}'::jsonb, '{}'::jsonb, true);
INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('b0b4e053-3d1b-4b5d-8829-47d8c34cef6c', 'gambler_raze', 'Raze the Lucky', 'gambler', NULL, 'Grins too wide. Wins too often. Never loses his own coin.', '⚄', '{"win":"Ha! Fortune favors the bold!","lose":"The bones take what the bones want.","greeting":"Feeling lucky? The bones never lie... much."}'::jsonb, '{}'::jsonb, true);
INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('bb042a6e-22ab-4a7b-a7f4-bedc532ba3cf', 'arena_thane', 'Thane Bloodborn', 'arena_master', NULL, 'Rules the arena. His word is law, his fist is justice.', '⚔', '{"defeat":"Get up. Death is too easy.","victory":"Another skull for the throne.","greeting":"The arena hungers. Will you feed it?"}'::jsonb, '{}'::jsonb, true);
INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('e30aece0-d747-4b47-ab6b-4cf965ab41ba', 'quest_elder', 'Elder Wraithcall', 'quest_giver', NULL, 'Speaks to the dead and gives their final wishes to the living.', '⚛', '{"greeting":"The dead have requests. Will you listen?","quest_accepted":"The spirits mark you. Do not fail them."}'::jsonb, '{}'::jsonb, true);
INSERT INTO npcs (id, key, name, role, zone_id, description, icon, dialogue, inventory_config, is_active) VALUES ('3df33745-0eb4-4b0e-a8dd-c709c14ef10c', 'trainer_ash', 'Ashira the Forsworn', 'trainer', NULL, 'Once a paladin. Now teaches dark arts to those brave enough to learn.', '⚝', '{"greeting":"Knowledge is pain. Are you ready to learn?","skill_up":"Your power grows. Use it wisely."}'::jsonb, '{}'::jsonb, true);

INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('76d7b8f0-36e0-4260-baa6-2303f0e3643c', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '26d1b576-2107-4987-8530-dbbbd9d72047', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 1);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('5d4d35da-48b0-4862-928b-21ff50e4b1f8', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '66421343-9b20-4789-b21d-5337f80eabb0', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 2);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('10da1547-3b7d-4367-985e-b85b27fefddf', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'fc8633ad-66ab-4578-bf61-d7f8ba121c8c', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 3);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('e234c4f9-f93f-4474-8b15-ec451cec9bfa', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'f3d343a7-0631-4d32-99d2-2e0c2c36d504', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 4);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('a834d089-a12f-493a-93d2-148c87b42f7f', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '389ef75e-615d-4b9d-a60a-99bb7bd95c7b', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 5);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('e2f9bf16-bff9-4b8c-ba24-b9a1cad9f5ad', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'c4ffaabc-e9b9-4175-a33f-274188221149', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 6);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('f57eb99b-175c-411e-a3da-6b22165868e0', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '4dc215a9-f14d-4d7c-9472-4a6c16db38ff', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 7);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('05302ada-0a11-4a59-b7be-e916493bba4f', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '21e2c848-8a33-4f86-b1a3-384b44b5de23', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 8);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('011daa66-6fbe-4d36-9e2f-4d93665e5583', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '88739d03-97e9-4531-a9d7-46dbb1203e82', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 9);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('01f50e59-5fa7-4d48-90fa-c15d695f8e76', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '919ebc6d-066a-49bf-9b6f-59e066becdc5', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 10);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('dfdb6be3-b22b-4f21-8761-96e743b19513', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '55ec9200-8b1c-41e4-930b-34f5be719fd4', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 11);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('f0571e77-9bb8-45b2-a8c1-daa816ccd861', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '09cf0765-51dd-43f9-a250-fddb43c419e2', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 12);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('56dda355-8c2a-4a07-9b47-13cdeaa8112a', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '771c2706-9b3f-41c8-b0af-f10aa58fbff3', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 13);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('fdf16ba2-3905-4e08-86d0-814c793d267e', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'b75ba7dd-e725-4938-b014-f2f12ff36ceb', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 14);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('eab03663-2494-4cb2-8d06-4a71ca98e508', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'f310769d-62a9-4dd5-a5f2-ac5f4bc4fbb5', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 15);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('4fc459bd-62fa-4634-aecc-a3dc432e3583', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'cd500708-bfa1-41fc-b7d5-aa57c2740aab', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 16);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('c19d95c2-3cd8-42c9-a248-364f11972711', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'a110ac72-c987-441a-b574-bad8d78c00ce', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 17);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('67ee802d-3bd4-403e-ac22-6355afa3a73b', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'ef0c26e2-907d-4b40-8255-2b0e02e6c635', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 18);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('242705d9-c8d1-4130-8031-9eb3ee37046e', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '374fcb3e-c3dc-4e0a-ae69-e18c1aa37ccc', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 19);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('3413009f-ecac-46f5-9984-f4fbef919475', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'c115e24c-1ffe-4735-94bc-3b434966687c', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 20);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('b210dc03-f521-4856-82dc-71ed4b6121d4', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '28878101-6020-4d1e-abde-6593889795a5', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 21);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('eb896892-6c0e-4163-a128-7013e7468666', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'f2161b22-f963-4a32-8955-19a653694589', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 22);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('af8a2fdc-db5e-4930-bc4b-219c920535a2', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '44189754-ec53-4168-83c8-7d8e86f10476', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 23);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('cfda9845-6df4-42d7-8fce-c09b6774ce6c', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'a86455ce-bd1d-45eb-ab60-0744afee0bc1', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 24);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('f32e6c3a-a5d5-4e8e-836c-c4de6f06a9ca', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '8619c722-8705-4ce0-9258-e7be52924a75', NULL, NULL, '"2026-04-21T03:41:15.038Z"'::jsonb, NULL, 25);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('b5430b3f-d15b-4a4f-94a1-8a7fad0a2383', 'd1145755-9821-41ea-8123-2e15cd45d9db', 'ba045538-59c7-4d43-87ef-7648eac97f01', NULL, NULL, '"2026-04-21T03:41:15.044Z"'::jsonb, NULL, 1);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('0f16263e-5592-4845-a480-b24388c9bbdf', 'd1145755-9821-41ea-8123-2e15cd45d9db', '0d5c4ebf-72ad-4ad6-a0be-9fd808ce91a0', NULL, NULL, '"2026-04-21T03:41:15.044Z"'::jsonb, NULL, 2);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('6a9df4b4-d33d-4ded-bce9-828ddb51e0a0', 'd1145755-9821-41ea-8123-2e15cd45d9db', '85b79cfb-c34b-47a7-87da-231e02b25909', NULL, NULL, '"2026-04-21T03:41:15.044Z"'::jsonb, NULL, 3);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('2eddc470-d454-48f2-8300-0f5069fc9dd4', 'd1145755-9821-41ea-8123-2e15cd45d9db', '8731f71d-b319-4856-9f9a-1a5e9dbf57eb', NULL, NULL, '"2026-04-21T03:41:15.044Z"'::jsonb, NULL, 4);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('8889d218-924d-4ff7-9c6d-6bec8fc90971', 'd1145755-9821-41ea-8123-2e15cd45d9db', '01925424-a158-4339-afc9-7f9f0bb7ad67', NULL, NULL, '"2026-04-21T03:41:15.044Z"'::jsonb, NULL, 5);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('9d8c0ef1-2eed-49dc-bd7b-4c68169430e1', 'd1145755-9821-41ea-8123-2e15cd45d9db', '04085759-5532-4aee-bd41-86cb53d1d019', NULL, NULL, '"2026-04-21T03:41:15.044Z"'::jsonb, NULL, 6);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('cb329758-925c-4192-83a2-504f3843c4f3', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'fa20586e-7ba1-4f8b-be47-4b6be74ffcd4', NULL, NULL, '"2026-04-23T06:59:18.863Z"'::jsonb, NULL, 101);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('2a806020-73a7-45f4-9006-beb2fc7cfd7c', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'df9344b4-82b3-4cf3-84fa-43ec6822241c', NULL, NULL, '"2026-04-23T06:59:18.863Z"'::jsonb, NULL, 102);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('af575075-688d-4ff1-85fb-2db429cdbd4d', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '1bd17162-c9d1-4298-822f-e9207535857c', NULL, NULL, '"2026-04-23T06:59:18.863Z"'::jsonb, NULL, 103);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('33a7d4c2-fd9e-40c7-94cb-f51bfce3b022', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', 'a9e96db5-00b4-4d45-90ff-2f15f22eabc6', NULL, NULL, '"2026-04-23T06:59:18.863Z"'::jsonb, NULL, 104);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('f4d7d3e8-bd0f-4056-8245-cf37a9bca41d', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '58c09de9-bffe-4848-8d3e-5b421f32a194', NULL, NULL, '"2026-04-23T06:59:18.863Z"'::jsonb, NULL, 105);
INSERT INTO npc_shop_inventory (id, npc_id, item_id, stock, restock_interval, last_restock, price_override, sort_order) VALUES ('5b627438-1c7d-47b6-a8b3-5a85169274b6', '7cd4b4e2-f795-457b-bbc0-e57476ef193b', '6455f9ae-3239-4a7f-98df-d9f9e55b8b94', NULL, NULL, '"2026-04-23T06:59:18.863Z"'::jsonb, NULL, 106);

INSERT INTO pvp_seasons (id, season_number, name, starts_at, ends_at, rewards, is_active) VALUES ('bff8edeb-ebd3-4a00-aee5-334b41cbf817', 1, 'Season of Blood', '"2026-04-23T06:59:18.875Z"'::jsonb, '"2026-07-22T06:59:18.875Z"'::jsonb, '{"gold":{"gold":2500},"bronze":{"gold":500},"silver":{"gold":1000},"diamond":{"gold":10000},"champion":{"gold":25000},"platinum":{"gold":5000},"sovereign":{"gold":50000,"title":"Blood Sovereign"}}'::jsonb, true);


    INSERT INTO global_chat (player_id, username, message, channel) VALUES 
    ('system', 'System', 'Welcome to BlackWorld Production!', 'global')
    ON CONFLICT DO NOTHING;
  