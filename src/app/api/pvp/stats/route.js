import { PvP, sql } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // 1. Fetch current player's pvp stats utilizing their internal player ID
        const { data: stats } = await PvP.getStats(userId);

        // 2. Fetch other players
        const { data: allPlayers } = await sql(`
            SELECT p.clerk_user_id as id, p.username, h.level, ps.elo_rating, ps.rank_tier
            FROM players p
            JOIN hero_stats h ON p.clerk_user_id = h.player_id
            LEFT JOIN pvp_stats ps ON p.clerk_user_id = ps.player_id
            WHERE p.clerk_user_id != $1
            LIMIT 20
        `, [userId]);

        return NextResponse.json({
            stats: stats || { arena_wins: 0, arena_losses: 0, elo_rating: 1000, infamy: 0, total_gold_won: 0 },
            // Make sure the UI maps to the correct player object structure since we broke the old relation shape
            players: allPlayers?.map(p => ({
                id: p.id,
                username: p.username,
                level: p.level,
                pvp_flag: true,
                pvp_stats: { elo_rating: p.elo_rating ?? 1000, rank_tier: p.rank_tier || 'Bronze' }
            })) || []
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

