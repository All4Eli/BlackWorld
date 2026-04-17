import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { calcPlayerStats, rollDamage, isHitDodged } from '@/lib/combat';
import { incrementQuestProgress } from '@/lib/quests';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { targetPlayerId } = await request.json();

        if (!targetPlayerId) return NextResponse.json({ error: 'No target specified.' }, { status: 400 });

        // Fetch attacker
        const { data: attackerRecord, error: aError } = await supabase
            .from('players')
            .select('id, hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (aError || !attackerRecord) throw new Error('Attacker not found.');
        if (attackerRecord.id === targetPlayerId) throw new Error('You cannot duel yourself.');

        let attackerHero = attackerRecord.hero_data || {};
        if (attackerHero.hp <= 0) return NextResponse.json({ error: 'You are dead.' }, { status: 400 });

        // Fetch defender
        const { data: defenderRecord, error: dError } = await supabase
            .from('players')
            .select('id, username, hero_data')
            .eq('id', targetPlayerId)
            .single();

        if (dError || !defenderRecord) throw new Error('Defender not found.');

        let defenderHero = defenderRecord.hero_data || {};
        
        const aStats = calcPlayerStats(attackerHero);
        const dStats = calcPlayerStats(defenderHero);
        
        let aHp = attackerHero.hp;
        let dHp = defenderHero.hp || dStats.maxHp;

        // Auto-resolve loop
        let win = false;
        let maxRounds = 50;
        let combatLogs = [];

        for (let i = 0; i < maxRounds; i++) {
            // Attacker phase
            if (!isHitDodged(dStats.dodgeChance)) {
                const dmg = rollDamage(aStats.baseDamageMin, aStats.baseDamageMax);
                dHp -= Math.max(1, dmg - dStats.damageReduction);
                combatLogs.push(`You strike ${defenderRecord.username} for ${dmg}.`);
            } else {
                combatLogs.push(`${defenderRecord.username} dodged your strike!`);
            }
            if (dHp <= 0) { win = true; break; }

            // Defender phase
            if (!isHitDodged(aStats.dodgeChance)) {
                const dmg = rollDamage(dStats.baseDamageMin, dStats.baseDamageMax);
                aHp -= Math.max(1, dmg - aStats.damageReduction);
                combatLogs.push(`${defenderRecord.username} strikes you for ${dmg}.`);
            } else {
                combatLogs.push(`You dodged ${defenderRecord.username}'s strike!`);
            }
            if (aHp <= 0) { win = false; break; }
        }

        // Apply results to attacker only (since offline defender doesn't lose HP strictly in this module design)
        let goldGained = 0;
        let expGained = 0;
        let eloChange = 0;

        if (win) {
            goldGained = Math.floor(Math.random() * 50) + 10;
            expGained = 50;
            eloChange = 15;
            attackerHero.gold = (attackerHero.gold || 0) + goldGained;
            attackerHero.xp = (attackerHero.xp || 0) + expGained;
            attackerHero.kills = (attackerHero.kills || 0) + 1;
            incrementQuestProgress(attackerHero, 'SLAY_MONSTERS', 1); // Counts as a kill
        } else {
            attackerHero.hp = 0;
            eloChange = -15;
            // penalty handled by deathscreen UI
        }

        // Mutate attacker JSONB
        await supabase
            .from('players')
            .update({ hero_data: attackerHero })
            .eq('id', attackerRecord.id);

        // Mutate attacker PVP stats
        const { data: currentStats } = await supabase.from('pvp_stats').select('*').eq('player_id', attackerRecord.id).single();
        if (currentStats) {
           await supabase.from('pvp_stats').update({
               elo_rating: Math.max(0, currentStats.elo_rating + eloChange),
               arena_wins: win ? currentStats.arena_wins + 1 : currentStats.arena_wins,
               arena_losses: !win ? currentStats.arena_losses + 1 : currentStats.arena_losses,
               total_gold_won: win ? currentStats.total_gold_won + goldGained : currentStats.total_gold_won
           }).eq('player_id', attackerRecord.id);
        }

        return NextResponse.json({
            success: true,
            win,
            goldGained,
            expGained,
            combatLogs,
            updatedHero: attackerHero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
