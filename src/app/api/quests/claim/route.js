import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { questId } = await request.json();

        // 1. Fetch current player database blob
        const { data: player, error: pError } = await supabase
            .from('players')
            .select('id, hero_data')
            .eq('clerk_user_id', userId)
            .single();
            
        if (pError || !player) throw new Error('Player not found');

        let hero = player.hero_data || {};
        
        const acceptedQuests = hero.accepted_quests || [];
        const questToClaim = acceptedQuests.find(q => q.id === questId);

        if (!questToClaim) {
            return NextResponse.json({ error: 'Quest not found in active log.' }, { status: 400 });
        }

        if ((questToClaim.progress || 0) < questToClaim.target) {
            return NextResponse.json({ error: 'Quest conditions are not met.' }, { status: 400 });
        }

        // Apply Rewards securely
        const reward = questToClaim.reward || {};
        hero.gold = (hero.gold || 0) + (reward.gold || 0);
        hero.xp = (hero.xp || 0) + (reward.xp || 0);
        hero.flasks = Math.min(5, (hero.flasks || 0) + (reward.flasks || 0));

        // Delete from accepted_quests array to prevent infinite claims
        hero.accepted_quests = acceptedQuests.filter(q => q.id !== questId);

        // Update DB
        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, updatedHero: hero, reward });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
