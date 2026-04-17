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

        if (betAmount > 10000) {
            return NextResponse.json({ error: 'Maximum bet is 10,000 gold.' }, { status: 400 });
        }

        // Determine game parameters server-side
        let winChance, multiplier;
        if (gameType === 'coin_flip') {
            winChance = 0.48; // slight house edge
            multiplier = 2;
        } else if (gameType === 'slots') {
            winChance = 0.22;
            multiplier = 4;
        } else if (gameType === 'roulette') {
            winChance = 0.05;
            multiplier = 12;
        } else {
            return NextResponse.json({ error: 'Unknown game type.' }, { status: 400 });
        }

        // Server-side RNG
        const win = Math.random() < winChance;
        const netChange = win ? (betAmount * multiplier) - betAmount : -betAmount;

        // Atomic gold mutation via hero_data JSONB
        // Use a single UPDATE with a WHERE check to prevent going negative
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

        const newBalance = currentGold + netChange;
        hero.gold = Math.max(0, newBalance);

        // Atomic conditional update — only proceed if gold hasn't changed since read
        const { error: updateError, count } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId)
            .eq('hero_data->>gold', currentGold.toString());

        if (updateError) throw updateError;

        // If count is 0, gold was modified between read and write (concurrent bet)
        if (count === 0) {
            return NextResponse.json({ error: 'Transaction conflict. Try again.' }, { status: 409 });
        }

        return NextResponse.json({
            success: true,
            win,
            net_change: netChange,
            updatedHero: hero,
            game_type: gameType
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
