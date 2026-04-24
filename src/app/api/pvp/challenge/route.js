import { HeroStats, Composite, PvP } from '@/lib/dal';
import { auth } from '@/lib/auth';
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
        const { data: attacker, error: aError } = await Composite.getFullPlayer(userId);
        if (aError || !attacker || !attacker.stats) throw new Error('Attacker not found.');
        if (attacker.clerk_user_id === targetPlayerId) throw new Error('You cannot duel yourself.');

        let attackerData = attacker.stats.hero_data || {};
        if (attacker.stats.hp <= 0) return NextResponse.json({ error: 'You are dead.' }, { status: 400 });

        if (attacker.stats.essence < 10) {
            return NextResponse.json({ error: 'Not enough Essence (requires 10).' }, { status: 400 });
        }

        // Fetch defender
        const { data: defender, error: dError } = await Composite.getFullPlayer(targetPlayerId);
        if (dError || !defender || !defender.stats) throw new Error('Defender not found.');

        let defenderData = defender.stats.hero_data || {};
        
        const aStats = calcPlayerStats(attackerData);
        const dStats = calcPlayerStats(defenderData);
        
        let aHp = attacker.stats.hp;
        let dHp = defender.stats.hp || dStats.maxHp;

        // Auto-resolve loop
        let win = false;
        let maxRounds = 50;
        let combatLogs = [];
        let roundsDone = 0;

        for (let i = 0; i < maxRounds; i++) {
            roundsDone++;
            // Attacker phase
            if (!isHitDodged(dStats.dodgeChance)) {
                const dmg = rollDamage(aStats.baseDamageMin, aStats.baseDamageMax);
                dHp -= Math.max(1, dmg - dStats.damageReduction);
                combatLogs.push(`You strike ${defender.username} for ${dmg}.`);
            } else {
                combatLogs.push(`${defender.username} dodged your strike!`);
            }
            if (dHp <= 0) { win = true; break; }

            // Defender phase
            if (!isHitDodged(aStats.dodgeChance)) {
                const dmg = rollDamage(dStats.baseDamageMin, dStats.baseDamageMax);
                aHp -= Math.max(1, dmg - aStats.damageReduction);
                combatLogs.push(`${defender.username} strikes you for ${dmg}.`);
            } else {
                combatLogs.push(`You dodged ${defender.username}'s strike!`);
            }
            if (aHp <= 0) { win = false; break; }
        }

        // Fetch Elo
        const { data: aPvpStats } = await PvP.getStats(userId);
        const { data: dPvpStats } = await PvP.getStats(targetPlayerId);
        const aElo = aPvpStats?.elo_rating || 1000;
        const dElo = dPvpStats?.elo_rating || 1000;

        // Apply results to attacker only (offline defender doesn't lose HP in this phase)
        let goldGained = 0;
        let expGained = 0;
        let eloChange = 0;

        const updates = { essence: attacker.stats.essence - 10 };

        if (win) {
            goldGained = Math.floor(Math.random() * 50) + 10;
            expGained = 50;
            eloChange = 15;
            updates.gold = (attacker.stats.gold || 0) + goldGained;
            updates.xp = (attacker.stats.xp || 0) + expGained;
            updates.kills = (attacker.stats.kills || 0) + 1;
            incrementQuestProgress(attackerData, 'SLAY_MONSTERS', 1); // Counts as a kill
            updates.hero_data = attackerData;
            updates.hp = Math.max(1, aHp);
        } else {
            updates.hp = 0;
            eloChange = -15;
        }

        await HeroStats.update(userId, updates);
        
        await PvP.updateElo(userId, Math.max(0, aElo + eloChange), win);
        await PvP.recordMatch(
            userId, 
            targetPlayerId, 
            win ? userId : targetPlayerId, 
            aElo, 
            dElo, 
            eloChange, 
            roundsDone
        );

        // Rebuild frontend payload
        const updatedHero = {
            ...attackerData,
            str: attacker.stats.str,
            def: attacker.stats.def,
            dex: attacker.stats.dex,
            int: attacker.stats.int,
            vit: attacker.stats.vit,
            unspentStatPoints: attacker.stats.unspent_points,
            level: attacker.stats.level,
            xp: updates.xp ?? attacker.stats.xp,
            gold: updates.gold ?? attacker.stats.gold,
            hp: updates.hp,
            max_hp: attacker.stats.max_hp
        };

        return NextResponse.json({
            success: true,
            win,
            goldGained,
            expGained,
            combatLogs,
            updatedHero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

