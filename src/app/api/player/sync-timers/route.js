import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { calculateEssence, getDailyQuests } from '@/lib/gameData';

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
        let modified = false;

        // 1. Sync Essence
        const { essence, newTimestamp } = calculateEssence(
            hero.essence_last_regen,
            hero.essence ?? 100,
            100
        );

        if (essence !== (hero.essence ?? 100)) {
            hero.essence = essence;
            hero.essence_last_regen = newTimestamp;
            modified = true;
        }

        // 2. Sync Daily Quests
        const today = new Date().toISOString().split('T')[0];
        const existingQuests = hero.daily_quests;
        if (!existingQuests || !existingQuests[0]?.id?.includes(today)) {
            hero.daily_quests = getDailyQuests();
            modified = true;
        }

        // 3. Retroactive Level Loop
        hero.level = hero.level || 1;
        hero.unspentStatPoints = hero.unspentStatPoints || 0;
        hero.skillPointsUnspent = hero.skillPointsUnspent || 0;
        
        const { calculateXPRequirement } = require('@/lib/gameData');
        let requiredXp = calculateXPRequirement(hero.level);

        if ((hero.xp || 0) >= requiredXp) {
             while ((hero.xp || 0) >= requiredXp) {
                  hero.xp -= requiredXp;
                  hero.level += 1;
                  hero.unspentStatPoints += 3;
                  hero.skillPointsUnspent += 1;
                  requiredXp = calculateXPRequirement(hero.level);
             }
             modified = true;
        }

        if (modified) {
            const { error: updateError } = await supabase
                .from('players')
                .update({ hero_data: hero })
                .eq('clerk_user_id', userId);

            if (updateError) throw updateError;
        }

        return NextResponse.json({
            success: true,
            updatedHero: hero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
