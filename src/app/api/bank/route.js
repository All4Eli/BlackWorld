import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { amount, action } = await request.json();
        const val = parseInt(amount);

        if (!val || val <= 0 || !Number.isInteger(val)) {
            return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
        }

        if (action !== 'deposit' && action !== 'withdraw') {
            return NextResponse.json({ error: 'Invalid action. Must be deposit or withdraw.' }, { status: 400 });
        }

        // Fetch current state
        const { data: player, error: fetchError } = await supabase
            .from('players')
            .select('hero_data, bank_balance')
            .eq('clerk_user_id', userId)
            .single();

        if (fetchError || !player) {
            return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }

        let hero = player.hero_data || {};
        const currentGold = hero.gold || 0;
        const bankedGold = player.bank_balance || 0;

        if (action === 'deposit') {
            if (currentGold < val) {
                return NextResponse.json({ error: 'Not enough gold on person.' }, { status: 400 });
            }
            hero.gold = currentGold - val;

            const { error: updateError } = await supabase
                .from('players')
                .update({ 
                    hero_data: hero, 
                    bank_balance: bankedGold + val 
                })
                .eq('clerk_user_id', userId);

            if (updateError) throw updateError;

            return NextResponse.json({
                success: true,
                gold: hero.gold,
                bankedGold: bankedGold + val
            });
        } else {
            // withdraw
            if (bankedGold < val) {
                return NextResponse.json({ error: 'Not enough gold in vault.' }, { status: 400 });
            }
            hero.gold = currentGold + val;

            const { error: updateError } = await supabase
                .from('players')
                .update({ 
                    hero_data: hero, 
                    bank_balance: bankedGold - val 
                })
                .eq('clerk_user_id', userId);

            if (updateError) throw updateError;

            return NextResponse.json({
                success: true,
                gold: hero.gold,
                bankedGold: bankedGold - val
            });
        }
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
