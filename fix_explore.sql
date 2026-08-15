ALTER TABLE hero_stats ADD COLUMN IF NOT EXISTS visited_zones JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS combat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
    monster_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    player_hp INT NOT NULL,
    monster_hp INT NOT NULL,
    turn_count INT NOT NULL DEFAULT 0,
    player_statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
    monster_statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drop dependent constraints
ALTER TABLE dungeons DROP CONSTRAINT IF EXISTS dungeons_boss_id_fkey;

-- Change monsters.id to TEXT
ALTER TABLE monsters ALTER COLUMN id TYPE TEXT USING id::text;

-- Recreate constraint with TEXT type
ALTER TABLE dungeons ALTER COLUMN boss_id TYPE TEXT USING boss_id::text;
ALTER TABLE dungeons ADD CONSTRAINT dungeons_boss_id_fkey FOREIGN KEY (boss_id) REFERENCES monsters(id);


-- The lair tables were missing too
CREATE TABLE IF NOT EXISTS lair_types (
    type TEXT PRIMARY KEY,
    base_cost INT NOT NULL,
    essence_bonus INT NOT NULL,
    bank_bonus INT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_lairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
    lair_type TEXT NOT NULL REFERENCES lair_types(type),
    tier INT NOT NULL DEFAULT 1,
    custom_name TEXT
);

-- The rate_limit_config table was missing too
CREATE TABLE IF NOT EXISTS rate_limit_config (
    action TEXT PRIMARY KEY,
    max_requests INT NOT NULL,
    window_seconds INT NOT NULL,
    penalty_seconds INT NOT NULL
);
