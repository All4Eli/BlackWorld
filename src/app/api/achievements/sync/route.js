import { Composite, sql } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Fetch player stats
        const { data: composite, error: playerError } = await Composite.getFullPlayer(userId);
        if (playerError || !composite || !composite.stats) throw new Error('Player not found.');

        // Ensure player achievements exist
        const { data: existingRows, error: err2 } = await sql(`
           SELECT achievement_id FROM player_achievements WHERE clerk_user_id = $1
        `, [userId]);
        
        if (err2) throw err2;

        const unlockedIds = existingRows.map(e => e.achievement_id);
        const unlocks = [];
        let newPoints = 0;

        const level = composite.stats.level || 1;
        const bankBalance = composite.stats.bank_balance || 0;
        const kills = composite.stats.hero_data?.stats?.kills || 0;

        // Level achievements
        if (level >= 5 && !unlockedIds.includes('lvl_5')) unlocks.push({ id: 'lvl_5', pts: 10 });
        if (level >= 10 && !unlockedIds.includes('lvl_10')) unlocks.push({ id: 'lvl_10', pts: 20 });
        if (level >= 25 && !unlockedIds.includes('lvl_25')) unlocks.push({ id: 'lvl_25', pts: 50 });

        // Wealth achievements
        if (bankBalance >= 1000 && !unlockedIds.includes('gold_1k')) unlocks.push({ id: 'gold_1k', pts: 10 });
        if (bankBalance >= 10000 && !unlockedIds.includes('gold_10k')) unlocks.push({ id: 'gold_10k', pts: 50 });

        // Combat achievements
        if (kills >= 10 && !unlockedIds.includes('kills_10')) unlocks.push({ id: 'kills_10', pts: 10 });
        if (kills >= 100 && !unlockedIds.includes('kills_100')) unlocks.push({ id: 'kills_100', pts: 50 });

        if (unlocks.length > 0) {
            newPoints = unlocks.reduce((sum, u) => sum + u.pts, 0);

            for (const u of unlocks) {
                await sql(`
                    INSERT INTO player_achievements (clerk_user_id, achievement_id, unlocked_at) 
                    VALUES ($1, $2, NOW()) 
                    ON CONFLICT DO NOTHING
                `, [userId, u.id]);
            }

            // Fetch current, then Update player overall points
            const { data: currRecord } = await sql(`
                UPDATE players SET achievement_points = achievement_points + $1 
                WHERE clerk_user_id = $2 
                RETURNING achievement_points
            `, [newPoints, userId]);

            const finalPoints = currRecord[0]?.achievement_points || 0;

            // Manually inject fresh achievement points into hero_data payload to immediately inform the UI
            const newHeroPayload = {
               ...(composite.stats.hero_data || {}),
               coven_id: composite.coven?.id,
               coven_name: composite.coven?.name,
               coven_tag: composite.coven?.tag,
               coven_role: composite.coven?.role,
               bankedGold: bankBalance,
               gold: composite.stats.gold,
               hp: composite.stats.hp,
               max_hp: composite.stats.max_hp,
               level: level,
               achievement_points: finalPoints
            };

            return NextResponse.json({ success: true, newlyUnlocked: unlocks, updatedHero: newHeroPayload });
        }

        return NextResponse.json({ success: true, newlyUnlocked: [] });

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

