import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { enemyId } = await request.json();

        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (playerError || !player) throw new Error('Player not found.');

        let hero = player.hero_data || {};
        
        if (!hero.flasks || hero.flasks <= 0) {
            return NextResponse.json({ error: 'No Crimson Flasks remaining!' }, { status: 400 });
        }

        const pStats = calcPlayerStats(hero);
        hero.flasks -= 1;
        
        // Base Flask heal
        const newPlayerHp = Math.min(pStats.maxHp, (hero.hp || pStats.maxHp) + 60);
        let finalHp = newPlayerHp;
        
        let narrative = `[HEAL]: You consume a flask. +60 HP.`;

        // If in combat, enemy attacks
        if (enemyId) {
             let fetchedEnemy = { id: enemyId, name: "Void Stalker", tier: "Uncommon", base_hp: 80, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };
             if (enemyId !== 'void_stalker') {
                  const { data: bossData } = await supabase.from('boss_monsters').select('*').eq('id', enemyId).single();
                  if (bossData) fetchedEnemy = bossData;
             }
             
             const eStats = calcMonsterStats(fetchedEnemy);
             
             if (isHitDodged(pStats.dodgeChance)) {
                 narrative += ` [EVADE]: You dodged ${fetchedEnemy.name}'s counter-attack!`;
             } else {
                 const mDamage = rollDamage(eStats.damageMin, eStats.damageMax);
                 finalHp = Math.max(0, newPlayerHp - mDamage);
                 narrative += ` [WOUNDED]: ${fetchedEnemy.name} hits you while drinking for ${mDamage}!`;
             }
        }
        
        hero.hp = finalHp;

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            updatedHero: hero,
            narrative,
            died: finalHp <= 0
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
