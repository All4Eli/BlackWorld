import { supabase } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { artifactId } = await request.json();

        if (!artifactId) {
            return NextResponse.json({ error: 'Artifact ID is required.' }, { status: 400 });
        }

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        // Find the artifact in the user's inventory
        const artifacts = hero.artifacts || [];
        const artifactToEquip = artifacts.find(a => a.id === artifactId);

        if (!artifactToEquip) {
            return NextResponse.json({ error: 'Artifact not found in inventory.' }, { status: 404 });
        }

        // Determine slot
        let slot = null;
        if (artifactToEquip.type === 'WEAPON') slot = 'mainHand';
        else if (artifactToEquip.type === 'ARMOR') slot = 'body';
        else if (artifactToEquip.type === 'MAIN_HAND') slot = 'mainHand';
        else if (artifactToEquip.type === 'OFF_HAND') slot = 'offHand';
        else if (artifactToEquip.type === 'BODY') slot = 'body';
        else if (artifactToEquip.type === 'HEAD') slot = 'head';
        else if (artifactToEquip.type === 'BOOTS') slot = 'boots';
        else if (artifactToEquip.type === 'AMULET') slot = 'amulet';
        else if (artifactToEquip.type === 'RING') {
            if (!hero.equipped?.ring1) slot = 'ring1';
            else if (!hero.equipped?.ring2) slot = 'ring2';
            else slot = 'ring1'; // default overwrite ring 1
        }

        if (!slot) {
            return NextResponse.json({ error: 'Invalid artifact type for equipping.' }, { status: 400 });
        }

        if (!hero.equipped) hero.equipped = {};
        
        // Execute the equip
        hero.equipped[slot] = artifactToEquip;

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
