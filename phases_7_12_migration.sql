-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ⚠️  DEPRECATED — DO NOT EXECUTE THIS FILE                          ║
-- ║                                                                      ║
-- ║  This file uses players(id) as the FK target, which is INCOMPATIBLE  ║
-- ║  with the production schema in rebuild_database.js that uses          ║
-- ║  players(clerk_user_id).                                              ║
-- ║                                                                      ║
-- ║  All tables defined here already exist in rebuild_database.js with    ║
-- ║  the correct FK pattern. Running this file WILL cause errors.         ║
-- ║                                                                      ║
-- ║  Flagged in Phase 1 Audit (CRIT-1) — April 2026                      ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- PHASE 7: PVP
CREATE TABLE IF NOT EXISTS pvp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id UUID REFERENCES players(id),
  defender_id UUID REFERENCES players(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'in_progress', 'completed', 'expired')),
  wager_gold INT DEFAULT 0,
  winner_id UUID REFERENCES players(id),
  combat_log JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS pvp_stats (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  arena_wins INT DEFAULT 0,
  arena_losses INT DEFAULT 0,
  openworld_kills INT DEFAULT 0,
  openworld_deaths INT DEFAULT 0,
  win_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  total_gold_won BIGINT DEFAULT 0,
  total_gold_lost BIGINT DEFAULT 0,
  elo_rating INT DEFAULT 1000,
  rank_tier TEXT DEFAULT 'Unranked',
  infamy INT DEFAULT 0,
  bounty_gold INT DEFAULT 0,
  last_fight_at TIMESTAMPTZ,
  pvp_flag BOOLEAN DEFAULT false,
  pvp_flag_cooldown TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS openworld_attacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id UUID REFERENCES players(id),
  defender_id UUID REFERENCES players(id),
  zone_id TEXT,
  outcome TEXT CHECK (outcome IN ('attacker_won', 'defender_won', 'fled', 'interrupted')),
  gold_stolen INT DEFAULT 0,
  infamy_gained INT DEFAULT 0,
  combat_log JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID REFERENCES players(id),
  placed_by_id UUID REFERENCES players(id),
  bounty_gold INT NOT NULL,
  reason TEXT,
  claimed_by_id UUID REFERENCES players(id),
  status TEXT CHECK (status IN ('active', 'claimed', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);

CREATE TABLE IF NOT EXISTS pvp_immunity (
  player_id UUID REFERENCES players(id),
  immune_from_id UUID REFERENCES players(id),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (player_id, immune_from_id)
);

CREATE TABLE IF NOT EXISTS contested_zones (
  zone_id TEXT PRIMARY KEY,
  danger_multiplier FLOAT DEFAULT 1.5,
  loot_multiplier FLOAT DEFAULT 2.0,
  pvp_always_enabled BOOLEAN DEFAULT true
);

-- PHASE 8: Quests
CREATE TABLE IF NOT EXISTS quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  quest_type TEXT CHECK (quest_type IN ('main', 'side', 'daily', 'weekly', 'event', 'legendary')),
  requirements JSONB,
  objectives JSONB,
  rewards JSONB,
  time_limit_minutes INT,
  repeatable BOOLEAN DEFAULT false,
  cooldown_hours INT,
  zone_id TEXT,
  scaling_enabled BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  quest_id UUID REFERENCES quests(id),
  status TEXT CHECK (status IN ('available', 'active', 'completed', 'failed', 'turned_in')),
  progress JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE(player_id, quest_id, started_at)
);

CREATE TABLE IF NOT EXISTS npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  title TEXT,
  zone_id TEXT,
  sprite_url TEXT,
  dialogue JSONB,
  quests_offered UUID[],
  is_vendor BOOLEAN DEFAULT false,
  vendor_inventory JSONB
);

-- PHASE 9: Crafting
CREATE TABLE IF NOT EXISTS gathering_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id TEXT,
  node_type TEXT CHECK (node_type IN ('ore', 'herb', 'essence', 'bone', 'shadow', 'void_crystal')),
  name TEXT,
  tier TEXT CHECK (tier IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Celestial')),
  respawn_seconds INT DEFAULT 300,
  gather_time_seconds INT DEFAULT 5,
  loot_table JSONB,
  min_skill_level INT DEFAULT 1,
  sprite_url TEXT
);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  result_item_id TEXT,
  result_quantity INT DEFAULT 1,
  category TEXT CHECK (category IN ('weapon', 'armor', 'consumable', 'accessory', 'material', 'enhancement')),
  tier TEXT,
  ingredients JSONB,
  required_skill_level INT DEFAULT 1,
  craft_time_seconds INT DEFAULT 10,
  skill_xp_reward INT DEFAULT 10,
  gold_cost INT DEFAULT 0,
  success_chance FLOAT DEFAULT 1.0,
  is_discoverable BOOLEAN DEFAULT true,
  discovered_from TEXT
);

