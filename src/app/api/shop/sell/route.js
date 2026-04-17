import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { itemId, itemName } = await request.json();

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        const artifacts = hero.artifacts || [];

        // Find item
        const itemIdx = artifacts.findIndex(a => a.id === itemId || a.name === itemName);
        if (itemIdx === -1) {
            return NextResponse.json({ error: 'Item not found in inventory.' }, { status: 404 });
        }

        const item = artifacts[itemIdx];

        // Determine value
        const baseValues = { COMMON: 20, UNCOMMON: 50, RARE: 150, EPIC: 400, LEGENDARY: 1000, CELESTIAL: 3000 };
        const goldAwarded = baseValues[item.rarity || 'COMMON'] || 10;

        // Remove from inventory
        hero.artifacts.splice(itemIdx, 1);
        
        // Add gold
        hero.gold = (hero.gold || 0) + goldAwarded;

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, updatedHero: hero, goldAwarded });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
