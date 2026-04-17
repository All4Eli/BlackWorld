import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { betAmount, gameType } = await request.json();

        if (!betAmount || betAmount <= 0 || !Number.isInteger(betAmount)) {
            return NextResponse.json({ error: 'Invalid bet amount' }, { status: 400 });
        }

        // Fetch player data — gold lives in hero_data.gold
        const { data: player, error: fetchError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (fetchError || !player) {
            return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }

        let hero = player.hero_data || {};
        const currentGold = hero.gold || 0;

        if (currentGold < betAmount) {
            return NextResponse.json({ error: 'Insufficient gold.' }, { status: 400 });
        }

        // Determine outcome based on game type
        let win = false;
        let multiplier = 2;

        if (gameType === 'coin_flip') {
            win = Math.random() > 0.5;
            multiplier = 2;
        } else if (gameType === 'slots') {
            win = Math.random() > 0.75;
            multiplier = 4;
        } else if (gameType === 'roulette') {
            win = Math.random() > 0.95;
            multiplier = 12;
        } else {
            return NextResponse.json({ error: 'Unknown game type.' }, { status: 400 });
        }

        const netChange = win ? (betAmount * multiplier) - betAmount : -betAmount;
        const newBalance = currentGold + netChange;

        hero.gold = newBalance;

        // Save back to DB
        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            win,
            net_change: netChange,
            new_balance: newBalance,
            game_type: gameType
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
