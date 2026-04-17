import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Fetch player stats
        const { data: player, error: err1 } = await supabase
            .from('players')
            .select('clerk_user_id, level, bank_balance, hero_data')
            .eq('clerk_user_id', userId)
            .single();
        if (err1) throw err1;

        // Ensure player achievements exist
        const { data: existing, error: err2 } = await supabase
            .from('player_achievements')
            .select('achievement_id')
            .eq('clerk_user_id', userId);
        if (err2) throw err2;

        const unlockedIds = existing.map(e => e.achievement_id);
        const unlocks = [];
        let newPoints = 0;

        // Custom Evaluation Logic
        // In a real system, we iterate through db achievements and check criteria.
        // For here, we'll hardcode some logical unlocks based on progression.

        // Level achievements
        if (player.level >= 5 && !unlockedIds.includes('lvl_5')) unlocks.push({ id: 'lvl_5', pts: 10 });
        if (player.level >= 10 && !unlockedIds.includes('lvl_10')) unlocks.push({ id: 'lvl_10', pts: 20 });
        if (player.level >= 25 && !unlockedIds.includes('lvl_25')) unlocks.push({ id: 'lvl_25', pts: 50 });

        // Wealth achievements
        if (player.bank_balance >= 1000 && !unlockedIds.includes('gold_1k')) unlocks.push({ id: 'gold_1k', pts: 10 });
        if (player.bank_balance >= 10000 && !unlockedIds.includes('gold_10k')) unlocks.push({ id: 'gold_10k', pts: 50 });

        // Combat achievements
        const kills = player.hero_data?.stats?.kills || 0;
        if (kills >= 10 && !unlockedIds.includes('kills_10')) unlocks.push({ id: 'kills_10', pts: 10 });
        if (kills >= 100 && !unlockedIds.includes('kills_100')) unlocks.push({ id: 'kills_100', pts: 50 });

        if (unlocks.length > 0) {
            const inserts = unlocks.map(u => ({
                clerk_user_id: userId,
                achievement_id: u.id,
                unlocked_at: new Date().toISOString()
            }));

            const { error: insertErr } = await supabase.from('player_achievements').insert(inserts);
            if (insertErr) throw insertErr;

            newPoints = unlocks.reduce((sum, u) => sum + u.pts, 0);

            // Fetch current, then Update player overall points
            const { data: currRecord } = await supabase.from('players').select('achievement_points').eq('clerk_user_id', userId).single();
            const currPts = currRecord?.achievement_points || 0;
            
            await supabase.from('players').update({ achievement_points: currPts + newPoints }).eq('clerk_user_id', userId);

            // Fetch updated player
            const { data: updatedPlayer } = await supabase
               .from('players')
               .select('achievement_points, hero_data')
               .eq('clerk_user_id', userId)
               .single();

            // Manually inject fresh achievement points into hero_data payload to immediately inform the UI
            const newHeroPayload = {
               ...updatedPlayer?.hero_data,
               achievement_points: updatedPlayer?.achievement_points
            };

            return NextResponse.json({ success: true, newlyUnlocked: unlocks, updatedHero: newHeroPayload });
        }

        return NextResponse.json({ success: true, newlyUnlocked: [] });

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
