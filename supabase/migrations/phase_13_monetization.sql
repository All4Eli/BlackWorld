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
