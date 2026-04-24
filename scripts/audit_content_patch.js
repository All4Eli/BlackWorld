const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'E87319ee',
    database: 'blackworld'
  });
  await client.connect();
  console.log('[CONNECTED] blackworld\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  STEP 2 CONTENT PATCH — Applying All Fixes           ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════════════════════════
  // PATCH 1: MONSTER LOOT TABLES (GAP-1) — All 34 monsters
  // ═══════════════════════════════════════════════════════════════
  console.log('═══ PATCH 1: Monster Loot Tables ═══');

  const lootUpdates = [
    // --- Bone Crypts (Lv 1) ---
    {
      name: 'Skeletal Archer',
      loot: [
        { item_key: 'rusty_scrap', drop_chance: 0.40, qty_min: 1, qty_max: 2 },
        { item_key: 'charred_bone', drop_chance: 0.30, qty_min: 1, qty_max: 1 },
        { item_key: 'bone_shard_dagger', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
        { item_key: 'minor_health_flask', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Lich Initiate',
      loot: [
        { item_key: 'charred_bone', drop_chance: 0.35, qty_min: 1, qty_max: 2 },
        { item_key: 'rusty_scrap', drop_chance: 0.30, qty_min: 1, qty_max: 1 },
        { item_key: 'leather_coif', drop_chance: 0.06, qty_min: 1, qty_max: 1 },
        { item_key: 'minor_health_flask', drop_chance: 0.18, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Grave Shambler',
      loot: [
        { item_key: 'charred_bone', drop_chance: 0.40, qty_min: 1, qty_max: 3 },
        { item_key: 'grave_silk', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'dusty_burial_shroud', drop_chance: 0.07, qty_min: 1, qty_max: 1 },
        { item_key: 'iron_mace', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'The Crypt Warden',
      loot: [
        { item_key: 'bone_ring', drop_chance: 0.25, qty_min: 1, qty_max: 1 },
        { item_key: 'iron_mace', drop_chance: 0.20, qty_min: 1, qty_max: 1 },
        { item_key: 'charred_bone', drop_chance: 0.50, qty_min: 2, qty_max: 4 },
        { item_key: 'grave_silk', drop_chance: 0.30, qty_min: 1, qty_max: 2 },
        { item_key: 'tome_blood_pact', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
      ]
    },

    // --- Ashen Wastes (Lv 5) ---
    {
      name: 'Ash Wraith',
      loot: [
        { item_key: 'demon_fang', drop_chance: 0.30, qty_min: 1, qty_max: 1 },
        { item_key: 'rusty_scrap', drop_chance: 0.35, qty_min: 1, qty_max: 2 },
        { item_key: 'shadow_dagger', drop_chance: 0.06, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Cinder Golem',
      loot: [
        { item_key: 'iron_ore', drop_chance: 0.35, qty_min: 1, qty_max: 3 },
        { item_key: 'rusty_scrap', drop_chance: 0.40, qty_min: 1, qty_max: 2 },
        { item_key: 'ashen_aegis', drop_chance: 0.04, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Smoldering Fiend',
      loot: [
        { item_key: 'demon_fang', drop_chance: 0.35, qty_min: 1, qty_max: 2 },
        { item_key: 'grave_silk', drop_chance: 0.25, qty_min: 1, qty_max: 1 },
        { item_key: 'cinderforged_blade', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
        { item_key: 'ember_band', drop_chance: 0.06, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'The Ember Sovereign',
      loot: [
        { item_key: 'demon_fang', drop_chance: 0.50, qty_min: 2, qty_max: 4 },
        { item_key: 'iron_ore', drop_chance: 0.40, qty_min: 2, qty_max: 3 },
        { item_key: 'cinderforged_blade', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'iron_helm', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_iron_will', drop_chance: 0.04, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Ashen Colossus',
      loot: [
        { item_key: 'iron_ore', drop_chance: 0.50, qty_min: 2, qty_max: 5 },
        { item_key: 'ancient_core', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'ashen_aegis', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_essence_mastery', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
      ]
    },

    // --- Hollow Cathedral (Lv 10) ---
    {
      name: 'Fallen Paladin',
      loot: [
        { item_key: 'ancient_core', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'grave_silk', drop_chance: 0.30, qty_min: 1, qty_max: 2 },
        { item_key: 'heretics_warblade', drop_chance: 0.04, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Soul Reaper',
      loot: [
        { item_key: 'vampiric_bloodlet', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'grave_silk', drop_chance: 0.28, qty_min: 1, qty_max: 2 },
        { item_key: 'soul_amulet', drop_chance: 0.04, qty_min: 1, qty_max: 1 },
        { item_key: 'health_flask', drop_chance: 0.20, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Void Acolyte',
      loot: [
        { item_key: 'ancient_core', drop_chance: 0.18, qty_min: 1, qty_max: 1 },
        { item_key: 'demon_fang', drop_chance: 0.25, qty_min: 1, qty_max: 2 },
        { item_key: 'mana_potion', drop_chance: 0.20, qty_min: 1, qty_max: 1 },
        { item_key: 'sanctified_bone_plate', drop_chance: 0.03, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'The Nameless Sovereign',
      loot: [
        { item_key: 'heretics_warblade', drop_chance: 0.18, qty_min: 1, qty_max: 1 },
        { item_key: 'sanctified_bone_plate', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'soul_amulet', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'ancient_core', drop_chance: 0.35, qty_min: 1, qty_max: 2 },
        { item_key: 'dreadplate_greaves', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_inferno', drop_chance: 0.02, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'High Priest of Nothing',
      loot: [
        { item_key: 'soul_amulet', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'dreadplate_greaves', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'vampiric_bloodlet', drop_chance: 0.40, qty_min: 1, qty_max: 3 },
        { item_key: 'blood_crystal', drop_chance: 0.20, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_resurrection', drop_chance: 0.01, qty_min: 1, qty_max: 1 },
      ]
    },

    // --- Crimson Depths (Lv 15) ---
    {
      name: 'Blood Lurker',
      loot: [
        { item_key: 'blood_crystal', drop_chance: 0.18, qty_min: 1, qty_max: 1 },
        { item_key: 'vampiric_bloodlet', drop_chance: 0.22, qty_min: 1, qty_max: 1 },
        { item_key: 'health_flask', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'crimson_mail', drop_chance: 0.03, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Sanguine Leech',
      loot: [
        { item_key: 'vampiric_bloodlet', drop_chance: 0.30, qty_min: 1, qty_max: 2 },
        { item_key: 'blood_crystal', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'bloodforged_cleaver', drop_chance: 0.03, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Crimson Behemoth',
      loot: [
        { item_key: 'iron_ore', drop_chance: 0.35, qty_min: 2, qty_max: 4 },
        { item_key: 'blood_crystal', drop_chance: 0.20, qty_min: 1, qty_max: 1 },
        { item_key: 'ancient_core', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'The Blood Matriarch',
      loot: [
        { item_key: 'bloodforged_cleaver', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'crimson_mail', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'blood_crystal', drop_chance: 0.45, qty_min: 2, qty_max: 4 },
        { item_key: 'vampiric_bloodlet', drop_chance: 0.40, qty_min: 2, qty_max: 3 },
        { item_key: 'greater_health_flask', drop_chance: 0.25, qty_min: 1, qty_max: 2 },
        { item_key: 'tome_blood_pact', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
      ]
    },

    // --- Abyssal Rift (Lv 20) ---
    {
      name: 'Void Stalker',
      loot: [
        { item_key: 'pure_void_essence', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'void_fragment', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
        { item_key: 'void_signet', drop_chance: 0.03, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Greater Demon',
      loot: [
        { item_key: 'pure_void_essence', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'rift_torn_executioner', drop_chance: 0.03, qty_min: 1, qty_max: 1 },
        { item_key: 'greater_health_flask', drop_chance: 0.18, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Rift Horror',
      loot: [
        { item_key: 'void_fragment', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'pure_void_essence', drop_chance: 0.18, qty_min: 1, qty_max: 1 },
        { item_key: 'abyssal_carapace', drop_chance: 0.02, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Warden of the Abyss',
      loot: [
        { item_key: 'rift_torn_executioner', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'abyssal_carapace', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'void_treads', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'void_signet', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
        { item_key: 'void_fragment', drop_chance: 0.40, qty_min: 2, qty_max: 3 },
        { item_key: 'pure_void_essence', drop_chance: 0.35, qty_min: 1, qty_max: 2 },
        { item_key: 'tome_void_walk', drop_chance: 0.005, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'The Eternal Devourer',
      loot: [
        { item_key: 'void_reaper', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
        { item_key: 'void_fragment', drop_chance: 0.45, qty_min: 2, qty_max: 4 },
        { item_key: 'pure_void_essence', drop_chance: 0.40, qty_min: 2, qty_max: 3 },
        { item_key: 'void_signet', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_inferno', drop_chance: 0.02, qty_min: 1, qty_max: 1 },
      ]
    },

    // --- Iron Wastes (Lv 25) ---
    {
      name: 'Rusted Sentinel',
      loot: [
        { item_key: 'iron_ore', drop_chance: 0.45, qty_min: 3, qty_max: 6 },
        { item_key: 'ancient_core', drop_chance: 0.15, qty_min: 1, qty_max: 1 },
        { item_key: 'void_reaper', drop_chance: 0.02, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Scrap Harvester',
      loot: [
        { item_key: 'iron_ore', drop_chance: 0.40, qty_min: 2, qty_max: 5 },
        { item_key: 'ancient_core', drop_chance: 0.20, qty_min: 1, qty_max: 1 },
        { item_key: 'void_fragment', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'War Machine Alpha',
      loot: [
        { item_key: 'iron_ore', drop_chance: 0.50, qty_min: 3, qty_max: 6 },
        { item_key: 'ancient_core', drop_chance: 0.25, qty_min: 1, qty_max: 2 },
        { item_key: 'void_fragment', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'The Iron Tyrant',
      loot: [
        { item_key: 'void_reaper', drop_chance: 0.10, qty_min: 1, qty_max: 1 },
        { item_key: 'iron_ore', drop_chance: 0.60, qty_min: 4, qty_max: 8 },
        { item_key: 'ancient_core', drop_chance: 0.40, qty_min: 2, qty_max: 3 },
        { item_key: 'void_fragment', drop_chance: 0.20, qty_min: 1, qty_max: 2 },
        { item_key: 'tome_iron_will', drop_chance: 0.04, qty_min: 1, qty_max: 1 },
      ]
    },

    // --- Throne of Nothing (Lv 35) ---
    {
      name: 'Death Aspect',
      loot: [
        { item_key: 'void_fragment', drop_chance: 0.25, qty_min: 1, qty_max: 2 },
        { item_key: 'celestial_dust', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
        { item_key: 'pure_void_essence', drop_chance: 0.20, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Void Incarnate',
      loot: [
        { item_key: 'void_fragment', drop_chance: 0.30, qty_min: 1, qty_max: 2 },
        { item_key: 'celestial_dust', drop_chance: 0.08, qty_min: 1, qty_max: 1 },
        { item_key: 'pure_void_essence', drop_chance: 0.25, qty_min: 1, qty_max: 2 },
      ]
    },
    {
      name: 'The Throne Sovereign',
      loot: [
        { item_key: 'sovereigns_edge', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
        { item_key: 'crown_eternal_night', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
        { item_key: 'sovereign_amulet', drop_chance: 0.05, qty_min: 1, qty_max: 1 },
        { item_key: 'celestial_dust', drop_chance: 0.30, qty_min: 2, qty_max: 4 },
        { item_key: 'void_fragment', drop_chance: 0.50, qty_min: 3, qty_max: 5 },
        { item_key: 'tome_void_walk', drop_chance: 0.005, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_resurrection', drop_chance: 0.01, qty_min: 1, qty_max: 1 },
      ]
    },

    // --- Void Spire (Lv 40) ---
    {
      name: 'Dimensional Wraith',
      loot: [
        { item_key: 'celestial_dust', drop_chance: 0.12, qty_min: 1, qty_max: 1 },
        { item_key: 'void_fragment', drop_chance: 0.30, qty_min: 1, qty_max: 2 },
        { item_key: 'pure_void_essence', drop_chance: 0.28, qty_min: 1, qty_max: 2 },
      ]
    },
    {
      name: 'Reality Fracture',
      loot: [
        { item_key: 'celestial_dust', drop_chance: 0.15, qty_min: 1, qty_max: 2 },
        { item_key: 'void_fragment', drop_chance: 0.35, qty_min: 2, qty_max: 3 },
        { item_key: 'entropy_blade', drop_chance: 0.01, qty_min: 1, qty_max: 1 },
      ]
    },
    {
      name: 'Entropy Weaver',
      loot: [
        { item_key: 'celestial_dust', drop_chance: 0.18, qty_min: 1, qty_max: 2 },
        { item_key: 'pure_void_essence', drop_chance: 0.30, qty_min: 1, qty_max: 2 },
        { item_key: 'void_fragment', drop_chance: 0.35, qty_min: 1, qty_max: 3 },
      ]
    },
    {
      name: 'The Architect of Ruin',
      loot: [
        { item_key: 'entropy_blade', drop_chance: 0.03, qty_min: 1, qty_max: 1 },
        { item_key: 'celestial_dust', drop_chance: 0.45, qty_min: 3, qty_max: 6 },
        { item_key: 'void_fragment', drop_chance: 0.55, qty_min: 3, qty_max: 5 },
        { item_key: 'pure_void_essence', drop_chance: 0.50, qty_min: 2, qty_max: 4 },
        { item_key: 'sovereign_amulet', drop_chance: 0.04, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_void_walk', drop_chance: 0.005, qty_min: 1, qty_max: 1 },
        { item_key: 'tome_resurrection', drop_chance: 0.01, qty_min: 1, qty_max: 1 },
      ]
    },
  ];

  let updated = 0;
  for (const entry of lootUpdates) {
    const res = await client.query(
      `UPDATE monsters SET loot_table = $1::jsonb WHERE name = $2`,
      [JSON.stringify(entry.loot), entry.name]
    );
    if (res.rowCount > 0) updated++;
    else console.log(`  ⚠️ No match for: ${entry.name}`);
  }
  console.log(`[OK] ${updated}/${lootUpdates.length} monsters updated with loot tables`);

  // Verify: count monsters with non-empty loot
  const lootCheck = await client.query(`SELECT COUNT(*) FROM monsters WHERE loot_table != '[]'::jsonb`);
  console.log(`[VERIFY] ${lootCheck.rows[0].count}/34 monsters now have loot tables\n`);


  // ═══════════════════════════════════════════════════════════════
  // PATCH 2: MISSING SLOT ITEMS (VOL-1) — 6 new items
  // ═══════════════════════════════════════════════════════════════
  console.log('═══ PATCH 2: Missing Slot Items ═══');
  await client.query(`
    INSERT INTO items (key, name, type, slot, tier, description, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_stackable, is_craftable) VALUES
    ('splintered_buckler',   'Splintered Buckler',         'ARMOR',     'offHand', 'COMMON',    'A cracked shield scavenged from the crypts.',         '{"def": 2, "hp": 10}',     45,  11,  1, 75, 1, false, false),
    ('gravewrapped_boots',   'Gravewrapped Boots',         'ARMOR',     'boots',   'COMMON',    'Bandaged feet, wrapped in graveyard linen.',           '{"def": 2, "hp": 8}',      55,  14,  1, 80, 1, false, false),
    ('cracked_bone_pendant', 'Cracked Bone Pendant',       'ACCESSORY', 'amulet',  'COMMON',    'A fractured talisman that hums with fading power.',    '{"maxMana": 10, "magicDmg": 1}', 60, 15, 1, 70, 1, false, false),
    ('ember_ward',           'Ember Ward',                 'ARMOR',     'offHand', 'UNCOMMON',  'A branding iron reshaped into a shield. Still warm.',  '{"def": 5, "hp": 20, "dmg": 2}', 220, 55, 5, 45, 2, false, false),
    ('bloodstone_signet',    'Bloodstone Signet',          'ACCESSORY', 'ring',    'RARE',      'Cut from crystallized blood of the Crimson Depths.',   '{"hp": 20, "crit": 4, "def": 3}', 480, 120, 10, 22, 3, false, false),
    ('abyssal_crown',        'Abyssal Crown',             'ARMOR',     'head',    'EPIC',      'A crown forged from rift shards. Whispers constantly.','{"def": 15, "hp": 60, "maxMana": 20}', 1600, 400, 20, 12, 4, false, false)
    ON CONFLICT (key) DO NOTHING;
  `);
  const newItemCount = await client.query(`SELECT COUNT(*) FROM items`);
  console.log(`[OK] Item catalog now has ${newItemCount.rows[0].count} items`);

  // Add new items to merchant shop
  await client.query(`
    INSERT INTO npc_shop_inventory (npc_id, item_id, stock, sort_order)
    SELECT n.id, i.id, NULL, 100 + ROW_NUMBER() OVER (ORDER BY i.level_required, i.buy_price)
    FROM npcs n
    CROSS JOIN items i
    WHERE n.key = 'merchant_kael'
      AND i.key IN ('splintered_buckler','gravewrapped_boots','cracked_bone_pendant','ember_ward','bloodstone_signet','abyssal_crown')
      AND i.buy_price IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM npc_shop_inventory s WHERE s.npc_id = n.id AND s.item_id = i.id)
  `);
  const shopCount = await client.query(`SELECT COUNT(*) FROM npc_shop_inventory`);
  console.log(`[OK] Shop inventory now has ${shopCount.rows[0].count} listings\n`);


  // ═══════════════════════════════════════════════════════════════
  // PATCH 3: DUNGEONS (GAP-2) — 3 dungeons
  // ═══════════════════════════════════════════════════════════════
  console.log('═══ PATCH 3: Dungeons ═══');
  await client.query(`
    INSERT INTO dungeons (id, name, description, zone_id, icon, min_level, floor_count, rewards, cooldown_hours, difficulty) VALUES
    ('crypt_descent',    'Crypt Descent',     'Descend through 5 floors of the deepest Bone Crypts.',                            'bone_crypts',      '⛫',  5,  5, '{"gold": 300, "xp": 200}',  24, 'normal'),
    ('cathedral_depths', 'Cathedral Depths',  'The Cathedral hides floors that go far below sanctified ground.',                  'hollow_cathedral', '⛫', 15,  7, '{"gold": 800, "xp": 600}',  24, 'hard'),
    ('void_ascent',      'Void Ascent',       'Climb the Spire. Each floor bends reality further.',                               'void_spire',       '⛫', 35, 10, '{"gold": 3000, "xp": 2500}', 24, 'nightmare')
    ON CONFLICT (id) DO NOTHING;
  `);
  const dungeonCount = await client.query(`SELECT COUNT(*) FROM dungeons`);
  console.log(`[OK] ${dungeonCount.rows[0].count} dungeons seeded\n`);


  // ═══════════════════════════════════════════════════════════════
  // PATCH 4: PVP SEASON 1 (GAP-3)
  // ═══════════════════════════════════════════════════════════════
  console.log('═══ PATCH 4: PvP Season 1 ═══');
  await client.query(`
    INSERT INTO pvp_seasons (season_number, name, starts_at, ends_at, rewards, is_active) VALUES
    (1, 'Season of Blood', now(), now() + interval '90 days',
     '{"bronze": {"gold": 500}, "silver": {"gold": 1000}, "gold": {"gold": 2500}, "platinum": {"gold": 5000}, "diamond": {"gold": 10000}, "champion": {"gold": 25000}, "sovereign": {"gold": 50000, "title": "Blood Sovereign"}}',
     true)
    ON CONFLICT (season_number) DO NOTHING;
  `);
  const seasonCount = await client.query(`SELECT COUNT(*) FROM pvp_seasons`);
  console.log(`[OK] ${seasonCount.rows[0].count} PvP season(s) active\n`);


  // ═══════════════════════════════════════════════════════════════
  // FINAL VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  POST-PATCH VERIFICATION                             ║');
  console.log('╠══════════════════════════════════════════════════════╣');

  const checks = [
    { query: `SELECT COUNT(*) FROM items`, label: 'Total Items' },
    { query: `SELECT COUNT(*) FROM monsters`, label: 'Total Monsters' },
    { query: `SELECT COUNT(*) FROM monsters WHERE loot_table != '[]'::jsonb`, label: 'Monsters w/ Loot' },
    { query: `SELECT COUNT(*) FROM dungeons`, label: 'Dungeons' },
    { query: `SELECT COUNT(*) FROM pvp_seasons WHERE is_active = true`, label: 'Active PvP Seasons' },
    { query: `SELECT COUNT(*) FROM npc_shop_inventory`, label: 'Shop Listings' },
    { query: `SELECT COUNT(DISTINCT slot) FROM items WHERE slot IS NOT NULL`, label: 'Unique Slots Covered' },
    { query: `SELECT COUNT(*) FROM items WHERE level_required = 1 AND slot IS NOT NULL`, label: 'Lv1 Equippable Items' },
    { query: `SELECT COUNT(*) FROM quests`, label: 'Quests' },
    { query: `SELECT COUNT(*) FROM crafting_recipes`, label: 'Crafting Recipes' },
    { query: `SELECT COUNT(*) FROM gathering_nodes`, label: 'Gathering Nodes' },
  ];

  for (const { query, label } of checks) {
    const r = await client.query(query);
    console.log(`║  ${label.padEnd(25)} ${String(r.rows[0].count).padStart(4)}${' '.repeat(23)}║`);
  }

  console.log('╚══════════════════════════════════════════════════════╝');

  await client.end();
  console.log('\n[DONE] All Step 2 content patches applied successfully.');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
