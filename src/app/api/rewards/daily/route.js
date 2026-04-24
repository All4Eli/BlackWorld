import { supabase } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: player, error: pError } = await supabase
            .from('players')
            .select('id, hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (pError || !player) throw new Error('Player not found');

        let hero = player.hero_data || {};
        
        // Simple mock detection for a "daily claim" toggle. 
        // In a real application, you'd store the last claim timestamp and check against UTC current day.
        if (hero.claimed_daily_today) {
             return NextResponse.json({ error: 'You have already signed the pact today.' }, { status: 400 });
        }

        const streak = hero.login_streak || 1;
        const currentDay = hero.login_day || 1;

        // Reward logic Server-side
        const newGold = (hero.gold || 0) + 500;
        const newBS = (hero.blood_stones || 0) + 5;

        hero.gold = newGold;
        hero.blood_stones = newBS;
        hero.login_day = (currentDay % 30) + 1;
        hero.login_streak = streak + 1;
        hero.claimed_daily_today = true;

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
