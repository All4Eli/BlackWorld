import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { type, cost } = await request.json();

        // Valid resource types to refill
        const validTypes = ['essence', 'vitae', 'resolve'];
        if (!validTypes.includes(type)) {
             return NextResponse.json({ error: 'Invalid resource type.' }, { status: 400 });
        }

        const { data: player, error: pError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (pError || !player) throw new Error('Player not found');

        let hero = player.hero_data || {};
        const currentStones = hero.blood_stones || 0;

        if (currentStones < cost) {
             return NextResponse.json({ error: 'Not enough Blood Stones. Visit Store.' }, { status: 400 });
        }

        // Deduct stones and fill resource
        hero.blood_stones -= cost;
        if (!hero.player_resources) hero.player_resources = {};
        
        // Let's cap at max logic. Based on GameShell setting to 9999, we'll give them 100 for a realistic max, or leave 9999 as a placeholder buff
        hero.player_resources[`${type}_current`] = 9999;

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, updatedHero: hero });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
