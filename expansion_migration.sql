-- ═══════════════════════════════════════════════════════════════════
-- BlackWorld Expansion Project (Torn City Feature Parity Migration)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Alter hero_stats table
ALTER TABLE hero_stats 
  ADD COLUMN IF NOT EXISTS nerve INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_nerve INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS last_nerve_tick TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS energy INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_energy INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS last_energy_tick TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS spd INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS dex INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS jail_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS jail_reason TEXT DEFAULT NULL;

-- 2. Create table crimes
CREATE TABLE IF NOT EXISTS crimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  nerve_cost INT NOT NULL DEFAULT 2,
  min_level INT NOT NULL DEFAULT 1,
  success_rate NUMERIC(4,2) NOT NULL DEFAULT 0.75,
  xp_reward INT NOT NULL DEFAULT 15,
  gold_reward_min INT NOT NULL DEFAULT 20,
  gold_reward_max INT NOT NULL DEFAULT 50,
  jail_time_seconds INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create table crime_logs
CREATE TABLE IF NOT EXISTS crime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  crime_id UUID NOT NULL REFERENCES crimes(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  xp_gained INT DEFAULT 0,
  gold_gained INT DEFAULT 0,
  jail_seconds INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create table gym_trainings
CREATE TABLE IF NOT EXISTS gym_trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  stat_type VARCHAR(20) NOT NULL CHECK (stat_type IN ('str', 'def', 'spd', 'dex')),
  energy_cost INT NOT NULL DEFAULT 10,
  stat_gain INT NOT NULL DEFAULT 1,
  description TEXT
);

-- 5. Create table education_courses
CREATE TABLE IF NOT EXISTS education_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  duration_seconds INT NOT NULL DEFAULT 60,
  cost_gold INT NOT NULL DEFAULT 100,
  stat_boost_type VARCHAR(20) CHECK (stat_boost_type IN ('str', 'def', 'spd', 'dex', 'max_energy', 'max_nerve', 'passive_income')),
  stat_boost_val INT NOT NULL DEFAULT 5,
  perk_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create table player_education
CREATE TABLE IF NOT EXISTS player_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES education_courses(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completes_at TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMPTZ DEFAULT NULL
);

-- 7. Create table player_bazaar
CREATE TABLE IF NOT EXISTS player_bazaar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price INT NOT NULL CHECK (price >= 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Create table stocks
CREATE TABLE IF NOT EXISTS stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  share_price INT NOT NULL CHECK (share_price > 0),
  dividend_rate_per_hour INT NOT NULL DEFAULT 10,
  description TEXT
);

-- 9. Create table player_investments
CREATE TABLE IF NOT EXISTS player_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  shares_owned INT NOT NULL DEFAULT 0 CHECK (shares_owned >= 0),
  last_dividend_claim TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Seed Data

-- Crimes Seed (at least 5 crimes)
INSERT INTO crimes (name, description, nerve_cost, min_level, success_rate, xp_reward, gold_reward_min, gold_reward_max, jail_time_seconds)
SELECT 'Shoplifting', 'Steal basic goods from convenience stores.', 2, 1, 0.85, 15, 20, 50, 60
WHERE NOT EXISTS (SELECT 1 FROM crimes WHERE name = 'Shoplifting');

INSERT INTO crimes (name, description, nerve_cost, min_level, success_rate, xp_reward, gold_reward_min, gold_reward_max, jail_time_seconds)
SELECT 'Pickpocketing', 'Lift wallets and watches from crowded street corners.', 3, 2, 0.75, 25, 40, 100, 120
WHERE NOT EXISTS (SELECT 1 FROM crimes WHERE name = 'Pickpocketing');

INSERT INTO crimes (name, description, nerve_cost, min_level, success_rate, xp_reward, gold_reward_min, gold_reward_max, jail_time_seconds)
SELECT 'Armed Robbery', 'Hold up local businesses or armored transports at gunpoint.', 6, 5, 0.60, 60, 150, 400, 300
WHERE NOT EXISTS (SELECT 1 FROM crimes WHERE name = 'Armed Robbery');

