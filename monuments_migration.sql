-- ═══════════════════════════════════════════════════════════════════
-- MONUMENTS & GLOBAL PROJECTS — Schema Migration
-- ═══════════════════════════════════════════════════════════════════
--
-- Monuments are server-wide collaborative building projects.
-- Players donate gold/essence/blood_stones to push a shared progress
-- bar toward completion. When a monument is completed, all contributors
-- receive a permanent passive combat buff.
--
-- CONCURRENCY SAFETY:
--   All mutations use SELECT ... FOR UPDATE on the monuments row.
--   Progress is clamped with LEAST(current + amount, required).
--   Status transitions are atomic (WHERE status = 'building').
--
-- ═══════════════════════════════════════════════════════════════════

-- Main monuments table
CREATE TABLE IF NOT EXISTS monuments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key              TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  resource_type    TEXT NOT NULL DEFAULT 'gold'
                   CHECK (resource_type IN ('gold', 'essence', 'blood_stones')),
  current_progress INTEGER NOT NULL DEFAULT 0 CHECK (current_progress >= 0),
  required_amount  INTEGER NOT NULL CHECK (required_amount > 0),
  status           TEXT NOT NULL DEFAULT 'building'
                   CHECK (status IN ('building', 'completed', 'destroyed')),
  buff_key         TEXT,
  coven_id         UUID REFERENCES covens(id) ON DELETE SET NULL,  -- NULL = server-wide
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-player donation tracking (leaderboard source)
CREATE TABLE IF NOT EXISTS monument_contributions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monument_id      UUID NOT NULL REFERENCES monuments(id) ON DELETE CASCADE,
  player_id        TEXT NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  total_donated    INTEGER NOT NULL DEFAULT 0 CHECK (total_donated >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (monument_id, player_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_monuments_status ON monuments(status);
CREATE INDEX IF NOT EXISTS idx_monument_contribs_monument ON monument_contributions(monument_id, total_donated DESC);
CREATE INDEX IF NOT EXISTS idx_monument_contribs_player ON monument_contributions(player_id);

-- CHECK constraint: progress can never exceed required_amount
ALTER TABLE monuments ADD CONSTRAINT monuments_progress_cap
  CHECK (current_progress <= required_amount);


-- ═══════════════════════════════════════════════════════════════════
-- SEED: Initial Monument Projects
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO monuments (key, name, description, resource_type, required_amount, buff_key) VALUES
  ('obsidian_obelisk',
   'Obsidian Obelisk',
   'A towering monolith of volcanic glass. Its completion will strengthen the vitality of all who contributed.',
   'gold', 100000,
   'obsidian_obelisk'),

  ('crimson_forge',
   'The Crimson Forge',
   'An ancient forge fueled by blood essence. Once ignited, it will sharpen the blades of every warrior.',
   'essence', 50000,
   'crimson_forge'),

  ('veil_of_shadows',
   'Veil of Shadows',
   'A dark shroud woven from pure gold. When complete, it will harden the defenses of the city.',
   'gold', 150000,
   'veil_of_shadows'),

  ('blood_fountain',
   'Blood Fountain',
   'A forbidden wellspring powered by Blood Stones. Contributors will gain the power of lifesteal.',
   'blood_stones', 5000,
   'blood_fountain'),

  ('warden_spire',
   'The Warden''s Spire',
   'A sentinel tower that sharpens the reflexes of all who helped build it.',
   'gold', 200000,
   'warden_spire')

ON CONFLICT (key) DO NOTHING;
