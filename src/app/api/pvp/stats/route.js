import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // 1. Fetch current player's pvp stats utilizing their internal player ID
        const { data: player, error: pError } = await supabase
            .from('players')
            .select('id, hero_data')
            .eq('clerk_user_id', userId)
            .single();
            
        if (pError || !player) throw new Error('Player not found');

        const { data: stats } = await supabase
            .from('pvp_stats')
            .select('*')
            .eq('player_id', player.id)
            .single();

        // 2. Fetch other players
        const { data: allPlayers } = await supabase
            .from('players')
            .select('id, username, level, pvp_flag, pvp_stats(elo_rating, rank_tier)')
            .neq('id', player.id)
            .limit(20);

        return NextResponse.json({
            stats: stats || { arena_wins: 0, arena_losses: 0, elo_rating: 1000, infamy: 0, total_gold_won: 0 },
            players: allPlayers || []
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
