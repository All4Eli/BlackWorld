import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { calcPlayerStats } from '@/lib/combat';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        if (hero.hp > 0) {
            return NextResponse.json({ error: 'You are already alive.' }, { status: 400 });
        }

        const level = hero.level || 1;
        const reviveCost = Math.floor((level * 10) * 0.1) + 10; // Scaling cost formula
        
        const currentGold = hero.gold || 0;
        if (currentGold < reviveCost) {
            return NextResponse.json({ error: `You need ${reviveCost} gold to revive.` }, { status: 400 });
        }

        const pStats = calcPlayerStats(hero);
        
        // Revive
        hero.gold = currentGold - reviveCost;
        hero.hp = pStats.maxHp;

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            updatedHero: hero,
            cost: reviveCost
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
