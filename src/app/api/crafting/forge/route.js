import { supabase } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { recipeId } = await request.json();

        if (!recipeId) {
            return NextResponse.json({ error: 'Missing recipe ID.' }, { status: 400 });
        }

        // 1. Look up recipe from DB — NEVER trust client-sent cost/chance
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('*')
            .eq('id', recipeId)
            .single();

        if (recipeError || !recipe) {
            return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 });
        }

        const goldCost = recipe.gold_cost;
        const successChance = recipe.success_chance;
        const itemName = recipe.name;

        // 2. Fetch Player
        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        const gold = hero.gold || 0;

        // 3. Verify gold
        if (gold < goldCost) {
            return NextResponse.json({ error: 'Not enough gold.' }, { status: 400 });
        }

        // 4. Consume one raw material from artifacts
        let materialsFound = 0;
        let newArtifacts = [];
        if (hero.artifacts) {
             for (let i = 0; i < hero.artifacts.length; i++) {
                 if (hero.artifacts[i].type === 'item' && materialsFound < 1) {
                     materialsFound++;
                     continue; // Filter it out
                 }
                 newArtifacts.push(hero.artifacts[i]);
             }
        }
        
        hero.gold = gold - goldCost;
        hero.artifacts = newArtifacts;

        // 5. Forge RNG — using server-authoritative success chance
        const roll = Math.random();
        const success = roll <= successChance;

        if (success) {
            hero.artifacts.push({
               id: 'crafted_' + Date.now(),
               name: itemName || 'Forged Item',
               type: 'equipment',
               rarity: recipe.rarity || 'Rare',
               attack_bonus: recipe.attack_bonus || 5,
               acquired_at: new Date().toISOString()
            });
        }

        // 6. Save
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
