import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { artifactId, slotId } = await request.json();

        if (!slotId) {
            return NextResponse.json({ error: 'Missing slot to equip.' }, { status: 400 });
        }

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        if (!hero.artifacts) hero.artifacts = [];
        if (!hero.equipment) hero.equipment = { head: null, amulet: null, body: null, mainHand: null, offHand: null, ring1: null, ring2: null, boots: null };

        let itemToEquip = null;
        let originalItemIndex = -1;

        if (artifactId) {
             originalItemIndex = hero.artifacts.findIndex(a => a.id === artifactId);
             if (originalItemIndex === -1) {
                  return NextResponse.json({ error: 'Item not found in inventory.' }, { status: 400 });
             }
             itemToEquip = { ...hero.artifacts[originalItemIndex] };
        }

        // Handle Current Equipped Item
        const currentlyEquipped = hero.equipment[slotId];
        if (currentlyEquipped) {
            // Push old item back to inventory
            hero.artifacts.push({ ...currentlyEquipped });
        }

        if (itemToEquip) {
            // Remove the newly equipped item from raw inventory
            hero.artifacts.splice(originalItemIndex, 1);
            hero.equipment[slotId] = itemToEquip;
        } else {
            // Un-equip only
            hero.equipment[slotId] = null;
        }

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            updatedHero: hero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
