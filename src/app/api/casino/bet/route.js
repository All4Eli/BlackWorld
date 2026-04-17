import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { betAmount, gameType } = await request.json();

        if (!betAmount || betAmount <= 0) {
            return NextResponse.json({ error: 'Invalid bet amount' }, { status: 400 });
        }

        const { data, error } = await supabase.rpc('execute_casino_bet', {
            p_user_id: userId,
            p_bet_amount: betAmount,
            p_game_type: gameType
        });

        if (error) {
            throw error;
        }

        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 400 });
    }
}
