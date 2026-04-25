-- Phase 16: PvP Season Stats Table
-- This table was referenced by /api/pvp/challenge and /api/pvp/season
-- but never existed in the schema. Creates it now.

CREATE TABLE IF NOT EXISTS pvp_season_stats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       text NOT NULL REFERENCES players(clerk_user_id) ON DELETE CASCADE,
  season_id       uuid NOT NULL REFERENCES pvp_seasons(id) ON DELETE CASCADE,
  wins            integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,
  elo             integer NOT NULL DEFAULT 1000,
  peak_elo        integer NOT NULL DEFAULT 1000,
  rank_tier       text DEFAULT 'Bronze',
  win_streak      integer NOT NULL DEFAULT 0,
  best_streak     integer NOT NULL DEFAULT 0,
  gold_earned     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_pvp_season_stats_season
  ON pvp_season_stats(season_id, elo DESC);