INSERT INTO crimes (name, description, nerve_cost, min_level, success_rate, xp_reward, gold_reward_min, gold_reward_max, jail_time_seconds)
SELECT 'Heist', 'Organize and execute a complex bank vault breach.', 10, 10, 0.45, 150, 500, 1500, 600
WHERE NOT EXISTS (SELECT 1 FROM crimes WHERE name = 'Heist');

INSERT INTO crimes (name, description, nerve_cost, min_level, success_rate, xp_reward, gold_reward_min, gold_reward_max, jail_time_seconds)
SELECT 'Cyber Warfare', 'Infiltrate corporate networks to extract crypto reserves.', 15, 15, 0.35, 300, 1200, 4000, 1200
WHERE NOT EXISTS (SELECT 1 FROM crimes WHERE name = 'Cyber Warfare');

-- Gym Trainings Seed (Strength, Defense, Speed, Dexterity)
INSERT INTO gym_trainings (name, stat_type, energy_cost, stat_gain, description)
SELECT 'Strength Training', 'str', 10, 1, 'Heavy lifting to build muscle power and physical attack.'
WHERE NOT EXISTS (SELECT 1 FROM gym_trainings WHERE name = 'Strength Training');

INSERT INTO gym_trainings (name, stat_type, energy_cost, stat_gain, description)
SELECT 'Defense Training', 'def', 10, 1, 'Endurance conditioning to absorb incoming damage.'
WHERE NOT EXISTS (SELECT 1 FROM gym_trainings WHERE name = 'Defense Training');

INSERT INTO gym_trainings (name, stat_type, energy_cost, stat_gain, description)
SELECT 'Speed Training', 'spd', 10, 1, 'Agility and sprint drills to outpace opponents in battle.'
WHERE NOT EXISTS (SELECT 1 FROM gym_trainings WHERE name = 'Speed Training');

INSERT INTO gym_trainings (name, stat_type, energy_cost, stat_gain, description)
SELECT 'Dexterity Training', 'dex', 10, 1, 'Reflex and precision drills to maximize accuracy.'
WHERE NOT EXISTS (SELECT 1 FROM gym_trainings WHERE name = 'Dexterity Training');

-- Education Courses Seed (at least 4 courses)
INSERT INTO education_courses (title, description, duration_seconds, cost_gold, stat_boost_type, stat_boost_val, perk_code)
SELECT 'Physical Training', 'Foundational physical fitness course boosting max energy.', 60, 100, 'max_energy', 5, 'PHYS_TRAIN_1'
WHERE NOT EXISTS (SELECT 1 FROM education_courses WHERE title = 'Physical Training');

INSERT INTO education_courses (title, description, duration_seconds, cost_gold, stat_boost_type, stat_boost_val, perk_code)
SELECT 'Combat Tactics', 'Strategic hand-to-hand and weapon combat methods.', 120, 250, 'str', 5, 'COMBAT_TACTICS_1'
WHERE NOT EXISTS (SELECT 1 FROM education_courses WHERE title = 'Combat Tactics');

INSERT INTO education_courses (title, description, duration_seconds, cost_gold, stat_boost_type, stat_boost_val, perk_code)
SELECT 'Economics 101', 'Fundamentals of investment, trading, and passive yield generation.', 180, 500, 'passive_income', 5, 'ECON_101'
WHERE NOT EXISTS (SELECT 1 FROM education_courses WHERE title = 'Economics 101');

INSERT INTO education_courses (title, description, duration_seconds, cost_gold, stat_boost_type, stat_boost_val, perk_code)
SELECT 'Advanced Stealth', 'Infiltration and escape techniques enhancing nerve capacity.', 240, 750, 'max_nerve', 5, 'ADV_STEALTH_1'
WHERE NOT EXISTS (SELECT 1 FROM education_courses WHERE title = 'Advanced Stealth');

-- Stocks Seed (at least 3 companies)
INSERT INTO stocks (symbol, name, share_price, dividend_rate_per_hour, description) VALUES
  ('DRK', 'DarkCorp', 100, 10, 'A global conglomerate in subterranean shadow operations.'),
  ('BLD', 'BloodBank', 250, 25, 'Premier medical and biotechnology research firm.'),
  ('VLT', 'ShadowVault', 500, 50, 'Offshore banking and wealth protection protocols.')
ON CONFLICT (symbol) DO NOTHING;
