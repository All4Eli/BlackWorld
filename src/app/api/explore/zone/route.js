import { supabase } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { zoneId } = await request.json();

        if (!zoneId) {
            return NextResponse.json({ error: 'Zone ID is required.' }, { status: 400 });
        }

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        // Lookup the zone payload 
        const { ZONES } = await import('@/lib/gameData');
        const activeZone = ZONES.find(z => z.id === zoneId);

        if (!activeZone) {
            return NextResponse.json({ error: 'Zone not found.' }, { status: 404 });
        }
        if (hero.level < activeZone.levelReq) {
            return NextResponse.json({ error: 'Level too low for this zone.' }, { status: 400 });
        }

        hero.activeZone = activeZone;

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
