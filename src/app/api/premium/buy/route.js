import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { action, amount, itemName, cost } = await request.json();

        const { data: player, error: pError } = await supabase
            .from('players')
            .select('id, hero_data')
            .eq('clerk_user_id', userId)
            .single();
            
        if (pError || !player) throw new Error('Player not found');

        let hero = player.hero_data || {};
        hero.blood_stones = hero.blood_stones || 0;

        if (action === 'BUY_CURRENCY') {
            // In a real app this would be a verified webhook from Stripe, but we simulate it:
            hero.blood_stones += amount;
        } else if (action === 'BUY_ITEM') {
            if (hero.blood_stones < cost) {
                return NextResponse.json({ error: 'Insufficient Blood Stones' }, { status: 400 });
            }
            // Consume currency
            hero.blood_stones -= cost;
            // Optionally add the cosmetic flag
            if (!hero.premium_items) hero.premium_items = [];
            if (!hero.premium_items.includes(itemName)) {
                hero.premium_items.push(itemName);
            }
        } else {
            return NextResponse.json({ error: 'Unknown Action' }, { status: 400 });
        }

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
