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
