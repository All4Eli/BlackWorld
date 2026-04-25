-- ═══════════════════════════════════════════════════════════════════
-- BLACKWORLD — Migration: Create combat_sessions Table
-- ═══════════════════════════════════════════════════════════════════
-- PURPOSE: Enables the server-authoritative turn-based combat system.
--          Each row represents one ACTIVE fight between a player and
--          a monster.  Rows are deleted when combat ends (victory,
--          defeat, or flee), so this table holds only in-flight state.
--
-- CONSUMERS:
--   src/lib/db/dal/combat.js   — getOrStartCombat(), processTurn()
--   src/lib/db/dal/dungeons.js — advanceDungeonFloor()
-- ═══════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────
--  TABLE DEFINITION
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS combat_sessions (

  -- 1. PRIMARY KEY
  -- gen_random_uuid() is a built-in PostgreSQL function (available
  -- since PG 13 without any extension). It generates a v4 UUID —
  -- a 128-bit identifier with 122 random bits, formatted as:
  --   xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  -- The "4" marks it as version-4 (random). The "y" nibble has
  -- its top two bits set to 10 (RFC 4122 variant).
  -- Using UUID as a PK instead of SERIAL means IDs are globally
  -- unique and not guessable by incrementing.
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 2. PLAYER FOREIGN KEY
  -- References the players table via clerk_user_id (the internal
  -- user ID string like "user_abc123...").
  -- ON DELETE CASCADE means: if a player row is deleted (e.g.,
  -- account ban + purge), their combat session is automatically
  -- cleaned up. Without CASCADE, deleting a player would fail
  -- with a foreign key violation error because this row still
  -- references them.
  player_id         text        NOT NULL
                                REFERENCES players(clerk_user_id)
                                ON DELETE CASCADE,

  -- 3. MONSTER IDENTIFIER
  -- References the monsters table by UUID. When the monster
  -- definition is deleted (e.g., content pruning), we cascade
  -- to avoid orphan sessions pointing at nonexistent monsters.
  monster_id        uuid        NOT NULL
                                REFERENCES monsters(id)
                                ON DELETE CASCADE,

  -- 4. ZONE CONTEXT
  -- Which zone this fight is happening in. Used by the dungeon
  -- system to spawn encounters in the correct zone. References
  -- the zones table (text PK like "bone_crypts").
  zone_id           text        REFERENCES zones(id)
                                ON DELETE SET NULL,

  -- 5. COMBAT STATE — Mutable HP Trackers
  -- These start at the player's/monster's max HP and are
  -- decremented each turn by the combat engine.
  -- CHECK constraints enforce that HP can never go below 0,
  -- which is a database-level safety net even if the application
  -- code has a bug.
  player_hp         integer     NOT NULL  CHECK (player_hp >= 0),
  monster_hp        integer     NOT NULL  CHECK (monster_hp >= 0),

  -- 6. TURN COUNTER
  -- Starts at 1, incremented by the combat engine after each
  -- full turn (player action + monster counter-attack).
  -- The DAL references this as "turn_count" in its UPDATE query.
  turn_count        integer     NOT NULL  DEFAULT 1
                                CHECK (turn_count >= 1),

  -- 7. STATUS EFFECT TRACKERS (JSONB)
  -- The combat engine tracks buff/debuff states as JSON objects.
  -- Examples:
  --   player_statuses: { "aegis_triggered": true, "undying_triggered": false }
  --   monster_statuses: { "bleed": 3 }
  -- JSONB (binary JSON) is used instead of plain JSON because:
  --   • It stores data in a decomposed binary format (faster reads)
  --   • It supports GIN indexing for containment queries (@>)
  --   • It deduplicates object keys automatically
  -- '{}' is the empty-object default — no statuses at fight start.
  player_statuses   jsonb       NOT NULL  DEFAULT '{}'::jsonb,
  monster_statuses  jsonb       NOT NULL  DEFAULT '{}'::jsonb,

  -- 8. SESSION STATUS
  -- Tracks whether this combat is still in progress or how it ended.
  -- The CHECK constraint acts as a pseudo-enum at the database level:
  -- PostgreSQL will reject any INSERT/UPDATE that tries to set status
  -- to a value not in this list.
  status            text        NOT NULL  DEFAULT 'active'
                                CHECK (status IN (
                                  'active',       -- fight is in progress
                                  'resolved',     -- fight ended normally (victory)
                                  'fled',         -- player escaped
                                  'player_dead'   -- player was defeated
                                )),

  -- 9. TIMESTAMPS
  -- created_at: set once when the row is inserted, never changes.
  -- updated_at: reset to now() on every UPDATE by the combat engine.
  --   The DAL explicitly sets "updated_at = now()" in its UPDATE query
  --   (line 170 of combat.js), but we also create a trigger below
  --   as a safety net for any future code path that forgets.
  created_at        timestamptz NOT NULL  DEFAULT now(),
  updated_at        timestamptz NOT NULL  DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────
--  UNIQUE CONSTRAINT: One active session per player
-- ────────────────────────────────────────────────────────────────
-- A player can only be in ONE fight at a time. This partial unique
-- index enforces that rule at the database level.
--
-- HOW IT WORKS:
--   CREATE UNIQUE INDEX ... WHERE status = 'active'
--   This is a "partial index" — it only indexes rows where the
--   condition (status = 'active') is true. So:
--     • A player can have many RESOLVED/FLED/DEAD rows (historical)
--     • But only ONE row where status = 'active'
--   If the combat engine tries to INSERT a second active session
--   for the same player, PostgreSQL raises a unique violation error.
--
-- WHY NOT JUST A UNIQUE CONSTRAINT ON player_id?
--   Because the DAL deletes rows on combat end (line 117 of combat.js),
--   so in practice there's usually only 0 or 1 row per player.
--   But this index protects against race conditions where two
--   concurrent requests both try to start combat simultaneously.

CREATE UNIQUE INDEX IF NOT EXISTS idx_combat_sessions_active_player
  ON combat_sessions (player_id)
  WHERE status = 'active';


-- ────────────────────────────────────────────────────────────────
--  LOOKUP INDEX: Find sessions by player_id quickly
-- ────────────────────────────────────────────────────────────────
-- The combat DAL's first query is always:
--   SELECT * FROM combat_sessions WHERE player_id = $1
-- Without an index, PostgreSQL would do a sequential scan of every
-- row. This B-tree index lets it jump directly to the matching row(s).
-- Since most players have 0-1 sessions, this is a tiny index.

CREATE INDEX IF NOT EXISTS idx_combat_sessions_player
  ON combat_sessions (player_id);


-- ────────────────────────────────────────────────────────────────
--  AUTO-UPDATE TRIGGER: Keep updated_at current
-- ────────────────────────────────────────────────────────────────
-- This reuses the trigger_set_updated_at() function already defined
-- in your schema.sql. It fires BEFORE every UPDATE on this table
-- and sets NEW.updated_at = now().
--
-- "FOR EACH ROW" means it fires once per row being updated, not
-- once per statement. If an UPDATE touches 3 rows, the trigger
-- fires 3 times.
--
-- DROP IF EXISTS prevents errors if you run this migration twice.

DROP TRIGGER IF EXISTS set_updated_at ON combat_sessions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON combat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
