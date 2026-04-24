import { sql, sqlOne, pool } from '@/lib/db/pool';
import * as CombatDal from './combat';
import * as HeroDal from './hero';

/**
 * Fetch all available dungeons for the player, including their cooldown status.
 *
 * @param {string} userId - The player's ID
 * @param {number} playerLevel - The player's current level
 * @returns {Promise<{ data?: Array<Object>, error?: Error }>}
 */
export async function getAvailableDungeons(userId, playerLevel) {
    try {
        const { data, error } = await sql(`
            SELECT 
                d.id, d.name, d.description, d.zone_id, 
                d.icon, d.difficulty, d.min_level, d.floor_count,
                d.cooldown_hours, d.rewards,
                (
                    SELECT dr.completed_at 
                    FROM dungeon_runs dr 
                    WHERE dr.player_id = $1 AND dr.dungeon_id = d.id 
                    ORDER BY dr.started_at DESC LIMIT 1
                ) as last_completed_at
            FROM dungeons d
            WHERE d.is_active = true
            ORDER BY d.min_level ASC
        `, [userId]);

        if (error) throw error;

        // Annotate with isLocked based on level and cooldown
        const now = new Date();
        const dungeons = (data || []).map(d => {
            let onCooldown = false;
            let cooldownEndsAt = null;

            if (d.last_completed_at && d.cooldown_hours) {
                const completedDate = new Date(d.last_completed_at);
                cooldownEndsAt = new Date(completedDate.getTime() + (d.cooldown_hours * 60 * 60 * 1000));
                onCooldown = now < cooldownEndsAt;
            }

            return {
                ...d,
                levelLocked: playerLevel < d.min_level,
                onCooldown,
                cooldownEndsAt,
                isAvailable: playerLevel >= d.min_level && !onCooldown
            };
        });

        return { data: dungeons };
    } catch (err) {
        return { error: err };
    }
}

/**
 * Starts a new dungeon run, enforcing the cooldown.
 *
 * @param {string} userId - The player's ID
 * @param {string} dungeonId - The ID of the dungeon to start
 * @returns {Promise<{ data?: Object, error?: Error }>}
 */
export async function startDungeonRun(userId, dungeonId) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Fetch dungeon details
        const { rows: dungeonRows } = await client.query(
            `SELECT * FROM dungeons WHERE id = $1 AND is_active = true FOR SHARE`, 
            [dungeonId]
        );
        if (dungeonRows.length === 0) throw new Error('Dungeon not found or inactive.');
        const dungeon = dungeonRows[0];

        // 2. Fetch Player Level
        const { rows: heroRows } = await client.query(
            `SELECT level FROM hero_stats WHERE player_id = $1`, 
            [userId]
        );
        if (heroRows.length === 0) throw new Error('Player not found.');
        if (heroRows[0].level < dungeon.min_level) throw new Error('Level requirement not met.');

        // 3. Prevent multiple active runs
        const { rows: activeRuns } = await client.query(
            `SELECT id FROM dungeon_runs WHERE player_id = $1 AND result = 'in_progress' FOR UPDATE`,
            [userId]
        );
        if (activeRuns.length > 0) throw new Error('You already have an active dungeon run.');

        // 4. Enforce Cooldown Using the Index
        const { rows: lastRunRows } = await client.query(
            `SELECT completed_at FROM dungeon_runs 
             WHERE player_id = $1 AND dungeon_id = $2 AND result IN ('completed', 'failed', 'abandoned')
             ORDER BY started_at DESC LIMIT 1`,
            [userId, dungeonId]
        );

        if (lastRunRows.length > 0 && lastRunRows[0].completed_at) {
            const lastCompleted = new Date(lastRunRows[0].completed_at);
            const cooldownEndsAt = new Date(lastCompleted.getTime() + (dungeon.cooldown_hours * 60 * 60 * 1000));
            if (new Date() < cooldownEndsAt) {
                throw new Error(`Dungeon is on cooldown until ${cooldownEndsAt.toISOString()}`);
            }
        }

        // 5. Create active run
        const { rows: runRows } = await client.query(
            `INSERT INTO dungeon_runs (player_id, dungeon_id, floor_reached, result) 
             VALUES ($1, $2, 0, 'in_progress') 
             RETURNING *`,
            [userId, dungeonId]
        );

        await client.query('COMMIT');
        return { data: runRows[0] };
    } catch (err) {
        await client.query('ROLLBACK');
        return { error: err };
    } finally {
        client.release();
    }
}

/**
 * Advances the dungeon floor and spans the appropriate encounter.
 * If the current floor exceeds the dungeon's floor_count, it completes the run and grants rewards.
 * 
 * @param {string} userId - The player's ID
 * @param {boolean} floorCleared - Was the previous floor successfully cleared? (True unless fleeing)
 * @returns {Promise<{ data?: Object, error?: Error }>}
 */
