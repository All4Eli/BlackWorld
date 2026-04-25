// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Coven Raids API (/api/covens/raids)
// ═══════════════════════════════════════════════════════════════════
//
// CRITICAL FIXES APPLIED:
//   1. Attack action now uses transaction + FOR UPDATE on coven_raids
//      row to prevent concurrent damage loss (TOCTOU race).
//   2. Dead-boss farming prevented by status='active' in SELECT FOR
//      UPDATE — second attacker blocks until first commits 'defeated'.
//   3. HP/essence deduction uses atomic SQL (SET hp = GREATEST(0, hp - $1))
//      instead of read-subtract-write.
//   4. Removed references to non-existent boss_kills column.
//   5. Fixed double-counting of killer's damage in reward split.
//   6. Wrapped with withMiddleware for auth + rate limiting.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne, transaction } from '@/lib/db/pool';
import { calcPlayerStats } from '@/lib/combat';

const RAID_BOSSES = [
  { name: 'The Abyssal Behemoth', tier: 'normal', hp: 10000, damage: 40, defense: 15, rewardGold: 3000, rewardXp: 1500 },
  { name: 'Crimson Wraith Lord', tier: 'hard', hp: 25000, damage: 70, defense: 25, rewardGold: 8000, rewardXp: 4000 },
  { name: 'The Hollow Sovereign', tier: 'nightmare', hp: 60000, damage: 120, defense: 40, rewardGold: 20000, rewardXp: 12000 },
  { name: 'Throne Devourer', tier: 'inferno', hp: 150000, damage: 200, defense: 60, rewardGold: 50000, rewardXp: 30000 },
];

const ESSENCE_COST = 15;
const COOLDOWN_MS = 30 * 1000; // 30 seconds between hits


