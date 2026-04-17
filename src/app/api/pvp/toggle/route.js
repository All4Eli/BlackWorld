import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { flag } = await request.json();

        // Fetch user ID
        const { data: player, error: pError } = await supabase
            .from('players')
            .select('id')
            .eq('clerk_user_id', userId)
            .single();

        if (pError || !player) throw new Error('Player not found.');

        // Upsert into pvp_stats
        const { error: upsertError } = await supabase
            .from('pvp_stats')
            .upsert({ player_id: player.id, pvp_flag: flag }, { onConflict: 'player_id' });

        if (upsertError) throw upsertError;

        // Also update players table for ease
        const { data: updatedPlayer, error: pUpdateError } = await supabase
            .from('players')
            .update({ pvp_flag: flag })
            .eq('id', player.id)
            .select('*')
            .single();

        if (pUpdateError) throw pUpdateError;

        const payload = {
           ...(updatedPlayer?.hero_data || {}),
           coven_id: updatedPlayer?.coven_id,
           coven_name: updatedPlayer?.coven_name,
           coven_tag: updatedPlayer?.coven_tag,
           coven_role: updatedPlayer?.coven_role,
           bankedGold: updatedPlayer?.bank_balance,
           pvp_flag: updatedPlayer?.pvp_flag
        };

        return NextResponse.json({ success: true, flag, updatedHero: payload });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
