import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { incrementQuestProgress } from '@/lib/quests';
import { generateLoot } from '@/lib/gameData';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { zoneId } = await request.json();

        // 1. Fetch player
        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        // Ensure resources object exists
        if (!hero.player_resources) {
            hero.player_resources = {
                essence_current: 50,
                vitae_current: 50,
                resolve_current: 50
            };
        }

        // Validate Zone Cost
        let requiredCost = 1; // Default
        if (zoneId) {
             const { ZONES } = require('@/lib/gameData');
             const matched = ZONES.find(z => z.id === zoneId);
             if (matched && matched.essenceCost) requiredCost = matched.essenceCost;
        }

        const { validateAndConsume } = require('@/lib/resources');
        const check = validateAndConsume(hero, hero.player_resources, requiredCost, 'essence');
        
        if (!check.success) {
            return NextResponse.json({ error: 'Not enough Essence to explore.' }, { status: 400 });
        }

        hero.player_resources.essence_current = check.new_current;
        hero.player_resources.essence_last_update = check.new_last_update;

        const energy = check.new_current;
        
        incrementQuestProgress(hero, 'ESSENCE_SPENT', requiredCost);

        // Calculate encounter logic
        const roll = Math.random();
        let encounterType = 'empty';
        let narrative = 'You wander through the shadows, finding nothing of interest.';
        let loot = null;

        if (roll > 0.7) {
            encounterType = 'enemy';
            narrative = 'A corrupted creature steps out of the gloom!';
        } else if (roll > 0.4) {
            encounterType = 'resource';
            loot = generateLoot(1);
            narrative = `You discovered something hidden: ${loot.name}.`;
            
            // Add to artifacts
            if (!hero.artifacts) hero.artifacts = [];
            hero.artifacts.push({ ...loot, acquired_at: new Date().toISOString() });
        }

        // Save mutated hero
        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            encounter: encounterType,
            narrative,
            loot,
            energyRemaining: Math.max(0, energy - 1),
            updatedHero: hero
        });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
