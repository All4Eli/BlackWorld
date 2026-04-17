import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { incrementQuestProgress } from '@/lib/quests';

const getRandomLoot = () => {
    const roll = Math.random();
    if (roll > 0.8) return { type: 'item', name: 'Ancient Core', description: 'Power source from an old age.' };
    if (roll > 0.5) return { type: 'item', name: 'Demon Fang', description: 'Sharp and corrupted.' };
    return { type: 'item', name: 'Rusty Scrap', description: 'Might be useful for crafting.' };
};

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

        // Use essence or 'energy' as requested. The UI expects essence. We will subtract 1 manually.
        let energy = hero.player_resources.essence_current ?? hero.essence ?? 0;
        
        if (energy < 1) {
            return NextResponse.json({ error: 'Not enough energy/essence.' }, { status: 400 });
        }

        // Deduct 1 energy
        if (hero.player_resources.essence_current !== undefined) {
            hero.player_resources.essence_current -= 1;
        } else {
            hero.essence = energy - 1;
        }
        
        incrementQuestProgress(hero, 'ESSENCE_SPENT', 1);

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
            loot = getRandomLoot();
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
