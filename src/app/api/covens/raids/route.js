import { sql, sqlOne, HeroStats, Composite } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { calcPlayerStats } from '@/lib/combat';

const RAID_BOSSES = [
  { name: 'The Abyssal Behemoth', tier: 'normal', hp: 10000, damage: 40, defense: 15, rewardGold: 3000, rewardXp: 1500 },
  { name: 'Crimson Wraith Lord', tier: 'hard', hp: 25000, damage: 70, defense: 25, rewardGold: 8000, rewardXp: 4000 },
  { name: 'The Hollow Sovereign', tier: 'nightmare', hp: 60000, damage: 120, defense: 40, rewardGold: 20000, rewardXp: 12000 },
  { name: 'Throne Devourer', tier: 'inferno', hp: 150000, damage: 200, defense: 60, rewardGold: 50000, rewardXp: 30000 },
];

const ESSENCE_COST = 15;
const COOLDOWN_MS = 30 * 1000; // 30 seconds between hits

// GET — Fetch active raid for player's coven
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Find player's coven
    const player = await sqlOne(`SELECT coven_id FROM coven_members WHERE player_id = $1`, [userId]);
    if (!player?.coven_id) return NextResponse.json({ raid: null, message: 'No coven.' });

    // Find active raid
    const raid = await sqlOne(
      `SELECT * FROM coven_raids WHERE coven_id = $1 AND status = 'active' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [player.coven_id]
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
    const myContrib = await sqlOne(
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
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — Summon a raid boss or attack the active one
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, tier } = await request.json();

    // Find player's coven
    const member = await sqlOne(`SELECT coven_id, role FROM coven_members WHERE player_id = $1`, [userId]);
    if (!member?.coven_id) return NextResponse.json({ error: 'You must be in a coven.' }, { status: 400 });

    if (action === 'summon') {
      // Only leaders/officers can summon
      if (!['Leader', 'Officer'].includes(member.role)) {
        return NextResponse.json({ error: 'Only leaders and officers can summon raids.' }, { status: 403 });
      }

      // Check no active raid
      const existing = await sqlOne(
        `SELECT id FROM coven_raids WHERE coven_id = $1 AND status = 'active' AND expires_at > NOW()`,
        [member.coven_id]
      );
      if (existing) return NextResponse.json({ error: 'A raid is already active.' }, { status: 400 });

      // Check treasury cost (1000g from treasury)
      const coven = await sqlOne(`SELECT treasury FROM covens WHERE id = $1`, [member.coven_id]);
      if ((coven?.treasury || 0) < 1000) {
        return NextResponse.json({ error: 'Coven treasury needs at least 1000g to summon a raid.' }, { status: 400 });
      }

      const bossDef = RAID_BOSSES.find(b => b.tier === (tier || 'normal')) || RAID_BOSSES[0];

      // Deduct treasury and create raid
      await sql(`UPDATE covens SET treasury = treasury - 1000 WHERE id = $1`, [member.coven_id]);
      await sql(
        `INSERT INTO coven_treasury_log (coven_id, player_id, action, amount, note)
         VALUES ($1, $2, 'withdrawal', -1000, 'Raid Boss Summoning: ' || $3)`,
        [member.coven_id, userId, bossDef.name]
      );

      const raid = await sqlOne(
        `INSERT INTO coven_raids (coven_id, boss_name, boss_tier, boss_max_hp, boss_current_hp, boss_damage, boss_defense, reward_gold, reward_xp)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8) RETURNING *`,
        [member.coven_id, bossDef.name, bossDef.tier, bossDef.hp, bossDef.damage, bossDef.defense, bossDef.rewardGold, bossDef.rewardXp]
      );

      return NextResponse.json({ success: true, raid });

    } else if (action === 'attack') {
      // Get player stats
      const { data: composite } = await Composite.getFullPlayer(userId);
      if (!composite?.stats) throw new Error('Player not found.');

      // Essence check
      if (composite.stats.essence < ESSENCE_COST) {
        return NextResponse.json({ error: `Not enough essence (need ${ESSENCE_COST}).` }, { status: 400 });
      }

      // Get active raid
      const raid = await sqlOne(
        `SELECT * FROM coven_raids WHERE coven_id = $1 AND status = 'active' AND expires_at > NOW()`,
        [member.coven_id]
      );
      if (!raid) return NextResponse.json({ error: 'No active raid.' }, { status: 400 });

      // Cooldown check
      const myContrib = await sqlOne(
        `SELECT last_hit_at FROM coven_raid_contributions WHERE raid_id = $1 AND player_id = $2`,
        [raid.id, userId]
      );
      if (myContrib?.last_hit_at) {
        const elapsed = Date.now() - new Date(myContrib.last_hit_at).getTime();
        if (elapsed < COOLDOWN_MS) {
          const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          return NextResponse.json({ error: `Cooldown: ${remaining}s remaining.` }, { status: 429 });
        }
      }

      // Calculate damage
      const heroData = composite.stats.hero_data || {};
      const stats = calcPlayerStats(heroData);
      const baseDmg = stats.baseDamageMax || 20;
      const critRoll = Math.random() * 100;
      const isCrit = critRoll < (stats.critChance || 5);
      const rawDmg = Math.floor(baseDmg * (0.8 + Math.random() * 0.4));
      const finalDmg = Math.max(1, Math.floor((isCrit ? rawDmg * 1.5 : rawDmg) - (raid.boss_defense * 0.3)));

      // Boss counterattack
      const bossHit = Math.max(1, raid.boss_damage - (stats.damageReduction || 0));
      const dodged = Math.random() * 100 < (stats.dodgeChance || 0);
      const playerDmgTaken = dodged ? 0 : bossHit;

      // Update raid HP
      const newBossHp = Math.max(0, raid.boss_current_hp - finalDmg);
      const defeated = newBossHp <= 0;

      await sql(
        `UPDATE coven_raids SET boss_current_hp = $1, status = $2, defeated_at = $3 WHERE id = $4`,
        [newBossHp, defeated ? 'defeated' : 'active', defeated ? new Date().toISOString() : null, raid.id]
      );

      // Update contribution
      await sql(
        `INSERT INTO coven_raid_contributions (raid_id, player_id, damage_dealt, hits, last_hit_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (raid_id, player_id) DO UPDATE SET
           damage_dealt = coven_raid_contributions.damage_dealt + $3,
           hits = coven_raid_contributions.hits + 1,
           last_hit_at = NOW()`,
        [raid.id, userId, finalDmg]
      );

      // Update player essence and HP
      const newPlayerHp = Math.max(0, composite.stats.hp - playerDmgTaken);
      const heroUpdates = {
        essence: composite.stats.essence - ESSENCE_COST,
        hp: newPlayerHp,
      };

      // If raid defeated, distribute rewards to ALL contributors
      let rewardMessage = null;
      if (defeated) {
        const { data: allContribs } = await sql(
          `SELECT player_id, damage_dealt FROM coven_raid_contributions WHERE raid_id = $1`,
          [raid.id]
        );

        // Split rewards proportionally by damage
        const totalDamage = allContribs.reduce((sum, c) => sum + c.damage_dealt, 0) + finalDmg;
        
        for (const contrib of allContribs) {
          const share = (contrib.damage_dealt + (contrib.player_id === userId ? finalDmg : 0)) / totalDamage;
          const goldReward = Math.floor(raid.reward_gold * share);
          const xpReward = Math.floor(raid.reward_xp * share);

          if (contrib.player_id === userId) {
            heroUpdates.gold = (composite.stats.gold || 0) + goldReward;
            heroUpdates.xp = (composite.stats.xp || 0) + xpReward;
            rewardMessage = `You earned ${goldReward}g and ${xpReward} XP!`;
          } else {
            await sql(
              `UPDATE hero_stats SET gold = gold + $1, xp = xp + $2 WHERE player_id = $3`,
              [goldReward, xpReward, contrib.player_id]
            );
          }
        }

        // Award coven XP
        await sql(`UPDATE covens SET xp = xp + $1 WHERE id = $2`, [500, member.coven_id]);
      }

      await HeroStats.update(userId, heroUpdates);

      // Build response
      const updatedHero = {
        ...(composite.stats.hero_data || {}),
        hp: heroUpdates.hp,
        gold: heroUpdates.gold ?? composite.stats.gold,
        xp: heroUpdates.xp ?? composite.stats.xp,
        level: composite.stats.level,
        essence: heroUpdates.essence,
        max_hp: composite.stats.max_hp,
      };

      return NextResponse.json({
        success: true,
        damageDealt: finalDmg,
        isCrit,
        bossDmgToPlayer: playerDmgTaken,
        dodged,
        bossCurrentHp: newBossHp,
        bossMaxHp: raid.boss_max_hp,
        defeated,
        rewardMessage,
        updatedHero,
      });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
