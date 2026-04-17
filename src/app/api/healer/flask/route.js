import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: player, error: pError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (pError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        const cost = 50;
        
        if ((hero.gold || 0) < cost) {
            return NextResponse.json({ error: 'Not enough gold.' }, { status: 400 });
        }
        
        if ((hero.flasks || 0) >= 5) {
            return NextResponse.json({ error: 'You are already carrying maximum flasks.' }, { status: 400 });
        }
        
        hero.gold -= cost;
        hero.flasks = (hero.flasks || 0) + 1;
        
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
