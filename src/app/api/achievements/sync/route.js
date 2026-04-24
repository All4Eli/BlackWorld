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
        const gold = composite.stats.gold || 0;
        const heroData = composite.stats.hero_data || {};
        const kills = heroData.stats?.kills || 0;
        const deaths = heroData.stats?.deaths || 0;
        const pvpWins = heroData.stats?.pvp_wins || 0;
        const pvpLosses = heroData.stats?.pvp_losses || 0;
        const bossKills = heroData.stats?.boss_kills || 0;
        const questsCompleted = heroData.stats?.quests_completed || 0;
        const itemsCrafted = heroData.stats?.items_crafted || 0;
        const dungeonClears = heroData.stats?.dungeon_clears || 0;
        const zonesExplored = heroData.stats?.zones_explored || 0;
        const bloodStones = composite.stats.blood_stones || 0;
        const covenId = composite.coven?.id;

        const check = (id, cond, pts) => {
          if (cond && !unlockedIds.includes(id)) unlocks.push({ id, pts });
        };

        // === Level Milestones ===
        check('lvl_5', level >= 5, 10);
        check('lvl_10', level >= 10, 20);
        check('lvl_15', level >= 15, 30);
        check('lvl_25', level >= 25, 50);
        check('lvl_35', level >= 35, 75);
        check('lvl_50', level >= 50, 100);

        // === Combat ===
        check('kills_10', kills >= 10, 10);
        check('kills_50', kills >= 50, 25);
        check('kills_100', kills >= 100, 50);
        check('kills_500', kills >= 500, 100);
        check('kills_1000', kills >= 1000, 200);
        check('first_death', deaths >= 1, 5);
        check('boss_slayer', bossKills >= 1, 15);
        check('boss_hunter', bossKills >= 10, 50);
        check('boss_legend', bossKills >= 50, 100);

        // === Economy ===
        check('gold_1k', bankBalance >= 1000, 10);
        check('gold_10k', bankBalance >= 10000, 50);
        check('gold_50k', bankBalance >= 50000, 75);
        check('gold_100k', bankBalance >= 100000, 100);
        check('carried_gold_10k', gold >= 10000, 25);
        check('blood_stones_100', bloodStones >= 100, 30);

        // === Exploration ===
        check('explorer_3', zonesExplored >= 3, 15);
        check('explorer_6', zonesExplored >= 6, 30);
        check('explorer_8', zonesExplored >= 8, 50);

        // === PvP ===
        check('pvp_first_win', pvpWins >= 1, 10);
        check('pvp_10_wins', pvpWins >= 10, 25);
        check('pvp_50_wins', pvpWins >= 50, 75);
        check('pvp_100_wins', pvpWins >= 100, 150);
        check('pvp_survivor', pvpWins > pvpLosses && (pvpWins + pvpLosses) >= 20, 50);

        // === Social ===
        check('joined_coven', !!covenId, 15);

        // === Quests ===
        check('quests_5', questsCompleted >= 5, 15);
        check('quests_20', questsCompleted >= 20, 50);

        // === Crafting ===
        check('crafter_1', itemsCrafted >= 1, 10);
        check('crafter_10', itemsCrafted >= 10, 30);

        // === Dungeons ===
        check('dungeon_1', dungeonClears >= 1, 15);
        check('dungeon_10', dungeonClears >= 10, 50);

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

