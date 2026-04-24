import { supabase } from '@/lib/supabase';
import { auth } from '@/lib/auth';
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
        
        if (hero.hp <= 0) {
            return NextResponse.json({ error: 'You are dead. Use Revive instead.' }, { status: 400 });
        }

        const healCost = 20;
        const currentGold = hero.gold || 0;
        
        if (currentGold < healCost) {
            return NextResponse.json({ error: `You need ${healCost} gold to heal.` }, { status: 400 });
        }

        const pStats = calcPlayerStats(hero);
        
        if (hero.hp >= pStats.maxHp) {
            return NextResponse.json({ error: 'You are already at full health.' }, { status: 400 });
        }

        hero.gold = currentGold - healCost;
        hero.hp = pStats.maxHp;

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            updatedHero: hero,
            cost: healCost
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
