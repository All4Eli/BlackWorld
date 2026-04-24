const { Client } = require('pg');

// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — SCALING MIGRATION
// ═══════════════════════════════════════════════════════════════════
// Adds: Partitioning, materialized views, auto-update triggers,
//       rate limiting, idempotency keys, soft deletes
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const client = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'E87319ee',
    database: 'blackworld'
  });
  await client.connect();
  console.log('[CONNECTED] blackworld\n');


  // ══════════════════════════════════════════════════════════════════
  //  1. AUTO-UPDATE TRIGGERS — updated_at auto-refreshes on writes
  // ══════════════════════════════════════════════════════════════════
  console.log('═══ 1. AUTO-UPDATE TRIGGERS ═══');

  // Create the trigger function once
  await client.query(`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('[OK] trigger_set_updated_at() function');

  // Apply to all tables with updated_at columns
  const tablesWithUpdatedAt = ['players', 'hero_stats'];
  for (const table of tablesWithUpdatedAt) {
    await client.query(`
      DROP TRIGGER IF EXISTS set_updated_at ON ${table};
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_updated_at();
    `);
    console.log(`[OK] trigger on ${table}`);
  }


  // ══════════════════════════════════════════════════════════════════
  //  2. SOFT DELETES — add deleted_at to critical tables
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 2. SOFT DELETES ═══');

  const softDeleteTables = [
    'players',
    'inventory',
    'auction_listings',
    'covens'
  ];

  for (const table of softDeleteTables) {
    await client.query(`
      ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    `);
    // Partial index: only query non-deleted rows
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${table}_not_deleted 
      ON ${table}(id) WHERE deleted_at IS NULL;
    `);
    console.log(`[OK] soft delete on ${table}`);
  }


  // ══════════════════════════════════════════════════════════════════
  //  3. RATE LIMITING — sliding window API abuse prevention
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 3. RATE LIMITING ═══');

  await client.query(`
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
  `);
  console.log('[OK] rate_limits table');

  // Rate limit config — defines max requests per window
  await client.query(`
    CREATE TABLE IF NOT EXISTS rate_limit_config (
      action          text PRIMARY KEY,
      max_requests    integer NOT NULL DEFAULT 60,
      window_seconds  integer NOT NULL DEFAULT 60,
      penalty_seconds integer DEFAULT 0,
      description     text
    );
  `);
  console.log('[OK] rate_limit_config table');


  // ══════════════════════════════════════════════════════════════════
  //  4. IDEMPOTENCY KEYS — prevent double-fire on economic actions
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 4. IDEMPOTENCY KEYS ═══');

  await client.query(`
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
  `);
  console.log('[OK] idempotency_keys table');


  // ══════════════════════════════════════════════════════════════════
  //  5. MATERIALIZED VIEWS — pre-computed leaderboards
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 5. MATERIALIZED VIEWS ═══');

  // Level leaderboard
  await client.query(`
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
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_level_rank 
    ON mv_leaderboard_level(clerk_user_id);
  `);
  console.log('[OK] mv_leaderboard_level');

  // PvP leaderboard
  await client.query(`
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
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pvp_rank 
    ON mv_leaderboard_pvp(clerk_user_id);
  `);
  console.log('[OK] mv_leaderboard_pvp');

  // Wealth leaderboard
  await client.query(`
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
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_wealth_rank 
    ON mv_leaderboard_wealth(clerk_user_id);
  `);
  console.log('[OK] mv_leaderboard_wealth');


  // ══════════════════════════════════════════════════════════════════
  //  6. TABLE PARTITIONING — time-series tables by month
  //     PostgreSQL 18 native declarative partitioning
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 6. TABLE PARTITIONING ═══');

  // We need to recreate the high-volume tables as partitioned.
  // Drop and recreate combat_log, trade_log, global_chat, login_history, casino_history, enhancement_log

  const partitionedTables = [
    {
      name: 'combat_log',
      timeCol: 'fought_at',
      definition: `
        id              uuid NOT NULL DEFAULT gen_random_uuid(),
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
      `,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_combat_log_p_player ON combat_log(player_id, fought_at DESC)',
      ]
    },
    {
      name: 'trade_log',
      timeCol: 'created_at',
      definition: `
        id              uuid NOT NULL DEFAULT gen_random_uuid(),
        player_id       text NOT NULL,
        action          text NOT NULL CHECK (action IN ('buy','sell','auction_buy','auction_sell','craft','enhance','deposit','withdraw','gamble','quest_reward','loot','daily_login','pvp_reward')),
        item_name       text,
        gold_amount     integer NOT NULL DEFAULT 0,
        metadata        jsonb DEFAULT '{}'::jsonb,
        created_at      timestamptz NOT NULL DEFAULT now()
      `,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_trade_log_p_player ON trade_log(player_id, created_at DESC)',
      ]
    },
    {
      name: 'global_chat',
      timeCol: 'created_at',
      definition: `
        id              uuid NOT NULL DEFAULT gen_random_uuid(),
        player_id       text NOT NULL,
        username        text NOT NULL,
        message         text NOT NULL CHECK (char_length(message) <= 500),
        channel         text NOT NULL DEFAULT 'global',
        created_at      timestamptz NOT NULL DEFAULT now()
      `,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_chat_p_channel ON global_chat(channel, created_at DESC)',
      ]
    },
    {
      name: 'login_history',
      timeCol: 'created_at',
      definition: `
        id              uuid NOT NULL DEFAULT gen_random_uuid(),
        player_id       text NOT NULL,
        ip_address      inet,
        user_agent      text,
        success         boolean NOT NULL,
        failure_reason  text,
        created_at      timestamptz NOT NULL DEFAULT now()
      `,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_login_hist_p_player ON login_history(player_id, created_at DESC)',
      ]
    },
    {
      name: 'casino_history',
      timeCol: 'played_at',
      definition: `
        id              uuid NOT NULL DEFAULT gen_random_uuid(),
        player_id       text NOT NULL,
        game_type       text NOT NULL CHECK (game_type IN ('coin_flip','high_low','slots','dice','blackjack')),
        wager           integer NOT NULL CHECK (wager > 0),
        payout          integer NOT NULL DEFAULT 0 CHECK (payout >= 0),
        result          text NOT NULL CHECK (result IN ('win','loss','jackpot','push')),
        roll_data       jsonb DEFAULT '{}'::jsonb,
        played_at       timestamptz NOT NULL DEFAULT now()
      `,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_casino_p_player ON casino_history(player_id, played_at DESC)',
      ]
    },
    {
      name: 'enhancement_log',
      timeCol: 'created_at',
      definition: `
        id              uuid NOT NULL DEFAULT gen_random_uuid(),
        player_id       text NOT NULL,
        inventory_id    uuid NOT NULL,
        from_level      integer NOT NULL,
        to_level        integer NOT NULL,
        success         boolean NOT NULL,
        broke           boolean NOT NULL DEFAULT false,
        gold_spent      integer NOT NULL DEFAULT 0,
        materials_used  jsonb DEFAULT '{}'::jsonb,
        created_at      timestamptz NOT NULL DEFAULT now()
      `,
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
      suffix: `y${year}m${month}`,
      from: `${year}-${month}-01`,
      to: `${nextYear}-${nextMonth}-01`
    });
  }

  for (const table of partitionedTables) {
    // Drop existing non-partitioned table
    await client.query(`DROP TABLE IF EXISTS ${table.name} CASCADE`);

    // Create partitioned parent
    await client.query(`
      CREATE TABLE ${table.name} (
        ${table.definition}
      ) PARTITION BY RANGE (${table.timeCol});
    `);

    // Create monthly partitions
    for (const m of partitionMonths) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table.name}_${m.suffix}
        PARTITION OF ${table.name}
        FOR VALUES FROM ('${m.from}') TO ('${m.to}');
      `);
    }

    // Create a default partition for anything outside the range
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table.name}_default
      PARTITION OF ${table.name} DEFAULT;
    `);

    // Create indexes on parent (propagates to partitions)
    for (const idx of table.indexes) {
      await client.query(idx);
    }

    console.log(`[OK] ${table.name} — partitioned (${partitionMonths.length} monthly + default)`);
  }


  // ══════════════════════════════════════════════════════════════════
  //  7. CLEANUP FUNCTIONS — automated maintenance
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 7. MAINTENANCE FUNCTIONS ═══');

  // Function to refresh all materialized views (call via cron or API)
  await client.query(`
    CREATE OR REPLACE FUNCTION refresh_leaderboards()
    RETURNS void AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard_level;
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard_pvp;
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard_wealth;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('[OK] refresh_leaderboards() function');

  // Function to clean expired idempotency keys
  await client.query(`
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
  `);
  console.log('[OK] cleanup_idempotency_keys() function');

  // Function to clean old rate limit entries
  await client.query(`
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
  `);
  console.log('[OK] cleanup_rate_limits() function');

  // Function to expire old auction listings
  await client.query(`
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
  `);
  console.log('[OK] expire_old_auctions() function');

  // Function to clear expired buffs
  await client.query(`
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
  `);
  console.log('[OK] cleanup_expired_buffs() function');


  // ══════════════════════════════════════════════════════════════════
  //  FINAL REPORT
  // ══════════════════════════════════════════════════════════════════
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const partitions = await client.query(`
    SELECT COUNT(*) FROM pg_inherits
  `);
  const views = await client.query(`
    SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
  `);
  const funcs = await client.query(`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
  `);
  const triggers = await client.query(`
    SELECT trigger_name, event_object_table FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  `);
  const indexCount = await client.query(`
    SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
  `);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  BLACKWORLD — SCALING MIGRATION COMPLETE             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Base Tables:       ${String(tables.rows.length).padEnd(33)}║`);
  console.log(`║  Partitions:        ${String(partitions.rows[0].count).padEnd(33)}║`);
  console.log(`║  Materialized Views: ${String(views.rows.length).padEnd(32)}║`);
  console.log(`║  Functions:         ${String(funcs.rows.length).padEnd(33)}║`);
  console.log(`║  Triggers:          ${String(triggers.rows.length).padEnd(33)}║`);
  console.log(`║  Total Indexes:     ${String(indexCount.rows[0].count).padEnd(33)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Materialized Views:                                 ║');
  views.rows.forEach(v => {
    console.log(`║    • ${v.matviewname.padEnd(47)}║`);
  });
  console.log('║  Functions:                                          ║');
  funcs.rows.forEach(f => {
    console.log(`║    • ${f.routine_name.padEnd(47)}║`);
  });
  console.log('║  Triggers:                                           ║');
  triggers.rows.forEach(t => {
    console.log(`║    • ${t.trigger_name} → ${t.event_object_table}`.padEnd(55) + '║');
  });
  console.log('╚══════════════════════════════════════════════════════╝');

  await client.end();
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
