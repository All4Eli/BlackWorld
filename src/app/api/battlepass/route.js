import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { action, tier, type } = await request.json();

        const { data: player, error: pError } = await supabase
            .from('players')
            .select('id, hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (pError || !player) throw new Error('Player not found');

        let hero = player.hero_data || {};
        
        if (!hero.battlepass) {
            hero.battlepass = {
                current_tier: 12, // Default mock progress
                is_premium: false,
                claimed_free: [],
                claimed_premium: []
            };
        }

        if (action === 'BUY_PREMIUM') {
            if (hero.battlepass.is_premium) {
                return NextResponse.json({ error: 'Premium already unlocked.' }, { status: 400 });
            }
            if ((hero.blood_stones || 0) < 1000) {
                return NextResponse.json({ error: 'Insufficient Blood Stones (1000 required).' }, { status: 400 });
            }
            
            hero.blood_stones -= 1000;
            hero.battlepass.is_premium = true;

        } else if (action === 'CLAIM') {
            const arrName = type === 'FREE' ? 'claimed_free' : 'claimed_premium';
            if (type === 'PREMIUM' && !hero.battlepass.is_premium) {
                return NextResponse.json({ error: 'Premium pass not unlocked.' }, { status: 400 });
            }
            if (hero.battlepass.current_tier < tier) {
                return NextResponse.json({ error: 'Tier not reached.' }, { status: 400 });
            }
            if (hero.battlepass[arrName] && hero.battlepass[arrName].includes(tier)) {
                return NextResponse.json({ error: 'Reward already claimed.' }, { status: 400 });
            }

            // Mock granting reward (In production this would map to a PREVIEW_REWARDS logic)
            if (tier === 20) hero.gold = (hero.gold || 0) + 5000;
            // Record claim
            if (!hero.battlepass[arrName]) hero.battlepass[arrName] = [];
            hero.battlepass[arrName].push(tier);

        } else {
            return NextResponse.json({ error: 'Unknown Action' }, { status: 400 });
        }

        // Save back to DB
        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, updatedHero: hero });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
