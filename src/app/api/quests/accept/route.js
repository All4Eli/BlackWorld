import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { quest } = await request.json();

        if (!quest || !quest.id) {
            return NextResponse.json({ error: 'Valid quest object required.' }, { status: 400 });
        }

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        let accepted = hero.accepted_quests || [];
        
        // Prevent dupes
        if (accepted.find(q => q.id === quest.id)) {
             return NextResponse.json({ error: 'Quest already accepted.' }, { status: 400 });
        }
        
        accepted.push({ ...quest, accepted_at: new Date().toISOString() });
        hero.accepted_quests = accepted;

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            updatedHero: hero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
