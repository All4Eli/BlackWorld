import { supabase } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { validateAndConsume } from '@/lib/resources';

const ENHANCEMENT_TABLE = {
  1:  { success: 1.00, break: 0.00, gold: 100,    stones: 1 },
  2:  { success: 1.00, break: 0.00, gold: 200,    stones: 1 },
  3:  { success: 0.95, break: 0.00, gold: 350,    stones: 1 },
  4:  { success: 0.90, break: 0.00, gold: 500,    stones: 2 },
  5:  { success: 0.85, break: 0.00, gold: 750,    stones: 2 },
  6:  { success: 0.75, break: 0.05, gold: 1000,   stones: 3 },
  7:  { success: 0.65, break: 0.10, gold: 1500,   stones: 3 },
  8:  { success: 0.55, break: 0.15, gold: 2000,   stones: 4 },
  9:  { success: 0.45, break: 0.20, gold: 3000,   stones: 4 },
  10: { success: 0.35, break: 0.25, gold: 4500,   stones: 5 },
  11: { success: 0.30, break: 0.30, gold: 6000,   stones: 6 },
  12: { success: 0.25, break: 0.35, gold: 8000,   stones: 7 },
  13: { success: 0.20, break: 0.40, gold: 11000,  stones: 8 },
  14: { success: 0.18, break: 0.45, gold: 15000,  stones: 9 },
  15: { success: 0.15, break: 0.50, gold: 20000,  stones: 10 },
  16: { success: 0.12, break: 0.55, gold: 28000,  stones: 12 },
  17: { success: 0.10, break: 0.60, gold: 38000,  stones: 14 },
  18: { success: 0.08, break: 0.65, gold: 50000,  stones: 16 },
  19: { success: 0.06, break: 0.70, gold: 70000,  stones: 18 },
  20: { success: 0.05, break: 0.75, gold: 100000, stones: 20 }
};

const getScaledValues = (level) => ({
    success: 0.04,
    break: 0.80,
    gold: 100000 * Math.pow(1.1, level - 20),
    stones: 20 + (level - 20) * 2
});

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { artifactId, targetLevel, protectionId } = await request.json();

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        if (!hero.artifacts) hero.artifacts = [];

        const artifactIndex = hero.artifacts.findIndex(a => a.id === artifactId);
        if (artifactIndex === -1) {
             return NextResponse.json({ error: 'Artifact not found in inventory.' }, { status: 400 });
        }
        
        const tableInfo = ENHANCEMENT_TABLE[targetLevel] || getScaledValues(targetLevel);
        
        if ((hero.gold || 0) < tableInfo.gold) {
            return NextResponse.json({ error: 'Not enough gold.' }, { status: 400 });
        }

        const check = validateAndConsume(hero, hero?.player_resources, 50, 'essence');
        if (!check.success) {
            return NextResponse.json({ error: `Not enough Essence. Short ${check.deficit}.` }, { status: 400 });
        }

        // Deduct Price
        hero.gold -= tableInfo.gold;
        if (!hero.player_resources) hero.player_resources = {};
        hero.player_resources.essence_current = check.new_current;
        hero.player_resources.essence_last_update = check.new_last_update;

        // SERVER AUTHORITATIVE STATISTICAL ROLLS
        let outcome = 'FAIL';
        let levelsLost = 0;
        const roll = Math.random();

        // Pity isn't technically tracked locally anymore for security, but we will roll bare success
        if (roll <= tableInfo.success) {
             outcome = 'SUCCESS';
             hero.artifacts[artifactIndex].level = targetLevel;
        } else {
             let breakChance = tableInfo.break;
             // Basic mock protection checks based on pass down ID
             if (protectionId === 'prot-1') breakChance = Math.max(0, breakChance - 0.1);
             else if (protectionId === 'prot-2') breakChance = 0; // 'full' protection
             
             const breakRoll = Math.random();
             if (breakRoll <= breakChance) {
                  if (protectionId === 'prot-3') { // downgrade
                      levelsLost = Math.ceil(Math.random() * 3);
                      hero.artifacts[artifactIndex].level = Math.max(0, hero.artifacts[artifactIndex].level - levelsLost);
                      outcome = 'DOWNGRADE';
                  } else if (protectionId === 'prot-2') {
                      outcome = 'PROTECTED';
                  } else {
                      hero.artifacts.splice(artifactIndex, 1);
                      outcome = 'DESTROYED';
                  }
             }
        }

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            outcome,
            levelsLost,
            updatedHero: hero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
