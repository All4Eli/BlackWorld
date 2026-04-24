const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'E87319ee',
    database: 'blackworld'
  });
  await client.connect();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  STEP 2: CONTENT SEEDING AUDIT                       ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // === 1. TABLE ROW COUNTS ===
  console.log('=== TABLE ROW COUNTS ===');
  const tables = [
    'zones', 'monsters', 'items', 'npcs', 'npc_shop_inventory',
    'quests', 'crafting_recipes', 'enhancement_config',
    'daily_login_rewards', 'gathering_nodes', 'rate_limit_config',
    'resource_config', 'server_config', 'dungeons'
  ];
  for (const t of tables) {
    const r = await client.query(`SELECT COUNT(*) FROM ${t}`);
    console.log(`  ${t.padEnd(25)} ${r.rows[0].count} rows`);
  }

  // === 2. ITEMS BY TYPE & TIER ===
  console.log('\n=== ITEMS BY TYPE ===');
  const itemTypes = await client.query(`SELECT type, COUNT(*) as cnt FROM items GROUP BY type ORDER BY type`);
  itemTypes.rows.forEach(r => console.log(`  ${r.type.padEnd(15)} ${r.cnt}`));

  console.log('\n=== ITEMS BY TIER ===');
  const itemTiers = await client.query(`SELECT tier, COUNT(*) as cnt FROM items GROUP BY tier ORDER BY CASE tier WHEN 'COMMON' THEN 1 WHEN 'UNCOMMON' THEN 2 WHEN 'RARE' THEN 3 WHEN 'EPIC' THEN 4 WHEN 'LEGENDARY' THEN 5 WHEN 'MYTHIC' THEN 6 WHEN 'CELESTIAL' THEN 7 END`);
  itemTiers.rows.forEach(r => console.log(`  ${r.tier.padEnd(15)} ${r.cnt}`));

  // === 3. ITEMS BY SLOT ===
  console.log('\n=== EQUIPPABLE ITEMS BY SLOT ===');
  const slots = await client.query(`SELECT slot, COUNT(*) as cnt FROM items WHERE slot IS NOT NULL GROUP BY slot ORDER BY slot`);
  slots.rows.forEach(r => console.log(`  ${r.slot.padEnd(15)} ${r.cnt}`));

  // === 4. WEAPONS BY LEVEL REQUIREMENT ===
  console.log('\n=== WEAPONS BY LEVEL ===');
  const weapons = await client.query(`SELECT name, tier, level_required, base_stats, buy_price FROM items WHERE type = 'WEAPON' ORDER BY level_required, buy_price`);
  weapons.rows.forEach(r => console.log(`  Lv${String(r.level_required).padStart(2)} ${r.tier.padEnd(12)} ${r.name.padEnd(30)} stats=${JSON.stringify(r.base_stats)} price=${r.buy_price}`));

  // === 5. ARMOR BY LEVEL REQUIREMENT ===
  console.log('\n=== ARMOR BY LEVEL ===');
  const armor = await client.query(`SELECT name, slot, tier, level_required, base_stats, buy_price FROM items WHERE type = 'ARMOR' ORDER BY level_required, slot, buy_price`);
  armor.rows.forEach(r => console.log(`  Lv${String(r.level_required).padStart(2)} ${r.slot.padEnd(10)} ${r.tier.padEnd(12)} ${r.name.padEnd(30)} stats=${JSON.stringify(r.base_stats)} price=${r.buy_price}`));

  // === 6. ACCESSORIES BY LEVEL ===
  console.log('\n=== ACCESSORIES BY LEVEL ===');
  const acc = await client.query(`SELECT name, slot, tier, level_required, base_stats, buy_price FROM items WHERE type = 'ACCESSORY' ORDER BY level_required, buy_price`);
  acc.rows.forEach(r => console.log(`  Lv${String(r.level_required).padStart(2)} ${r.slot.padEnd(10)} ${r.tier.padEnd(12)} ${r.name.padEnd(30)} stats=${JSON.stringify(r.base_stats)} price=${r.buy_price}`));

  // === 7. MONSTERS BY ZONE ===
  console.log('\n=== MONSTERS BY ZONE ===');
  const mobs = await client.query(`
    SELECT z.name as zone, z.level_required as zone_lvl, m.name, m.tier, m.is_boss, m.base_hp, m.base_dmg, m.defense, m.xp_reward, m.gold_reward
    FROM monsters m JOIN zones z ON m.zone_id = z.id
    ORDER BY z.sort_order, m.is_boss, m.tier
  `);
  let lastZone = '';
  mobs.rows.forEach(r => {
    if (r.zone !== lastZone) { console.log(`\n  --- ${r.zone} (Lv ${r.zone_lvl}) ---`); lastZone = r.zone; }
    const boss = r.is_boss ? ' [BOSS]' : '';
    console.log(`    ${r.tier.padEnd(12)} ${r.name.padEnd(25)} HP=${String(r.base_hp).padStart(5)} DMG=${String(r.base_dmg).padStart(3)} DEF=${String(r.defense).padStart(3)} → ${r.xp_reward}xp ${r.gold_reward}g${boss}`);
  });

  // === 8. MONSTERS WITH LOOT TABLES ===
  console.log('\n=== MONSTER LOOT TABLES ===');
  const loot = await client.query(`SELECT name, loot_table FROM monsters WHERE loot_table != '[]'::jsonb ORDER BY name`);
  if (loot.rows.length === 0) {
    console.log('  ⚠️  NO MONSTER HAS A LOOT TABLE DEFINED');
  } else {
    loot.rows.forEach(r => console.log(`  ${r.name}: ${JSON.stringify(r.loot_table)}`));
  }

  // === 9. CRAFTING RECIPE INGREDIENT CHECK ===
  console.log('\n=== CRAFTING RECIPE VALIDATION ===');
  const recipes = await client.query(`SELECT key, name, ingredients, result_item_key, level_required FROM crafting_recipes ORDER BY level_required`);
  for (const r of recipes.rows) {
    const ingredients = typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients;
    let valid = true;
    const problems = [];
    
    // Check result item exists
    const resultCheck = await client.query(`SELECT key FROM items WHERE key = $1`, [r.result_item_key]);
    if (resultCheck.rows.length === 0) {
      problems.push(`result_item_key '${r.result_item_key}' NOT FOUND in items`);
      valid = false;
    }
    
    // Check each ingredient exists
    for (const ing of ingredients) {
      const ingCheck = await client.query(`SELECT key FROM items WHERE key = $1`, [ing.item_key]);
      if (ingCheck.rows.length === 0) {
        problems.push(`ingredient '${ing.item_key}' NOT FOUND in items`);
        valid = false;
      }
    }
    
    const status = valid ? '✅' : '❌';
    console.log(`  ${status} ${r.name} (Lv${r.level_required}) → ${r.result_item_key}`);
    if (!valid) problems.forEach(p => console.log(`      ⚠️  ${p}`));
  }

  // === 10. SHOP INVENTORY COVERAGE ===
  console.log('\n=== NPC SHOP COVERAGE ===');
  const shops = await client.query(`
    SELECT n.name as npc, COUNT(s.id) as item_count 
    FROM npc_shop_inventory s 
    JOIN npcs n ON s.npc_id = n.id 
    GROUP BY n.name ORDER BY n.name
  `);
  shops.rows.forEach(r => console.log(`  ${r.npc.padEnd(25)} ${r.item_count} items`));

  // NPCs WITHOUT shops
  const noShop = await client.query(`
    SELECT n.name, n.role FROM npcs n 
    LEFT JOIN npc_shop_inventory s ON n.id = s.npc_id 
    WHERE s.id IS NULL
  `);
  if (noShop.rows.length > 0) {
    console.log('\n  NPCs with NO shop inventory:');
    noShop.rows.forEach(r => console.log(`    ${r.name} (${r.role})`));
  }

  // === 11. QUEST CHAIN VALIDATION ===
  console.log('\n=== QUEST CHAIN VALIDATION ===');
  const quests = await client.query(`SELECT key, title, type, level_required, prerequisite_quest, reward_gold, reward_xp, reward_items FROM quests ORDER BY type, sort_order`);
  const questById = {};
  quests.rows.forEach(q => { questById[q.key] = q; });
  console.log(`  Total: ${quests.rows.length} quests`);
  const byType = {};
  quests.rows.forEach(q => { byType[q.type] = (byType[q.type] || 0) + 1; });
  Object.entries(byType).forEach(([t, c]) => console.log(`    ${t.padEnd(10)} ${c}`));

  // === 12. DUNGEON TABLE ===
  console.log('\n=== DUNGEONS ===');
  const dungeons = await client.query(`SELECT * FROM dungeons`);
  if (dungeons.rows.length === 0) {
    console.log('  ⚠️  DUNGEONS TABLE IS EMPTY — no dungeons seeded');
  } else {
    dungeons.rows.forEach(r => console.log(`  ${r.name} (${r.difficulty}) — ${r.floor_count} floors`));
  }

  // === 13. EMPTY CRITICAL TABLES CHECK ===
  console.log('\n=== EMPTY TABLE CHECK ===');
  const criticalTables = ['zones', 'monsters', 'items', 'npcs', 'quests', 'crafting_recipes', 'enhancement_config', 'daily_login_rewards', 'gathering_nodes', 'rate_limit_config', 'resource_config', 'server_config', 'dungeons', 'pvp_seasons'];
  for (const t of criticalTables) {
    try {
      const r = await client.query(`SELECT COUNT(*) FROM ${t}`);
      const count = parseInt(r.rows[0].count);
      if (count === 0) {
        console.log(`  ❌ ${t} — EMPTY`);
      }
    } catch(e) {
      console.log(`  ❌ ${t} — TABLE MISSING: ${e.message}`);
    }
  }

  // === 14. GOLD ECONOMY SNAPSHOT ===
  console.log('\n=== GOLD ECONOMY BALANCING ===');
  // Compare monster gold rewards vs item costs
  console.log('\n  Zone 1 (Bone Crypts, Lv1) — Player earns per kill:');
  const z1mobs = await client.query(`SELECT name, gold_reward, xp_reward FROM monsters WHERE zone_id = 'bone_crypts' AND is_boss = false`);
  z1mobs.rows.forEach(r => console.log(`    ${r.name}: ${r.gold_reward}g, ${r.xp_reward}xp`));
  const avgGold1 = z1mobs.rows.reduce((s,r) => s + r.gold_reward, 0) / z1mobs.rows.length;
  console.log(`    Average: ${avgGold1.toFixed(0)}g per kill`);

  console.log('\n  Cheapest starter gear:');
  const starterGear = await client.query(`SELECT name, type, slot, buy_price FROM items WHERE level_required = 1 AND buy_price IS NOT NULL AND type IN ('WEAPON','ARMOR','ACCESSORY') ORDER BY buy_price LIMIT 10`);
  starterGear.rows.forEach(r => console.log(`    ${r.name} (${r.slot || r.type}): ${r.buy_price}g → ${Math.ceil(r.buy_price / avgGold1)} kills to afford`));

  await client.end();
  console.log('\n[AUDIT COMPLETE]');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