// ─────────────────────────────────────────────────────────────────
//  GET — Fetch active raid for player's coven
// ─────────────────────────────────────────────────────────────────
async function handleGet(request, { userId }) {
  // Find player's coven
  const { data: member } = await sqlOne(
    `SELECT coven_id FROM coven_members WHERE player_id = $1`, [userId]
  );
  if (!member?.coven_id) return NextResponse.json({ raid: null, message: 'No coven.' });

  // Find active raid
  const { data: raid } = await sqlOne(
    `SELECT * FROM coven_raids WHERE coven_id = $1 AND status = 'active' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
    [member.coven_id]
  );

  if (!raid) return NextResponse.json({ raid: null });

  // Get contributions leaderboard
  const { data: contributions } = await sql(
    `SELECT c.player_id, c.damage_dealt, c.hits, p.username
     FROM coven_raid_contributions c
     JOIN players p ON p.clerk_user_id = c.player_id
     WHERE c.raid_id = $1
     ORDER BY c.damage_dealt DESC`,
    [raid.id]
  );

  // Get player's contribution
  const { data: myContrib } = await sqlOne(
    `SELECT damage_dealt, hits, last_hit_at FROM coven_raid_contributions WHERE raid_id = $1 AND player_id = $2`,
    [raid.id, userId]
  );

  return NextResponse.json({
    raid: {
      id: raid.id,
      bossName: raid.boss_name,
      bossTier: raid.boss_tier,
      bossMaxHp: raid.boss_max_hp,
      bossCurrentHp: raid.boss_current_hp,
      bossDamage: raid.boss_damage,
      bossDefense: raid.boss_defense,
      rewardGold: raid.reward_gold,
      rewardXp: raid.reward_xp,
      status: raid.status,
      expiresAt: raid.expires_at,
    },
    contributions: contributions || [],
    myContribution: myContrib || { damage_dealt: 0, hits: 0, last_hit_at: null },
  });
}


// ─────────────────────────────────────────────────────────────────
//  POST — Summon a raid boss or attack the active one
// ─────────────────────────────────────────────────────────────────
async function handlePost(request, { userId }) {
  const { action, tier } = await request.json();

  // Find player's coven
  const { data: member } = await sqlOne(
    `SELECT coven_id, role FROM coven_members WHERE player_id = $1`, [userId]
  );
  if (!member?.coven_id) {
    return NextResponse.json({ error: 'You must be in a coven.' }, { status: 400 });
  }

  // ────────────────────────────────────────────────────
  //  ACTION: SUMMON
  // ────────────────────────────────────────────────────
  if (action === 'summon') {
    if (!['leader', 'officer'].includes(member.role?.toLowerCase())) {
      return NextResponse.json({ error: 'Only leaders and officers can summon raids.' }, { status: 403 });
    }

    const { data: result, error: txErr } = await transaction(async (client) => {
      // Lock coven row to prevent concurrent summons
      const { rows: covenRows } = await client.query(
        `SELECT treasury FROM covens WHERE id = $1 FOR UPDATE`,
        [member.coven_id]
      );
      if (covenRows.length === 0) throw new Error('Coven not found.');
      if (covenRows[0].treasury < 1000) throw new Error('Coven treasury needs at least 1000g.');

      // Check no active raid
      const { rows: existing } = await client.query(
        `SELECT id FROM coven_raids WHERE coven_id = $1 AND status = 'active' AND expires_at > NOW()`,
        [member.coven_id]
      );
      if (existing.length > 0) throw new Error('A raid is already active.');

      const bossDef = RAID_BOSSES.find(b => b.tier === (tier || 'normal')) || RAID_BOSSES[0];

      // Deduct treasury
      const { rows: updatedCoven } = await client.query(
        `UPDATE covens SET treasury = treasury - 1000 WHERE id = $1 RETURNING treasury`,
        [member.coven_id]
      );

      // Log treasury withdrawal
      await client.query(
        `INSERT INTO coven_treasury_log (coven_id, player_id, action, amount, balance_after, note)
         VALUES ($1, $2, 'withdraw', -1000, $3, $4)`,
        [member.coven_id, userId, updatedCoven[0].treasury, `Raid Boss Summoning: ${bossDef.name}`]
      );

      // Create raid
      const { rows: raidRows } = await client.query(
        `INSERT INTO coven_raids (coven_id, boss_name, boss_tier, boss_max_hp, boss_current_hp, boss_damage, boss_defense, reward_gold, reward_xp)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8) RETURNING *`,
        [member.coven_id, bossDef.name, bossDef.tier, bossDef.hp, bossDef.damage, bossDef.defense, bossDef.rewardGold, bossDef.rewardXp]
      );

      return raidRows[0];
    });

    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 400 });
    return NextResponse.json({ success: true, raid: result });
  }

  // ────────────────────────────────────────────────────
  //  ACTION: ATTACK
  // ────────────────────────────────────────────────────
  if (action === 'attack') {
    const { data: result, error: txErr } = await transaction(async (client) => {
      // ── STEP 1: Lock hero row + validate essence ──
      const { rows: heroRows } = await client.query(
        `SELECT hp, max_hp, essence, level, str, dex, def, int, vit, base_dmg,
                skill_points, gold, xp
         FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
        [userId]
      );
      if (heroRows.length === 0) throw new Error('Hero not found.');
      const hero = heroRows[0];

      if (hero.essence < ESSENCE_COST) {
        throw new Error(`Not enough essence (need ${ESSENCE_COST}).`);
      }

      // ── STEP 2: Lock raid row (FOR UPDATE serializes concurrent attacks) ──
      // If Player A and B attack simultaneously, B BLOCKS until A commits.
      // This prevents the boss HP from being clobbered.
      const { rows: raidRows } = await client.query(
        `SELECT * FROM coven_raids
         WHERE coven_id = $1 AND status = 'active' AND expires_at > NOW()
         FOR UPDATE`,
        [member.coven_id]
      );
      if (raidRows.length === 0) throw new Error('No active raid.');
      const raid = raidRows[0];

      // ── STEP 3: Cooldown check (inside transaction for consistency) ──
      const { rows: contribRows } = await client.query(
        `SELECT last_hit_at FROM coven_raid_contributions
         WHERE raid_id = $1 AND player_id = $2`,
        [raid.id, userId]
      );
      if (contribRows.length > 0 && contribRows[0].last_hit_at) {
        const elapsed = Date.now() - new Date(contribRows[0].last_hit_at).getTime();
        if (elapsed < COOLDOWN_MS) {
          const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          throw new Error(`Cooldown: ${remaining}s remaining.`);
        }
      }

      // ── STEP 4: Fetch equipped gear for damage calc ──
      const { rows: eqRows } = await client.query(
        `SELECT e.slot, i.base_stats AS "baseStats", inv.rolled_stats AS "rolledStats"
         FROM equipment e
         JOIN inventory inv ON e.inventory_id = inv.id
         JOIN items i ON inv.item_id = i.id
         WHERE e.player_id = $1`, [userId]
      );

      const heroShape = {
        str: hero.str, def: hero.def, dex: hero.dex, int: hero.int, vit: hero.vit,
        baseDmg: hero.base_dmg, level: hero.level,
        skillPoints: hero.skill_points || {},
      };
      if (eqRows.length > 0) {
        heroShape.equipped = eqRows.reduce((acc, row) => {
          acc[row.slot] = { baseStats: row.baseStats || {}, rolledStats: row.rolledStats || {} };
          return acc;
        }, {});
      }

      const stats = calcPlayerStats(heroShape);
      const baseDmg = stats.baseDamageMax || 20;
      const isCrit = Math.random() * 100 < (stats.critChance || 5);
      const rawDmg = Math.floor(baseDmg * (0.8 + Math.random() * 0.4));
      const finalDmg = Math.max(1, Math.floor((isCrit ? rawDmg * 1.5 : rawDmg) - (raid.boss_defense * 0.3)));

      // ── STEP 5: Boss counterattack ──
      const bossHit = Math.max(1, raid.boss_damage - (stats.damageReduction || 0));
      const dodged = Math.random() * 100 < (stats.dodgeChance || 0);
      const playerDmgTaken = dodged ? 0 : bossHit;

      // ── STEP 6: Apply damage atomically ──
      // GREATEST(0, ...) prevents negative HP on both boss and player
      const newBossHp = Math.max(0, raid.boss_current_hp - finalDmg);
      const defeated = newBossHp <= 0;

      await client.query(
        `UPDATE coven_raids
         SET boss_current_hp = $1,
             status = $2,
             defeated_at = CASE WHEN $2 = 'defeated' THEN NOW() ELSE NULL END
         WHERE id = $3`,
        [newBossHp, defeated ? 'defeated' : 'active', raid.id]
      );

      // ── STEP 7: Update player HP/essence atomically ──
      const { rows: updatedHeroRows } = await client.query(
        `UPDATE hero_stats
         SET essence = GREATEST(0, essence - $1),
             hp = GREATEST(0, hp - $2)
         WHERE player_id = $3
         RETURNING hp, max_hp, essence, gold, xp`,
        [ESSENCE_COST, playerDmgTaken, userId]
      );
      const updatedHeroRow = updatedHeroRows[0];

      // ── STEP 8: Record contribution ──
      await client.query(
        `INSERT INTO coven_raid_contributions (raid_id, player_id, damage_dealt, hits, last_hit_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (raid_id, player_id) DO UPDATE SET
           damage_dealt = coven_raid_contributions.damage_dealt + $3,
           hits = coven_raid_contributions.hits + 1,
           last_hit_at = NOW()`,
        [raid.id, userId, finalDmg]
      );

      // ── STEP 9: Distribute rewards if boss defeated ──
      let rewardMessage = null;
      let heroGold = updatedHeroRow.gold;
      let heroXp = updatedHeroRow.xp;

      if (defeated) {
        // Fetch ALL contributions (including the current attacker's JUST-UPDATED row)
        const { rows: allContribs } = await client.query(
          `SELECT player_id, damage_dealt FROM coven_raid_contributions WHERE raid_id = $1`,
          [raid.id]
        );

        const totalDamage = allContribs.reduce((sum, c) => sum + c.damage_dealt, 0);

        for (const contrib of allContribs) {
          const share = contrib.damage_dealt / totalDamage;
          const goldReward = Math.floor(raid.reward_gold * share);
          const xpReward = Math.floor(raid.reward_xp * share);

          if (contrib.player_id === userId) {
            // Grant to current player within this transaction
            const { rows: rewardedHero } = await client.query(
              `UPDATE hero_stats SET gold = gold + $1, xp = xp + $2
               WHERE player_id = $3 RETURNING gold, xp`,
              [goldReward, xpReward, userId]
            );
            heroGold = rewardedHero[0].gold;
            heroXp = rewardedHero[0].xp;
            rewardMessage = `You earned ${goldReward}g and ${xpReward} XP!`;
          } else {
            // Grant to other contributors
            await client.query(
              `UPDATE hero_stats SET gold = gold + $1, xp = xp + $2 WHERE player_id = $3`,
              [goldReward, xpReward, contrib.player_id]
            );
          }
        }

        // Award coven XP
        await client.query(
          `UPDATE covens SET xp = xp + $1 WHERE id = $2`,
          [500, member.coven_id]
        );
      }

      return {
        damageDealt: finalDmg,
        isCrit,
        bossDmgToPlayer: playerDmgTaken,
        dodged,
        bossCurrentHp: newBossHp,
        bossMaxHp: raid.boss_max_hp,
        defeated,
        rewardMessage,
        updatedHero: {
          hp: updatedHeroRow.hp - (defeated ? 0 : 0), // already updated
          maxHp: updatedHeroRow.max_hp,
          essence: updatedHeroRow.essence,
          gold: heroGold,
          xp: heroXp,
        },
      };
    });

    if (txErr) {
      const isCooldown = txErr.message.includes('Cooldown');
      return NextResponse.json(
        { error: txErr.message },
        { status: isCooldown ? 429 : 400 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  }

  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
}


// ── Exports with middleware ─────────────────────────────────────
export const GET  = withMiddleware(handleGet,  { rateLimit: null });
export const POST = withMiddleware(handlePost, { rateLimit: 'siege_action', idempotency: false });
