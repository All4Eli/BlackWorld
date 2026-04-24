import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql, sqlOne, HeroStats } from '@/lib/dal';

// GET /api/gathering — get nodes for a zone + player gathering skills
export async function GET(req) {
  try {
    const userId = await auth(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const zoneId = url.searchParams.get('zone');

    // Get player gathering skills
    const { data: skills } = await sql(
      'SELECT * FROM player_gathering WHERE player_id = $1',
      [userId]
    );

    // Get available nodes (optionally filtered by zone)
    let nodes;
    if (zoneId) {
      const result = await sql(
        'SELECT * FROM gathering_nodes WHERE zone_id = $1 AND is_active = true ORDER BY tier, name',
        [zoneId]
      );
      nodes = result.data;
    } else {
      const result = await sql(
        'SELECT gn.*, z.name as zone_name FROM gathering_nodes gn JOIN zones z ON gn.zone_id = z.id WHERE gn.is_active = true ORDER BY z.sort_order, gn.tier',
        []
      );
      nodes = result.data;
    }

    return NextResponse.json({ skills: skills || [], nodes: nodes || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/gathering — gather from a node
export async function POST(req) {
  try {
    const userId = await auth(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { nodeId } = await req.json();
    if (!nodeId) return NextResponse.json({ error: 'Node ID required' }, { status: 400 });

    // Get node
    const { data: node } = await sqlOne(
      'SELECT * FROM gathering_nodes WHERE id = $1 AND is_active = true',
      [nodeId]
    );
    if (!node) return NextResponse.json({ error: 'Node not found' }, { status: 404 });

    // Get hero stats (need essence)
    const { data: hero } = await HeroStats.get(userId);
    if (!hero) return NextResponse.json({ error: 'Hero not found' }, { status: 404 });

    // Gathering costs 5 essence
    const essenceCost = 5;
    if (hero.essence < essenceCost) {
      return NextResponse.json({ error: `Not enough Blood Essence (need ${essenceCost})` }, { status: 400 });
    }

    // Map node_type to skill_type
    const skillMap = {
      ore: 'mining', herb: 'herbalism', wood: 'woodcutting',
      gem: 'gemcraft', essence: 'mining', skin: 'skinning',
    };
    const skillType = skillMap[node.node_type] || 'mining';

    // Get or init player skill
    let { data: skill } = await sqlOne(
      'SELECT * FROM player_gathering WHERE player_id = $1 AND skill_type = $2',
      [userId, skillType]
    );

    if (!skill) {
      const result = await sqlOne(
        `INSERT INTO player_gathering (player_id, skill_type) VALUES ($1, $2)
         ON CONFLICT (player_id, skill_type) DO NOTHING RETURNING *`,
        [userId, skillType]
      );
      skill = result.data || { skill_level: 1, skill_xp: 0, total_gathered: 0 };
    }

    // Check skill level requirement
    if (skill.skill_level < node.min_skill_level) {
      return NextResponse.json({
        error: `Requires ${skillType} level ${node.min_skill_level} (you have ${skill.skill_level})`,
      }, { status: 400 });
    }

    // Spend essence
    const { data: updatedHero } = await HeroStats.spendEssence(userId, essenceCost);
    if (!updatedHero) {
      return NextResponse.json({ error: 'Failed to spend essence' }, { status: 400 });
    }

    // Calculate gather result
    const lootTable = node.loot_table || [];
    const gathered = [];
    const baseGatherXP = 15 + (node.min_skill_level * 5);

    // Roll for each loot entry
    for (const loot of lootTable) {
      const roll = Math.random();
      if (roll <= (loot.chance || 0.5)) {
        const qty = Math.floor(Math.random() * (loot.maxQty || 1)) + (loot.minQty || 1);
        gathered.push({
          itemKey: loot.itemKey,
          name: loot.name || loot.itemKey,
          quantity: qty,
          tier: loot.tier || 'COMMON',
        });
      }
    }

    // If no loot table or nothing dropped, give a default material
    if (gathered.length === 0) {
      gathered.push({
        itemKey: `${node.node_type}_material`,
        name: `${node.name} Material`,
        quantity: 1,
        tier: node.tier || 'COMMON',
      });
    }

    // Add materials to inventory
    for (const item of gathered) {
      // Try to find the item in catalog
      const { data: catalogItem } = await sqlOne(
        'SELECT id FROM items WHERE key = $1',
        [item.itemKey]
      );

      if (catalogItem) {
        // Check if stackable — try to add to existing stack
        const { data: existingStack } = await sqlOne(
          `SELECT id FROM inventory WHERE player_id = $1 AND item_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [userId, catalogItem.id]
        );

        if (existingStack) {
          await sqlOne(
            'UPDATE inventory SET quantity = quantity + $2 WHERE id = $1 RETURNING *',
            [existingStack.id, item.quantity]
          );
        } else {
          await sqlOne(
            `INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, $3) RETURNING *`,
            [userId, catalogItem.id, item.quantity]
          );
        }
      } else {
        // Add as custom item
        await sqlOne(
          `INSERT INTO inventory (player_id, custom_name, custom_tier, quantity, rolled_stats)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [userId, item.name, item.tier, item.quantity, JSON.stringify({ node_type: node.node_type })]
        );
      }
    }

    // Award gathering XP + increment total
    const levelUpXP = skill.skill_level * 100;
    const newXP = (skill.skill_xp || 0) + baseGatherXP;
    const didLevelUp = newXP >= levelUpXP;
    const finalXP = didLevelUp ? newXP - levelUpXP : newXP;
    const finalLevel = didLevelUp ? skill.skill_level + 1 : skill.skill_level;

    await sqlOne(
      `UPDATE player_gathering SET skill_xp = $3, skill_level = $4, total_gathered = total_gathered + 1
       WHERE player_id = $1 AND skill_type = $2 RETURNING *`,
      [userId, skillType, finalXP, finalLevel]
    );

    // Return result
    const { data: finalHero } = await HeroStats.get(userId);

    return NextResponse.json({
      success: true,
      gathered,
      gatherXP: baseGatherXP,
      skillType,
      skillLevel: finalLevel,
      skillXP: finalXP,
      leveledUp: didLevelUp,
      updatedHero: finalHero,
    });
  } catch (err) {
    console.error('[GATHERING ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
