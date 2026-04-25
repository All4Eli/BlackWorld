// ═══════════════════════════════════════════════════════════════════
// POST /api/explore/zone — Set the player's active exploration zone
// ═══════════════════════════════════════════════════════════════════
//
// NORMALIZED: The active zone is now stored as a discrete column
// (or passed client-side). No hero_data JSONB read/write.
//
// DATA FLOW:
//   Client sends: { zoneId: "ashen_wastes" }
//   DB:           SELECT level, visited_zones FROM hero_stats
//   Validation:   hero.level >= zone.levelReq
//   DB (if new):  UPDATE hero_stats SET zones_explored = zones_explored + 1,
//                   visited_zones = visited_zones || '["zoneId"]'
//   Response:     { success, zone: { ...zoneData } }
//   UI:           ExplorationEngine stores activeZone in local state
// ═══════════════════════════════════════════════════════════════════

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { sqlOne, sql } from '@/lib/db/pool';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { zoneId } = await request.json();

        if (!zoneId) {
            return NextResponse.json({ error: 'Zone ID is required.' }, { status: 400 });
        }

        // ── Read level + visited_zones from normalized columns ──────
        const { data: hero, error: heroErr } = await sqlOne(
          `SELECT level, visited_zones FROM hero_stats WHERE player_id = $1`,
          [userId]
        );

        if (heroErr || !hero) {
            return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }

        // Lookup the zone from game data catalog
        const { ZONES } = await import('@/lib/gameData');
        const activeZone = ZONES.find(z => z.id === zoneId);

        if (!activeZone) {
            return NextResponse.json({ error: 'Zone not found.' }, { status: 404 });
        }
        if (hero.level < activeZone.levelReq) {
            return NextResponse.json({ error: 'Level too low for this zone.' }, { status: 400 });
        }

        // ── Track zone exploration for achievements ─────────────────
        //
        // visited_zones is a JSONB array like ["ashen_wastes", "shadow_vale"].
        // We only increment zones_explored when a zone is visited for the
        // FIRST TIME. The @> operator checks if the array already contains
        // the zoneId. If not, we append it and increment the counter.
        //
        const visitedZones = hero.visited_zones || [];
        const isFirstVisit = !visitedZones.includes(zoneId);

        if (isFirstVisit) {
          await sql(
            `UPDATE hero_stats
             SET zones_explored = zones_explored + 1,
                 visited_zones = visited_zones || $1::jsonb
             WHERE player_id = $2`,
            [JSON.stringify([zoneId]), userId]
          );
        }

        return NextResponse.json({
            success: true,
            zone: activeZone,
            // updatedHero returns the zone for the client shallow merge
            updatedHero: {
                activeZone,
                ...(isFirstVisit ? { zonesExplored: visitedZones.length + 1 } : {}),
            },
        });

    } catch (err) {
        console.error('[EXPLORE/ZONE]', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
