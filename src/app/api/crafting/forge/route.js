import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { recipeId, goldCost, successChance, itemName } = await request.json();

        // 1. Fetch Player
        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        const gold = hero.gold || 0;

        // Verify cost (materials / gold / essence mock)
        if (gold < goldCost) {
            return NextResponse.json({ error: 'Not enough gold.' }, { status: 400 });
        }

        // Simulating checking for catalysts in hero.artifacts
        // Module explicitly states "explicitly filters the burned materials out of the json array"
        // Since we didn't send precise catalyst indices on the request, we will assume we find oldest scrap/material
        let materialsFound = 0;
        let newArtifacts = [];
        if (hero.artifacts) {
             for (let i = 0; i < hero.artifacts.length; i++) {
                 if (hero.artifacts[i].type === 'item' && materialsFound < 1) { // Consume 1 raw material per craft
                     materialsFound++;
                     continue; // Filter it out
                 }
                 newArtifacts.push(hero.artifacts[i]);
             }
        }
        
        // Even if materials weren't perfectly aligned, deduct gold
        hero.gold = gold - goldCost;
        hero.artifacts = newArtifacts;

        // Forge RNG Logic
        const roll = Math.random();
        const success = roll <= successChance;

        if (success) {
            // Success: Add new item
            hero.artifacts.push({
               id: 'crafted_' + Date.now(),
               name: itemName || 'Forged Item',
               type: 'equipment',
               rarity: 'Rare',
               attack_bonus: 5,
               acquired_at: new Date().toISOString()
            });
        }

        // Apply back to row
        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            forgeSuccess: success,
            updatedHero: hero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
