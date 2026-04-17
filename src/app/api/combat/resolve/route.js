import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId } = await request.json();

        // 1. Fetch player strictly from DB
        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        // Ensure player isn't already dead
        if (hero.hp <= 0) {
            return NextResponse.json({ error: 'You are dead.' }, { status: 400 });
        }

        const pStats = calcPlayerStats(hero);

        // Fetch Enemy Stats (Mocked or queried from DB). 
        // Real implementation queries 'boss_monsters' or uses a fallback
        let fetchedEnemy = { id: enemyId, name: "Void Stalker", tier: "Uncommon", base_hp: 80, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };
        
        if (enemyId && enemyId !== 'void_stalker') {
             const { data: bossData } = await supabase.from('boss_monsters').select('*').eq('id', enemyId).single();
             if (bossData) fetchedEnemy = bossData;
        }

        const eStats = calcMonsterStats(fetchedEnemy);
        let eHp = eStats.hp;
        let pHp = hero.hp || pStats.maxHp;

        // Auto-resolve loop (Quick resolution for Module 2 requirement)
        let win = false;
        let maxRounds = 50;

        for (let i = 0; i < maxRounds; i++) {
            // Player attacks
            if (!isHitDodged(fetchedEnemy.dodge_chance)) {
                eHp -= rollDamage(pStats.baseDamageMin, pStats.baseDamageMax);
            }
            if (eHp <= 0) {
                win = true;
                break;
            }

            // Enemy attacks
            if (!isHitDodged(pStats.dodgeChance)) {
                pHp -= rollDamage(fetchedEnemy.base_damage_min, fetchedEnemy.base_damage_max);
            }
            if (pHp <= 0) {
                win = false;
                break;
            }
        }

        // Apply results
        let expGained = 0;
        let goldGained = 0;

        if (win) {
            expGained = fetchedEnemy.tier === 'Boss' ? 50 : 15;
            goldGained = Math.floor(Math.random() * 20) + 10;
            hero.exp = (hero.exp || 0) + expGained;
            hero.gold = (hero.gold || 0) + goldGained;
            hero.hp = pHp;

            // Optional loot chance
            if (Math.random() > 0.8) {
                if (!hero.artifacts) hero.artifacts = [];
                hero.artifacts.push({ type: 'item', name: 'Demon Fang', acquired_at: new Date().toISOString() });
            }
        } else {
            hero.hp = 0; // Death penalty
        }

        // Save
        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            win,
            expGained,
            goldGained,
            updatedHero: hero
        });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