CREATE TABLE IF NOT EXISTS player_crafting (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  skill_level INT DEFAULT 1,
  skill_xp INT DEFAULT 0,
  known_recipes UUID[],
  lifetime_crafts INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS crafting_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  recipe_id UUID REFERENCES recipes(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  completes_at TIMESTAMPTZ,
  claimed BOOLEAN DEFAULT false
);

-- PHASE 10: Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('combat', 'exploration', 'social', 'economy', 'crafting', 'pvp', 'collection', 'power', 'secret')),
  icon_url TEXT,
  points INT DEFAULT 10,
  criteria JSONB,
  rewards JSONB,
  is_hidden BOOLEAN DEFAULT false,
  is_repeatable BOOLEAN DEFAULT false,
  repeat_multiplier FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  achievement_id UUID REFERENCES achievements(id),
  progress INT DEFAULT 0,
  times_completed INT DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  rewards_claimed BOOLEAN DEFAULT false,
  UNIQUE(player_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color_hex TEXT DEFAULT '#FFFFFF',
  rarity TEXT CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Celestial', 'Transcendent')),
  source TEXT,
  glow_effect TEXT
);

CREATE TABLE IF NOT EXISTS player_titles (
  player_id UUID REFERENCES players(id),
  title_id UUID REFERENCES titles(id),
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (player_id, title_id)
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS active_title_id UUID REFERENCES titles(id);
ALTER TABLE players ADD COLUMN IF NOT EXISTS achievement_points INT DEFAULT 0;

-- PHASE 11: World Events
CREATE TABLE IF NOT EXISTS world_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT CHECK (event_type IN ('invasion', 'world_boss', 'gathering_rush', 'pvp_tournament', 'double_xp', 'contested_war', 'blood_moon', 'void_rift')),
  affected_zones TEXT[],
  modifiers JSONB,
  schedule_cron TEXT,
  duration_minutes INT,
  min_participants INT DEFAULT 1,
  max_participants INT,
  scaling_enabled BOOLEAN DEFAULT true,
  rewards JSONB,
  is_active BOOLEAN DEFAULT false,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_participation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES world_events(id),
  player_id UUID REFERENCES players(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  contribution_score BIGINT DEFAULT 0,
  damage_dealt BIGINT DEFAULT 0,
  kills INT DEFAULT 0,
  rewards_claimed BOOLEAN DEFAULT false,
  UNIQUE(event_id, player_id)
);

CREATE TABLE IF NOT EXISTS world_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_type TEXT,
  modifier_value JSONB,
  source_event_id UUID REFERENCES world_events(id),
  zone_id TEXT,
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ
);

-- PHASE 12: Skills & Attributes
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  skill_type TEXT CHECK (skill_type IN ('active', 'passive', 'ultimate', 'legendary')),
  category TEXT CHECK (category IN ('combat', 'shadow', 'blood', 'void', 'arcane', 'survival', 'utility')),
  tier INT CHECK (tier BETWEEN 1 AND 10),
  position INT,
  prerequisites UUID[],
  max_rank INT DEFAULT 10,
  effects_per_rank JSONB,
  base_cooldown_seconds INT,
  base_mana_cost INT,
  scaling_stat TEXT,
  icon_url TEXT,
  unlock_source TEXT DEFAULT 'tree'
);

CREATE TABLE IF NOT EXISTS player_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  skill_id UUID REFERENCES skills(id),
  current_rank INT DEFAULT 1,
  xp_in_rank INT DEFAULT 0,
  is_slotted BOOLEAN DEFAULT false,
  slot_position INT CHECK (slot_position BETWEEN 1 AND 8),
  times_used BIGINT DEFAULT 0,
  UNIQUE(player_id, skill_id)
);

CREATE TABLE IF NOT EXISTS player_attributes (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  strength INT DEFAULT 10,
  agility INT DEFAULT 10,
  cunning INT DEFAULT 10,
  vitality INT DEFAULT 10,
  spirit INT DEFAULT 10,
  luck INT DEFAULT 10,
  unspent_points INT DEFAULT 0,
  total_points_earned INT DEFAULT 0
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS current_mana INT DEFAULT 100;
ALTER TABLE players ADD COLUMN IF NOT EXISTS max_mana INT DEFAULT 100;
ALTER TABLE players ADD COLUMN IF NOT EXISTS skill_points_available INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS skill_points_spent INT DEFAULT 0;
