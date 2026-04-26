import { sql, sqlOne, pool } from '@/lib/db/pool';
import { compileHeroStats, resolveCombatTurn } from '@/lib/game/combat-engine';
import * as HeroDal from './hero';
import * as InventoryDal from './inventory';

/**
 * Ensures the player has an active combat row. If not, spawns a monster.
 */
export async function getOrStartCombat(userId, zoneId) {
    // Check for existing session
    const { data: existing } = await sqlOne(
        `SELECT * FROM combat_sessions WHERE player_id = $1`,
        [userId]
    );

    if (existing) {
        // Fetch static monster data
        const { data: monster } = await sqlOne(`SELECT * FROM monsters WHERE id = $1`, [existing.monster_id]);
        return { session: existing, monster };
    }

    // Spawn new encounter (simplified: random monster from zone)
    // Production would query monsters table grouped by zone
    // For now we'll pick a random generic monster matching the zone level
    const { data: monster } = await sqlOne(
        `SELECT * FROM monsters WHERE zone = $1 ORDER BY RANDOM() LIMIT 1`,
        [zoneId]
    );

    if (!monster) {
        throw new Error('No monsters found in this zone.');
    }

    // Fetch player to get max HP for the new session
    const { data: hero } = await HeroDal.getHeroStats(userId);
    const { data: equipment } = await InventoryDal.getEquipment(userId);
    // Compute skill bonuses so initial max HP accounts for iron_flesh etc.
    const { calculateSkillBonuses } = await import('@/lib/skillTree');
    const skillBonuses = calculateSkillBonuses(hero?.skill_points || {});
    const compiled = compileHeroStats(hero, equipment || [], skillBonuses);

    const { data: newSession } = await sqlOne(
        `INSERT INTO combat_sessions (player_id, monster_id, zone_id, player_hp, monster_hp)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, monster.id, zoneId, compiled.maxHp, (monster.stats || {}).hp || 50]
    );

    return { session: newSession, monster };
}

/**
 * Resolves a single turn of combat using the combat engine.
 */
export async function processTurn(userId, action) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lock the combat session to prevent double-clicking
        const { rows: sessionRows } = await client.query(
            `SELECT * FROM combat_sessions WHERE player_id = $1 FOR UPDATE`,
            [userId]
        );

        if (sessionRows.length === 0) {
            throw new Error('No active combat session found.');
        }

        const combatSession = sessionRows[0];

        // Fetch Player Stats & Equipment under transaction
        const { rows: heroRows } = await client.query(`SELECT * FROM hero_stats WHERE player_id = $1`, [userId]);
        const heroStats = heroRows[0];

        const { rows: eqRows } = await client.query(
            `SELECT e.slot, i.base_stats, inv.rolled_stats
             FROM equipment e
             JOIN inventory inv ON e.inventory_id = inv.id
             JOIN items i ON inv.item_id = i.id
             WHERE e.player_id = $1`,
            [userId]
        );

        // ── Wire skill tree data from the DB into combat stats ────
        //
        // heroStats.skill_points is a JSONB column that looks like:
        //   { "iron_flesh": 5, "berserker": 3, "serrated_blades": 1, ... }
        //
        // calculateSkillBonuses() iterates the SKILL_TREE definition,
        // checks each skill's rank in this object, and sums the effects.
        // It returns: { maxHp, baseDmg, critChance, lifesteal, ... }
        //
        // We import it at the top of this file.
        const { calculateSkillBonuses } = await import('@/lib/skillTree');
        const skillPoints = heroStats.skill_points || {};
        const skillBonuses = calculateSkillBonuses(skillPoints);

        // Re-compile with skill bonuses included (3rd argument)
        const compiledHero = compileHeroStats(heroStats, eqRows, skillBonuses);

        // Overlay skill-tree-driven boolean flags for the combat engine.
        // These are checked by resolveCombatTurn() for special mechanics.
        //
        // !! (double NOT) converts a truthy number (e.g., 1) into a
        // real boolean (true). Without it, the value is the rank integer.
        compiledHero.hasSerratedBlades = !!(skillPoints.serrated_blades);
        compiledHero.hasBloodAegis     = !!(skillPoints.blood_aegis);
        compiledHero.hasUndying        = !!(skillPoints.undying);
        compiledHero.hasThorns         = !!(skillPoints.thorns);
        compiledHero.killHeal          = skillBonuses.killHeal || 0;
        compiledHero.enemyVuln         = skillBonuses.enemyVuln || 0;

        // Fetch static monster data
        const { rows: monsterRows } = await client.query(`SELECT * FROM monsters WHERE id = $1`, [combatSession.monster_id]);
        const monster = monsterRows[0];

        // Extra Action Validation (e.g., Flask amount)
        if (action === 'USE_FLASK') {
            if (heroStats.flasks <= 0) {
                await client.query('ROLLBACK');
                return { error: 'No flasks remaining.' };
            }
            await client.query(`UPDATE hero_stats SET flasks = flasks - 1 WHERE player_id = $1`, [userId]);
        }

        // Run Engine
        const engineResult = resolveCombatTurn(combatSession, compiledHero, monster, action);

        let finalResponse = {
            log: engineResult.log,
            state: engineResult.newSessionState,
            isOver: engineResult.isOver,
            result: engineResult.result,
        };

        if (engineResult.isOver) {
            // End Combat
            await client.query(`DELETE FROM combat_sessions WHERE player_id = $1`, [userId]);

            if (engineResult.result === 'VICTORY') {
                // Calculate loot & XP based on GDD
                const goldGained = monster.rewards?.gold || 15;
                const xpGained = monster.rewards?.xp || 20;

                await client.query(
                    `UPDATE hero_stats SET
                     gold = gold + $1,
                     xp = xp + $2,
                     kills = kills + 1,
                     hp = $3
                     WHERE player_id = $4`,
                    [goldGained, xpGained, engineResult.newSessionState.player_hp, userId]
                );

                // Check level up (100 * 1.4^(level-1)) logic handled in a trigger or daily check, 
                // but we can just do a simple increment if they pass threshold here if needed.
                // For now just update stats.

                finalResponse.rewards = { gold: goldGained, xp: xpGained };

            } else if (engineResult.result === 'DEFEAT') {
                // Death penalty: lose % of gold (e.g. 10%)
                // Player is DEAD (hp = 0) — must use Healer/Revive to restore.
                const goldLost = Math.floor(heroStats.gold * 0.10);
                await client.query(
                    `UPDATE hero_stats SET
                     gold = GREATEST(0, gold - $1),
                     deaths = deaths + 1,
                     hp = 0
                     WHERE player_id = $2`,
                    [goldLost, userId]
                );
                finalResponse.penalties = { goldLost };
                finalResponse.state.player_hp = 0;
            } else if (engineResult.result === 'FLED') {
                // Return to town normally, keep current HP
                await client.query(
                    `UPDATE hero_stats SET hp = $1 WHERE player_id = $2`,
                    [engineResult.newSessionState.player_hp, userId]
                );
            }

        } else {
            // Update ongoing session
            await client.query(
                `UPDATE combat_sessions SET
                 player_hp = $1,
                 monster_hp = $2,
                 turn_count = $3,
                 player_statuses = $4,
                 monster_statuses = $5,
                 updated_at = now()
                 WHERE player_id = $6`,
                [
                    engineResult.newSessionState.player_hp,
                    engineResult.newSessionState.monster_hp,
                    engineResult.newSessionState.turn_count,
                    JSON.stringify(engineResult.newSessionState.player_statuses),
                    JSON.stringify(engineResult.newSessionState.monster_statuses),
                    userId
                ]
            );

            // Save player hp to hero_stats so it is persistent across reloads
            await client.query(`UPDATE hero_stats SET hp = $1 WHERE player_id = $2`, [engineResult.newSessionState.player_hp, userId]);
        }

        await client.query('COMMIT');
        return { data: finalResponse };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[DAL/Combat]', err);
        return { error: err };
    } finally {
        client.release();
    }
}
