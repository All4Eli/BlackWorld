import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { statStr } = await request.json();
        
        const validStats = ['str', 'def', 'dex', 'int', 'vit'];
        if (!validStats.includes(statStr)) {
            return NextResponse.json({ error: 'Invalid stat allocation.' }, { status: 400 });
        }

        const { data: player, error: pError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (pError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        if ((hero.unspentStatPoints || 0) <= 0) {
            return NextResponse.json({ error: 'No stat points available.' }, { status: 400 });
        }

        hero[statStr] = (hero[statStr] || 5) + 1;
        hero.unspentStatPoints -= 1;
        
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
