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





      INSERT INTO zones (id, name, description, icon, level_required) 
      VALUES ('the_shallows', 'The Shallows', 'A relatively safe training ground near the capital.', '🏕', 1)
      ON CONFLICT (id) DO NOTHING;
    ;


      INSERT INTO dungeons (id, name, description, zone_id, icon, min_level, floor_count, rewards, cooldown_hours, difficulty) 
      VALUES ('rats_nest', 'The Rats Nest', 'A festering den of vermin beneath the Shallows. Perfect for fledglings.', 'the_shallows', '🐀', 1, 3, '{"gold": 50, "xp": 100}', 1, 'normal')
      ON CONFLICT (id) DO NOTHING;
    ;


      INSERT INTO monsters (name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier) 
      VALUES ('Dire Rat', 'the_shallows', 30, 4, 1, 0.05, 'COMMON'),('Slime', 'the_shallows', 45, 6, 2, 0.0, 'UNCOMMON'),('Rat King', 'the_shallows', 80, 12, 4, 0.05, 'BOSS')
      ON CONFLICT DO NOTHING;
    ;

