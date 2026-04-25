// ═══════════════════════════════════════════════════════════════════
// GET /api/dungeons/list — Fetch all dungeons with cooldown status
// ═══════════════════════════════════════════════════════════════════
//
// This lightweight endpoint returns the dungeon catalog with
// per-player cooldown status, level lock indicators, and
// active run detection.
//
// QUERY PATTERN — CORRELATED SUBQUERY:
//
//   (SELECT dr.completed_at FROM dungeon_runs dr
//    WHERE dr.player_id = $1 AND dr.dungeon_id = d.id
//    ORDER BY dr.started_at DESC LIMIT 1) as last_completed_at
//
//   This subquery runs ONCE per dungeon row in the outer SELECT.
//   PostgreSQL's query planner evaluates it as a "correlated subquery"
//   because it references the outer table's column (d.id).
//
//   The subquery finds the MOST RECENT completed run for this player
//   in this specific dungeon. We use it to calculate cooldown.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql } from '@/lib/db/pool';
import * as HeroDal from '@/lib/db/dal/hero';


async function handleGet(req, { userId }) {
  // ── 1. Fetch player level ─────────────────────────────────────
  const { data: hero } = await HeroDal.getHeroStats(userId);
  const playerLevel = hero?.level || 1;

  // ── 2. Fetch all active dungeons with last completion time ────
  //
  // The correlated subquery fetches the last completed_at for each
  // dungeon. We also check for an active ('in_progress') run.
  //
  const { data: dungeons } = await sql(`
    SELECT 
      d.id, d.name, d.description, d.zone_id, d.icon,
      d.difficulty, d.min_level, d.floor_count,
      d.cooldown_hours, d.rewards,
      (
        SELECT dr.completed_at 
        FROM dungeon_runs dr 
        WHERE dr.player_id = $1 AND dr.dungeon_id = d.id 
          AND dr.result IN ('completed', 'failed')
        ORDER BY dr.started_at DESC LIMIT 1
      ) AS last_completed_at,
      EXISTS (
        SELECT 1 FROM dungeon_runs dr
        WHERE dr.player_id = $1 AND dr.dungeon_id = d.id
          AND dr.result = 'in_progress'
      ) AS has_active_run
    FROM dungeons d
    WHERE d.is_active = true
    ORDER BY d.min_level ASC
  `, [userId]);

  // ── 3. Annotate with cooldown + lock status ───────────────────
  const now = Date.now();
  const annotated = (dungeons || []).map(d => {
    let onCooldown = false;
    let cooldownEndsAt = null;

    if (d.last_completed_at && d.cooldown_hours) {
      const completedMs = new Date(d.last_completed_at).getTime();
      const cooldownMs = d.cooldown_hours * 60 * 60 * 1000;
      cooldownEndsAt = new Date(completedMs + cooldownMs);
      onCooldown = now < cooldownEndsAt.getTime();
    }

    return {
      ...d,
      levelLocked: playerLevel < d.min_level,
      onCooldown,
      cooldownEndsAt: onCooldown ? cooldownEndsAt.toISOString() : null,
      hasActiveRun: d.has_active_run,
      isAvailable: playerLevel >= d.min_level && !onCooldown && !d.has_active_run,
    };
  });

  return NextResponse.json({ dungeons: annotated });
}


export const GET = withMiddleware(handleGet, { rateLimit: null });