export async function advanceDungeonFloor(userId, floorCleared = true) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Lock the active run
        const { rows: runRows } = await client.query(
            `SELECT * FROM dungeon_runs WHERE player_id = $1 AND result = 'in_progress' FOR UPDATE`,
            [userId]
        );

        if (runRows.length === 0) {
            throw new Error('No active dungeon run found.');
        }

        const run = runRows[0];

        // 2. Lock and fetch dungeon info
        const { rows: dungeonRows } = await client.query(
            `SELECT * FROM dungeons WHERE id = $1`,
            [run.dungeon_id]
        );
        const dungeon = dungeonRows[0];

        // Ensure we aren't bypassing an active combat session
        const { rows: combatCheck } = await client.query(
            `SELECT * FROM combat_sessions WHERE player_id = $1 FOR SHARE`,
            [userId]
        );
        
        if (combatCheck.length > 0) {
            throw new Error("Cannot advance floor while in active combat.");
        }

        if (!floorCleared) {
            // Player fled or died on the previous floor
            await client.query(
                `UPDATE dungeon_runs SET result = 'failed', completed_at = now() WHERE id = $1`,
                [run.id]
            );
            await client.query('COMMIT');
            return { data: { status: 'DEFEAT', message: 'Dungeon run failed.' } };
        }

        const nextFloor = run.floor_reached + 1;

        if (nextFloor > dungeon.floor_count) {
            // DUNGEON CLEARED! Distribute Rewards
            const rewards = dungeon.rewards || {};
            const goldEarned = rewards.gold || 1000;
            const xpEarned = rewards.xp || 500;
            
            // Give Gold and XP using raw update
            await client.query(
                `UPDATE hero_stats SET gold = gold + $1, xp = xp + $2 WHERE player_id = $3`,
                [goldEarned, xpEarned, userId]
            );

            // Finish the run
            await client.query(
                `UPDATE dungeon_runs 
                 SET result = 'completed', completed_at = now(),
                     gold_earned = $1, xp_earned = $2 
                 WHERE id = $3`,
                [goldEarned, xpEarned, run.id]
            );

            await client.query('COMMIT');
            return { 
                data: { 
                    status: 'VICTORY', 
                    message: `Dungeon cleared! Gained ${goldEarned} gold and ${xpEarned} XP.`,
                    rewards: { gold: goldEarned, xp: xpEarned }
                } 
            };
        }

        // STILL IN THE DUNGEON — spawn the next encounter
        await client.query(
            `UPDATE dungeon_runs SET floor_reached = $1 WHERE id = $2`,
            [nextFloor, run.id]
        );

        let encounterType = 'REGULAR';
        let monsterIdSpawn = null;
        
        if (nextFloor === dungeon.floor_count && dungeon.boss_id) {
            encounterType = 'BOSS';
            monsterIdSpawn = dungeon.boss_id;
        } else {
            // Fetch a random regular monster for this dungeon's zone
            const { rows: randomMonsters } = await client.query(
                `SELECT id FROM monsters WHERE zone_id = $1 AND tier != 'BOSS' ORDER BY RANDOM() LIMIT 1`,
                [dungeon.zone_id]
            );
            if (randomMonsters.length > 0) {
                monsterIdSpawn = randomMonsters[0].id;
            }
        }

        let combatSessionPayload = null;

        if (monsterIdSpawn) {
            // Manually inject a combat_session lock for this encounter
            const { rows: heroInfo } = await client.query(`SELECT hp, max_hp FROM hero_stats WHERE player_id = $1`, [userId]);
            const { rows: monsterInfo } = await client.query(`SELECT hp FROM monsters WHERE id = $1`, [monsterIdSpawn]);
            
            const pHP = heroInfo[0].hp > 0 ? heroInfo[0].hp : heroInfo[0].max_hp; // Failsafe
            const mHP = monsterInfo[0]?.hp || 50;

            const { rows: combatCreated } = await client.query(
                `INSERT INTO combat_sessions (player_id, monster_id, zone_id, player_hp, monster_hp)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [userId, monsterIdSpawn, dungeon.zone_id, pHP, mHP]
            );
            combatSessionPayload = combatCreated[0];
        }

        await client.query('COMMIT');
        
        return { 
            data: { 
                status: 'IN_PROGRESS', 
                floor: nextFloor, 
                totalFloors: dungeon.floor_count,
                encounterType,
                combatSession: combatSessionPayload
            } 
        };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[DAL/Dungeons]', err);
        return { error: err };
    } finally {
        client.release();
    }
}
