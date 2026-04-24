const { Client } = require('pg');

// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — GAME CONTENT SEEDING
// ═══════════════════════════════════════════════════════════════════
// Populates all reference/config tables with actual game content.
// This is NOT test data — this IS the game world definition.
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:E87319ee@localhost:5432/blackworld',
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  console.log('[CONNECTED] blackworld\n');


  // ══════════════════════════════════════════════════════════════════
  //  1. ZONES — Exploration locations
  // ══════════════════════════════════════════════════════════════════
  console.log('═══ 1. ZONES ═══');
  await client.query(`
    INSERT INTO zones (id, name, description, icon, level_required, essence_cost, gold_multiplier, xp_multiplier, danger_level, sort_order) VALUES
    ('bone_crypts',       'The Bone Crypts',        'Shallow graves stretch endlessly. The dead here are restless.',                          '✟', 1,  8,  1.0, 1.0, 'normal',    1),
    ('ashen_wastes',      'The Ashen Wastes',        'A scorched plain where demons drag the damned into cinders.',                           '◬', 5,  12, 1.5, 1.4, 'normal',    2),
    ('hollow_cathedral',  'The Hollow Cathedral',    'God abandoned this place. What remains worships something far older.',                   '⛫', 10, 18, 2.2, 2.0, 'dangerous', 3),
    ('abyssal_rift',      'The Abyssal Rift',        'A tear in reality. Greater demons spill through, screaming.',                           '❂', 20, 25, 3.5, 3.2, 'dangerous', 4),
    ('throne_of_nothing', 'The Throne of Nothing',   'Where the world ends. The Sovereign sits and waits.',                                   '☠', 35, 40, 6.0, 5.0, 'lethal',    5),
    ('crimson_depths',    'The Crimson Depths',       'Subterranean lakes of blood feed creatures that have never seen light.',                '⚗', 15, 20, 2.8, 2.5, 'dangerous', 6),
    ('iron_wastes',       'The Iron Wastes',          'Rusted battlefields where ancient war machines still patrol, hunting the living.',      '⚙', 25, 30, 4.0, 3.8, 'dangerous', 7),
    ('void_spire',        'The Void Spire',           'A tower that pierces dimensions. Reality frays with every step upward.',                '⚶', 40, 50, 8.0, 7.0, 'lethal',    8)
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log('[OK] 8 zones');


  // ══════════════════════════════════════════════════════════════════
  //  2. MONSTERS — Enemies per zone
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 2. MONSTERS ═══');
  await client.query(`
    INSERT INTO monsters (name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier, is_boss, xp_reward, gold_reward) VALUES
    -- Bone Crypts (Lv 1)
    ('Skeletal Archer',       'bone_crypts',  35,   8,   2,  0.05, 'COMMON',    false, 15,  8),
    ('Lich Initiate',         'bone_crypts',  45,  12,   3,  0.03, 'COMMON',    false, 20, 12),
    ('Grave Shambler',        'bone_crypts',  55,   7,   5,  0.02, 'UNCOMMON',  false, 25, 15),
    ('The Crypt Warden',      'bone_crypts', 180,  18,   8,  0.05, 'BOSS',      true,  80, 60),

    -- Ashen Wastes (Lv 5)
    ('Ash Wraith',            'ashen_wastes',  60,  18,   4,  0.10, 'COMMON',    false, 30, 20),
    ('Cinder Golem',          'ashen_wastes', 100,  10,  12,  0.02, 'COMMON',    false, 35, 25),
    ('Smoldering Fiend',      'ashen_wastes',  75,  22,   5,  0.08, 'UNCOMMON',  false, 40, 30),
    ('The Ember Sovereign',   'ashen_wastes', 280,  28,  10,  0.05, 'BOSS',      true, 120, 90),
    ('Ashen Colossus',        'ashen_wastes', 350,  22,  18,  0.03, 'BOSS',      true, 150,110),

    -- Hollow Cathedral (Lv 10)
    ('Fallen Paladin',        'hollow_cathedral', 110, 25,  8,  0.05, 'COMMON',   false, 55, 40),
    ('Soul Reaper',           'hollow_cathedral',  90, 30,  5,  0.12, 'UNCOMMON', false, 60, 45),
    ('Void Acolyte',          'hollow_cathedral', 130, 20, 10,  0.06, 'UNCOMMON', false, 65, 50),
    ('The Nameless Sovereign','hollow_cathedral', 500, 40, 15,  0.08, 'BOSS',     true, 250,180),
    ('High Priest of Nothing','hollow_cathedral', 450, 45, 12,  0.10, 'BOSS',     true, 280,200),

    -- Abyssal Rift (Lv 20)
    ('Void Stalker',          'abyssal_rift', 180, 38,  10, 0.15, 'UNCOMMON', false, 90,  65),
    ('Greater Demon',         'abyssal_rift', 220, 42,  14, 0.08, 'RARE',     false, 100, 75),
    ('Rift Horror',           'abyssal_rift', 160, 50,   8, 0.20, 'RARE',     false, 110, 80),
    ('Warden of the Abyss',   'abyssal_rift', 800, 60,  20, 0.10, 'BOSS',     true, 500, 350),
    ('The Eternal Devourer',  'abyssal_rift',1000, 55,  25, 0.08, 'BOSS',     true, 600, 400),

    -- Throne of Nothing (Lv 35)
    ('Death Aspect',          'throne_of_nothing', 300, 60,  18, 0.10, 'RARE',      false, 180, 130),
    ('Void Incarnate',        'throne_of_nothing', 280, 70,  15, 0.15, 'ELITE',     false, 200, 150),
    ('The Throne Sovereign',  'throne_of_nothing',2000, 90,  35, 0.12, 'BOSS',      true, 1200, 800),

    -- Crimson Depths (Lv 15)
    ('Blood Lurker',          'crimson_depths', 120, 28,   8, 0.12, 'COMMON',   false,  70,  50),
    ('Sanguine Leech',        'crimson_depths',  80, 35,   4, 0.18, 'UNCOMMON', false,  75,  55),
    ('Crimson Behemoth',      'crimson_depths', 160, 22,  15, 0.04, 'UNCOMMON', false,  80,  60),
    ('The Blood Matriarch',   'crimson_depths', 600, 48,  18, 0.08, 'BOSS',     true,  350, 250),

    -- Iron Wastes (Lv 25)
    ('Rusted Sentinel',       'iron_wastes', 250, 45,  22, 0.03, 'UNCOMMON', false, 120,  90),
    ('Scrap Harvester',       'iron_wastes', 180, 55,  12, 0.10, 'RARE',     false, 130, 100),
    ('War Machine Alpha',     'iron_wastes', 320, 38,  28, 0.02, 'RARE',     false, 140, 110),
    ('The Iron Tyrant',       'iron_wastes',1200, 70,  30, 0.06, 'BOSS',     true,  700, 500),

    -- Void Spire (Lv 40)
    ('Dimensional Wraith',    'void_spire', 350, 75,  20, 0.18, 'RARE',      false, 250, 180),
    ('Reality Fracture',      'void_spire', 400, 80,  25, 0.12, 'ELITE',     false, 280, 200),
    ('Entropy Weaver',        'void_spire', 300, 90,  15, 0.22, 'ELITE',     false, 300, 220),
    ('The Architect of Ruin', 'void_spire',3000,110,  40, 0.10, 'BOSS',      true, 2000,1500)
    ON CONFLICT DO NOTHING;
  `);
  const monsterCount = await client.query('SELECT COUNT(*) FROM monsters');
  console.log(`[OK] ${monsterCount.rows[0].count} monsters`);


  // ══════════════════════════════════════════════════════════════════
  //  3. ITEMS — Full item catalog
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 3. ITEMS ═══');
  await client.query(`
    INSERT INTO items (key, name, type, slot, tier, description, base_stats, buy_price, sell_price, level_required, drop_weight, min_zone_level, is_stackable, is_craftable) VALUES
    -- === WEAPONS ===
    ('bone_shard_dagger',     'Bone Shard Dagger',          'WEAPON', 'mainHand', 'COMMON',    'A crude blade fashioned from crypt bones.',            '{"dmg": 6}',   80,  20,  1, 80, 1, false, false),
    ('cinderforged_blade',    'Cinderforged Blade',          'WEAPON', 'mainHand', 'UNCOMMON',  'Forged in the eternal ash fires.',                     '{"dmg": 14}',  250, 60,  5, 50, 2, false, false),
    ('heretics_warblade',     'Heretic''s Warblade',         'WEAPON', 'mainHand', 'RARE',      'Once wielded by paladins who lost their faith.',        '{"dmg": 24}',  600, 150, 10, 30, 3, false, false),
    ('rift_torn_executioner', 'Rift-Torn Executioner',       'WEAPON', 'mainHand', 'EPIC',      'The blade phases between dimensions.',                 '{"dmg": 38}', 1500, 375, 20, 15, 4, false, false),
    ('sovereigns_edge',       'The Sovereign''s Edge',       'WEAPON', 'mainHand', 'LEGENDARY', 'The final blade. It hungers for a throne.',            '{"dmg": 60}', 5000,1250, 35,  5, 5, false, false),
    ('bloodforged_cleaver',   'Bloodforged Cleaver',         'WEAPON', 'mainHand', 'RARE',      'Drinks deeply from every wound it inflicts.',          '{"dmg": 20, "lifesteal": 3}', 800, 200, 12, 25, 3, false, true),
    ('void_reaper',           'Void Reaper',                 'WEAPON', 'mainHand', 'EPIC',      'Cuts through armor as if it were air.',                '{"dmg": 42, "crit": 5}', 2000, 500, 25, 10, 4, false, false),
    ('entropy_blade',         'Entropy Blade',               'WEAPON', 'mainHand', 'MYTHIC',    'Reality unravels where this blade strikes.',           '{"dmg": 75, "crit": 8, "lifesteal": 5}', 10000, 2500, 40, 2, 5, false, false),
    ('iron_mace',             'Iron Mace',                   'WEAPON', 'mainHand', 'COMMON',    'Heavy and reliable. Crunches bones nicely.',           '{"dmg": 8}', 100, 25, 1, 90, 1, false, false),
    ('shadow_dagger',         'Shadow Dagger',               'WEAPON', 'offHand',  'UNCOMMON',  'A quick offhand blade that finds gaps in armor.',      '{"dmg": 8, "crit": 3}', 200, 50, 5, 40, 2, false, false),

    -- === ARMOR ===
    ('dusty_burial_shroud',   'Dusty Burial Shroud',         'ARMOR',  'body',     'COMMON',    'Offers meager protection. Smells of death.',           '{"def": 4, "hp": 20}',   60,  15,  1, 80, 1, false, false),
    ('ashen_aegis',           'Ashen Aegis',                 'ARMOR',  'body',     'UNCOMMON',  'Hardened in volcanic heat.',                           '{"def": 8, "hp": 40}',  300,  75,  5, 50, 2, false, false),
    ('sanctified_bone_plate', 'Sanctified Bone Plate',       'ARMOR',  'body',     'RARE',      'Blessed by a dead god, then cursed by a living one.', '{"def": 14, "hp": 70}',  700, 175, 10, 30, 3, false, false),
    ('abyssal_carapace',      'Abyssal Carapace',            'ARMOR',  'body',     'EPIC',      'Grown from the chitin of rift creatures.',             '{"def": 22, "hp": 110}',1800, 450, 20, 15, 4, false, false),
    ('crown_eternal_night',   'Crown of Eternal Night',      'ARMOR',  'head',     'LEGENDARY', 'The final crown. It weighs more than kingdoms.',       '{"def": 30, "hp": 200, "maxMana": 50}', 6000, 1500, 35, 5, 5, false, false),
    ('leather_coif',          'Leather Coif',                'ARMOR',  'head',     'COMMON',    'Simple leather head protection.',                      '{"def": 2, "hp": 10}', 40, 10, 1, 85, 1, false, false),
    ('iron_helm',             'Iron Helm',                   'ARMOR',  'head',     'UNCOMMON',  'Solid iron. Keeps your brains inside your skull.',     '{"def": 6, "hp": 25}', 180, 45, 5, 55, 2, false, false),
    ('dreadplate_greaves',    'Dreadplate Greaves',          'ARMOR',  'boots',    'RARE',      'Heavy boots that shake the earth with each step.',     '{"def": 10, "hp": 35}', 500, 125, 10, 35, 3, false, true),
    ('void_treads',           'Void Treads',                 'ARMOR',  'boots',    'EPIC',      'Leave no footprints. Leave no trace.',                 '{"def": 16, "hp": 50, "crit": 3}', 1200, 300, 20, 12, 4, false, false),
    ('crimson_mail',          'Crimson Mail',                'ARMOR',  'body',     'RARE',      'Woven from bloodsteel threads. Self-repairing.',       '{"def": 12, "hp": 60, "lifesteal": 2}', 650, 160, 15, 28, 3, false, true),

    -- === ACCESSORIES ===
    ('bone_ring',             'Bone Ring',                   'ACCESSORY', 'ring',   'COMMON',   'A crude ring carved from a finger bone.',              '{"hp": 5, "crit": 1}', 50, 12, 1, 70, 1, false, false),
    ('ember_band',            'Ember Band',                  'ACCESSORY', 'ring',   'UNCOMMON', 'Warm to the touch. Never cools.',                      '{"hp": 15, "crit": 3, "dmg": 2}', 200, 50, 5, 40, 2, false, false),
    ('soul_amulet',           'Soul Amulet',                 'ACCESSORY', 'amulet', 'RARE',     'Contains a trapped soul that whispers dark secrets.',  '{"maxMana": 30, "magicDmg": 8}', 550, 140, 10, 25, 3, false, false),
    ('void_signet',           'Void Signet',                 'ACCESSORY', 'ring',   'EPIC',     'Phase through attacks. Sometimes.',                    '{"hp": 30, "crit": 6, "def": 5}', 1400, 350, 20, 10, 4, false, false),
    ('sovereign_amulet',      'Sovereign''s Pendant',        'ACCESSORY', 'amulet', 'LEGENDARY','Grants authority over lesser beings.',                 '{"hp": 50, "maxMana": 60, "magicDmg": 15, "crit": 5}', 5500, 1375, 35, 3, 5, false, false),

    -- === CONSUMABLES ===
    ('minor_health_flask',    'Minor Health Flask',          'CONSUMABLE', NULL,     'COMMON',   'Restores 50 HP.',                                     '{"restore_hp": 50}', 30, 8, 1, 100, 1, true, true),
    ('health_flask',          'Health Flask',                'CONSUMABLE', NULL,     'UNCOMMON', 'Restores 120 HP.',                                    '{"restore_hp": 120}', 80, 20, 5, 60, 2, true, true),
    ('greater_health_flask',  'Greater Health Flask',        'CONSUMABLE', NULL,     'RARE',     'Restores 250 HP.',                                    '{"restore_hp": 250}', 200, 50, 15, 30, 3, true, true),
    ('mana_potion',           'Mana Potion',                 'CONSUMABLE', NULL,     'UNCOMMON', 'Restores 40 Mana.',                                   '{"restore_mana": 40}', 60, 15, 5, 50, 2, true, true),
    ('essence_vial',          'Essence Vial',                'CONSUMABLE', NULL,     'RARE',     'Restores 25 Blood Essence.',                          '{"restore_essence": 25}', 150, 38, 10, 25, 3, true, true),
    ('elixir_of_fury',        'Elixir of Fury',             'CONSUMABLE', NULL,     'EPIC',     'Increases damage by 20% for 5 combats.',              '{"buff_dmg_pct": 20, "buff_duration": 5}', 500, 125, 15, 12, 3, true, true),

    -- === MATERIALS (stackable, for crafting) ===
    ('rusty_scrap',           'Rusty Scrap',                 'MATERIAL', NULL,      'COMMON',   'Might be useful for crafting.',                        '{}', 5, 2, 1, 100, 1, true, false),
    ('charred_bone',          'Charred Bone',                'MATERIAL', NULL,      'COMMON',   'A remnant of a lost soul.',                            '{}', 8, 3, 1, 90, 1, true, false),
    ('demon_fang',            'Demon Fang',                  'MATERIAL', NULL,      'UNCOMMON', 'Sharp and corrupted.',                                 '{}', 25, 8, 5, 50, 2, true, false),
    ('grave_silk',            'Grave Silk',                  'MATERIAL', NULL,      'UNCOMMON', 'Woven with dark intent.',                              '{}', 30, 10, 5, 45, 2, true, false),
    ('ancient_core',          'Ancient Core',                'MATERIAL', NULL,      'RARE',     'Power source from an old age.',                        '{}', 100, 30, 10, 20, 3, true, false),
    ('vampiric_bloodlet',     'Vampiric Bloodlet',           'MATERIAL', NULL,      'RARE',     'Pulsing with dark energy.',                            '{}', 120, 35, 10, 15, 3, true, false),
    ('pure_void_essence',     'Pure Void Essence',           'MATERIAL', NULL,      'EPIC',     'Raw creation material.',                               '{}', 500, 150, 20, 5, 4, true, false),
    ('iron_ore',              'Iron Ore',                    'MATERIAL', NULL,      'COMMON',   'Rough iron ore. Can be smelted.',                      '{}', 10, 3, 1, 100, 1, true, false),
    ('blood_crystal',         'Blood Crystal',               'MATERIAL', NULL,      'RARE',     'Crystallized blood with magical properties.',          '{}', 80, 25, 10, 18, 3, true, false),
    ('void_fragment',         'Void Fragment',               'MATERIAL', NULL,      'EPIC',     'A shard of collapsed reality.',                        '{}', 400, 120, 25, 6, 4, true, false),
    ('celestial_dust',        'Celestial Dust',              'MATERIAL', NULL,      'LEGENDARY','Stardust from the before-times.',                      '{}', 1500, 450, 35, 2, 5, true, false),

    -- === TOMES ===
    ('tome_inferno',          'Tome of Inferno',             'TOME', NULL, 'LEGENDARY', 'Unlocks Inferno Strike: Deal 2x damage, costs 30 Mana.',     '{"ability": "inferno_strike", "mana_cost": 30, "damage_multi": 2.0}', NULL, 2000, 20, 2, 4, false, false),
    ('tome_resurrection',     'Tome of Resurrection',        'TOME', NULL, 'LEGENDARY', 'On death, revive once with 50% HP.',                          '{"ability": "resurrection", "passive": true, "revive_hp_pct": 50}', NULL, 3000, 25, 1, 5, false, false),
    ('tome_void_walk',        'Tome of Void Walk',           'TOME', NULL, 'MYTHIC',    'Unlocks Void Walk: Skip enemy turn, costs 50 Mana.',          '{"ability": "void_walk", "mana_cost": 50, "skip_turn": true}', NULL, 5000, 30, 1, 5, false, false),
    ('tome_blood_pact',       'Tome of the Blood Pact',      'TOME', NULL, 'EPIC',     '+5 permanent Base Damage.',                                   '{"passive": true, "flat_dmg": 5}', NULL, 1000, 15, 5, 3, false, false),
    ('tome_iron_will',        'Tome of Iron Will',           'TOME', NULL, 'EPIC',      '+30 permanent Max HP.',                                       '{"passive": true, "flat_hp": 30}', NULL, 1000, 15, 4, 3, false, false),
    ('tome_essence_mastery',  'Tome of Essence Mastery',     'TOME', NULL, 'RARE',      '+20 Max Blood Essence permanently.',                          '{"passive": true, "flat_essence": 20}', NULL, 600, 10, 8, 3, false, false)
    ON CONFLICT (key) DO NOTHING;
  `);
  const itemCount = await client.query('SELECT COUNT(*) FROM items');
  console.log(`[OK] ${itemCount.rows[0].count} items`);


  // ══════════════════════════════════════════════════════════════════
  //  4. NPCs — Town inhabitants
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 4. NPCs ═══');
  await client.query(`
    INSERT INTO npcs (key, name, role, description, icon, dialogue) VALUES
    ('healer_mara',     'Sister Mara',        'healer',       'A blind seer who mends flesh with whispered prayers.',     '✚', '{"greeting": "Your wounds cry out. Let me silence them.", "heal": "The blood obeys. You are whole again.", "full_hp": "You carry no wounds. Go make some."}'),
    ('smith_vorn',      'Vorn the Shattered',  'blacksmith',   'A demon-scarred smith. His hammer rings with old fury.',   '⚒', '{"greeting": "Steel speaks louder than gods. What needs breaking?", "enhance_success": "The metal remembers its purpose.", "enhance_fail": "Even good steel can shatter."}'),
    ('banker_nyx',      'Nyx, the Pale Clerk', 'banker',       'Counts coins in a vault built from bones.',                '⚖', '{"greeting": "Your gold is safe with the dead. How much do you trust us?", "deposit": "Stored. The vault remembers.", "withdraw": "Returned. Spend it before it spends you."}'),
    ('merchant_kael',   'Kael Duskmantle',     'merchant',     'Trades in artifacts dragged from the abyss.',             '⚗', '{"greeting": "I sell what the dead no longer need. Browse carefully.", "buy": "A fine choice. May it serve you better than its last owner.", "insufficient": "Come back when your pockets are heavier."}'),
    ('gambler_raze',    'Raze the Lucky',      'gambler',      'Grins too wide. Wins too often. Never loses his own coin.','⚄', '{"greeting": "Feeling lucky? The bones never lie... much.", "win": "Ha! Fortune favors the bold!", "lose": "The bones take what the bones want."}'),
    ('arena_thane',     'Thane Bloodborn',     'arena_master', 'Rules the arena. His word is law, his fist is justice.',   '⚔', '{"greeting": "The arena hungers. Will you feed it?", "victory": "Another skull for the throne.", "defeat": "Get up. Death is too easy."}'),
    ('quest_elder',     'Elder Wraithcall',    'quest_giver',  'Speaks to the dead and gives their final wishes to the living.', '⚛', '{"greeting": "The dead have requests. Will you listen?", "quest_accepted": "The spirits mark you. Do not fail them."}'),
    ('trainer_ash',     'Ashira the Forsworn', 'trainer',      'Once a paladin. Now teaches dark arts to those brave enough to learn.', '⚝', '{"greeting": "Knowledge is pain. Are you ready to learn?", "skill_up": "Your power grows. Use it wisely."}')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('[OK] 8 NPCs');


  // ══════════════════════════════════════════════════════════════════
  //  5. NPC SHOP INVENTORY — What the merchant sells
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 5. NPC SHOP INVENTORY ═══');
  await client.query(`
    INSERT INTO npc_shop_inventory (npc_id, item_id, stock, sort_order)
    SELECT n.id, i.id, NULL, ROW_NUMBER() OVER (ORDER BY i.level_required, i.buy_price)
    FROM npcs n
    CROSS JOIN items i
    WHERE n.key = 'merchant_kael'
      AND i.type IN ('WEAPON', 'ARMOR', 'ACCESSORY')
      AND i.buy_price IS NOT NULL
    ON CONFLICT (npc_id, item_id) DO NOTHING;
  `);
  // Healer sells consumables
  await client.query(`
    INSERT INTO npc_shop_inventory (npc_id, item_id, stock, sort_order)
    SELECT n.id, i.id, NULL, ROW_NUMBER() OVER (ORDER BY i.level_required, i.buy_price)
    FROM npcs n
    CROSS JOIN items i
    WHERE n.key = 'healer_mara'
      AND i.type = 'CONSUMABLE'
      AND i.buy_price IS NOT NULL
    ON CONFLICT (npc_id, item_id) DO NOTHING;
  `);
  const shopCount = await client.query('SELECT COUNT(*) FROM npc_shop_inventory');
  console.log(`[OK] ${shopCount.rows[0].count} shop listings`);


  // ══════════════════════════════════════════════════════════════════
  //  6. QUESTS — Story quests, dailies, bounties
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 6. QUESTS ═══');
  await client.query(`
    INSERT INTO quests (key, title, description, type, icon, objective_type, objective_target, reward_gold, reward_xp, level_required, difficulty, zone_id, is_repeatable, sort_order) VALUES
    -- Story Quests (one-time, sequential)
    ('story_first_blood',     'First Blood',              'Prove yourself. Kill your first enemy in the Bone Crypts.',           'STORY',  '⚔', 'KILL_ENEMIES',    1,    50,   30,  1, 'easy',   'bone_crypts',       false, 1),
    ('story_crypt_cleared',   'Crypt Warden''s Demise',   'Defeat the Crypt Warden, guardian of the Bone Crypts.',              'STORY',  '☠', 'KILL_BOSS',       1,   200,  100,  3, 'normal', 'bone_crypts',       false, 2),
    ('story_ashen_journey',   'Into the Ashes',           'Venture into the Ashen Wastes and survive 3 encounters.',            'STORY',  '◬', 'KILL_ENEMIES',    3,   400,  200,  5, 'normal', 'ashen_wastes',      false, 3),
    ('story_ember_fallen',    'Fall of the Ember Sovereign','Defeat the Ember Sovereign to claim dominion over the Wastes.',     'STORY',  '♛', 'KILL_BOSS',       1,   800,  400, 8, 'hard',   'ashen_wastes',      false, 4),
    ('story_cathedral_gates', 'The Hollow Gates',         'Enter the Hollow Cathedral and face what lurks within.',              'STORY',  '⛫', 'KILL_ENEMIES',    5,  1000,  500, 10, 'normal', 'hollow_cathedral', false, 5),
    ('story_nameless_one',    'The Nameless One',          'Confront the Nameless Sovereign deep within the Cathedral.',         'STORY',  '❂', 'KILL_BOSS',       1,  2500, 1200, 15, 'hard',   'hollow_cathedral', false, 6),
    ('story_rift_breaker',    'Rift Breaker',             'Seal the Abyssal Rift by destroying the Warden.',                     'STORY',  '✦', 'KILL_BOSS',       1,  5000, 2500, 25, 'elite',  'abyssal_rift',     false, 7),
    ('story_final_throne',    'The Final Throne',         'Face the Throne Sovereign. End this.',                                'STORY',  '☠', 'KILL_BOSS',       1, 10000, 5000, 35, 'elite',  'throne_of_nothing',false, 8),

    -- Daily Quests (repeatable)
    ('daily_blood_harvest',   'Blood Harvest',            'Slay 5 enemies in any zone.',                                        'DAILY',  '⚔', 'KILL_ENEMIES',    5,   200,   80,  1, 'easy',   NULL, true, 1),
    ('daily_dark_tithe',      'Dark Tithe',               'Loot 150 Gold from combat.',                                         'DAILY',  '¤', 'GOLD_EARNED',   150,   300,  100,  1, 'easy',   NULL, true, 2),
    ('daily_dungeon_crawler', 'Dungeon Crawler',          'Complete any dungeon run.',                                           'DAILY',  '⛫', 'COMPLETE_DUNGEON', 1,  400,  150,  5, 'normal', NULL, true, 3),
    ('daily_forge_master',    'Forge Master',             'Successfully enhance any item.',                                      'DAILY',  '⚒', 'ENHANCE_ITEM',    1,   250,  100,  5, 'normal', NULL, true, 4),
    ('daily_arena_blood',     'Arena Blood',              'Win a PvP match.',                                                    'DAILY',  '⚔', 'PVP_WIN',         1,   350,  120, 10, 'normal', NULL, true, 5),

    -- Weekly Quests
    ('weekly_boss_slayer',    'Boss Slayer',              'Defeat 3 bosses in any zone.',                                        'WEEKLY', '♛', 'KILL_BOSS',       3,  1000,  500, 5, 'hard',   NULL, true, 1),
    ('weekly_gatherer',       'Master Gatherer',          'Gather 50 resources from any nodes.',                                 'WEEKLY', '⚗', 'GATHER_RESOURCES',50,  800,  400, 5, 'normal', NULL, true, 2),
    ('weekly_merchant_king',  'Merchant King',            'Sell 10 items on the auction house.',                                 'WEEKLY', '⚖', 'AUCTION_SELL',   10,  1500,  600,10, 'normal', NULL, true, 3),

    -- Bounties (one-time, harder)
    ('bounty_colossus',       'The Ashen Colossus',       'Hunt the Ashen Colossus. Bring proof of the kill.',                   'BOUNTY', '☠', 'KILL_BOSS',       1,  1500,  800, 8, 'hard',   'ashen_wastes',     false, 1),
    ('bounty_blood_matriarch','The Blood Mother',         'End the Blood Matriarch''s reign in the Crimson Depths.',              'BOUNTY', '☠', 'KILL_BOSS',       1,  3000, 1500, 18, 'elite', 'crimson_depths',   false, 2),
    ('bounty_iron_tyrant',    'The Iron Tyrant',          'Destroy the Iron Tyrant war machine.',                                'BOUNTY', '☠', 'KILL_BOSS',       1,  5000, 2500, 28, 'elite', 'iron_wastes',      false, 3),
    ('bounty_architect',      'The Architect of Ruin',    'Ascend the Void Spire and destroy the Architect.',                    'BOUNTY', '☠', 'KILL_BOSS',       1, 15000, 8000, 42, 'elite', 'void_spire',       false, 4)
    ON CONFLICT (key) DO NOTHING;
  `);
  const questCount = await client.query('SELECT COUNT(*) FROM quests');
  console.log(`[OK] ${questCount.rows[0].count} quests`);


  // ══════════════════════════════════════════════════════════════════
  //  7. CRAFTING RECIPES
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 7. CRAFTING RECIPES ═══');
  await client.query(`
    INSERT INTO crafting_recipes (key, name, description, category, ingredients, result_item_key, level_required, sort_order) VALUES
    ('craft_health_flask',     'Brew Health Flask',           'Combine bones and silk into a healing draught.',        'consumables', '[{"item_key":"charred_bone","qty":3},{"item_key":"grave_silk","qty":1}]',  'minor_health_flask', 1,  1),
    ('craft_greater_flask',    'Brew Greater Health Flask',   'A powerful healing concoction.',                        'consumables', '[{"item_key":"vampiric_bloodlet","qty":2},{"item_key":"ancient_core","qty":1}]', 'greater_health_flask', 15, 2),
    ('craft_mana_potion',      'Brew Mana Potion',           'Distill raw essence into liquid mana.',                 'consumables', '[{"item_key":"pure_void_essence","qty":1},{"item_key":"demon_fang","qty":2}]', 'mana_potion', 10, 3),
    ('craft_essence_vial',     'Brew Essence Vial',          'Concentrate blood crystals into pure essence.',         'consumables', '[{"item_key":"blood_crystal","qty":2},{"item_key":"grave_silk","qty":3}]', 'essence_vial', 12, 4),
    ('craft_bloodforged',      'Forge Bloodforged Cleaver',  'A blade that drinks deeply from every wound.',          'weapons',     '[{"item_key":"iron_ore","qty":10},{"item_key":"vampiric_bloodlet","qty":3},{"item_key":"demon_fang","qty":5}]', 'bloodforged_cleaver', 12, 5),
    ('craft_crimson_mail',     'Forge Crimson Mail',         'Bloodsteel armor that repairs itself.',                  'armor',       '[{"item_key":"iron_ore","qty":15},{"item_key":"blood_crystal","qty":3},{"item_key":"grave_silk","qty":8}]', 'crimson_mail', 15, 6),
    ('craft_dreadplate',       'Forge Dreadplate Greaves',   'Earth-shaking boots of dread.',                          'armor',       '[{"item_key":"iron_ore","qty":12},{"item_key":"ancient_core","qty":2},{"item_key":"charred_bone","qty":10}]', 'dreadplate_greaves', 10, 7),
    ('craft_elixir_fury',      'Brew Elixir of Fury',        'Unleash raw aggression in liquid form.',                 'consumables', '[{"item_key":"demon_fang","qty":3},{"item_key":"pure_void_essence","qty":1},{"item_key":"blood_crystal","qty":1}]', 'elixir_of_fury', 15, 8)
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('[OK] 8 crafting recipes');


  // ══════════════════════════════════════════════════════════════════
  //  8. ENHANCEMENT CONFIG — success curves +0 through +20
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 8. ENHANCEMENT CONFIG ═══');
  await client.query(`
    INSERT INTO enhancement_config (level, success_rate, gold_cost, break_chance, stat_multiplier) VALUES
    (0,  1.00,     0,  0.00, 1.00),
    (1,  0.95,   100,  0.00, 1.10),
    (2,  0.90,   200,  0.00, 1.20),
    (3,  0.85,   350,  0.00, 1.30),
    (4,  0.80,   500,  0.00, 1.40),
    (5,  0.75,   750,  0.00, 1.55),
    (6,  0.65,  1000,  0.05, 1.70),
    (7,  0.55,  1500,  0.08, 1.85),
    (8,  0.45,  2000,  0.10, 2.00),
    (9,  0.38,  3000,  0.12, 2.20),
    (10, 0.30,  4000,  0.15, 2.40),
    (11, 0.25,  5500,  0.18, 2.65),
    (12, 0.20,  7000,  0.22, 2.90),
    (13, 0.16,  9000,  0.25, 3.20),
    (14, 0.12, 12000,  0.30, 3.55),
    (15, 0.08, 15000,  0.35, 4.00),
    (16, 0.06, 20000,  0.40, 4.50),
    (17, 0.04, 28000,  0.45, 5.10),
    (18, 0.03, 40000,  0.50, 5.80),
    (19, 0.02, 60000,  0.55, 6.60),
    (20, 0.01,100000,  0.60, 7.50)
    ON CONFLICT (level) DO NOTHING;
  `);
  console.log('[OK] Enhancement curve (+0 to +20)');


  // ══════════════════════════════════════════════════════════════════
  //  9. DAILY LOGIN REWARDS — Day 1 through 28
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 9. DAILY LOGIN REWARDS ═══');
  await client.query(`
    INSERT INTO daily_login_rewards (day_number, reward_type, reward_data, is_milestone) VALUES
    (1,  'gold',     '{"amount": 100}',    false),
    (2,  'gold',     '{"amount": 150}',    false),
    (3,  'item',     '{"item_key": "minor_health_flask", "qty": 3}',  false),
    (4,  'gold',     '{"amount": 200}',    false),
    (5,  'gold',     '{"amount": 250}',    false),
    (6,  'item',     '{"item_key": "demon_fang", "qty": 2}',          false),
    (7,  'gold',     '{"amount": 500}',    true),
    (8,  'gold',     '{"amount": 200}',    false),
    (9,  'gold',     '{"amount": 250}',    false),
    (10, 'item',     '{"item_key": "ancient_core", "qty": 1}',        false),
    (11, 'gold',     '{"amount": 300}',    false),
    (12, 'gold',     '{"amount": 350}',    false),
    (13, 'item',     '{"item_key": "health_flask", "qty": 3}',        false),
    (14, 'gold',     '{"amount": 1000}',   true),
    (15, 'gold',     '{"amount": 350}',    false),
    (16, 'gold',     '{"amount": 400}',    false),
    (17, 'item',     '{"item_key": "blood_crystal", "qty": 2}',       false),
    (18, 'gold',     '{"amount": 450}',    false),
    (19, 'gold',     '{"amount": 500}',    false),
    (20, 'item',     '{"item_key": "vampiric_bloodlet", "qty": 2}',   false),
    (21, 'gold',     '{"amount": 2000}',   true),
    (22, 'gold',     '{"amount": 500}',    false),
    (23, 'gold',     '{"amount": 600}',    false),
    (24, 'item',     '{"item_key": "pure_void_essence", "qty": 1}',   false),
    (25, 'gold',     '{"amount": 700}',    false),
    (26, 'gold',     '{"amount": 800}',    false),
    (27, 'item',     '{"item_key": "void_fragment", "qty": 1}',       false),
    (28, 'gold',     '{"amount": 5000}',   true)
    ON CONFLICT (day_number) DO NOTHING;
  `);
  console.log('[OK] 28-day login rewards');


  // ══════════════════════════════════════════════════════════════════
  //  10. GATHERING NODES — Resource nodes per zone
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 10. GATHERING NODES ═══');
  await client.query(`
    INSERT INTO gathering_nodes (zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level) VALUES
    ('bone_crypts',       'ore',    'Bone-Crusted Iron Vein', 'COMMON',    300, 5, '{"iron_ore": {"min":1,"max":3}}',      1),
    ('bone_crypts',       'herb',   'Grave Moss',             'COMMON',    240, 4, '{"charred_bone": {"min":1,"max":2}}',   1),
    ('ashen_wastes',      'ore',    'Smoldering Ore Deposit', 'UNCOMMON',  360, 6, '{"iron_ore": {"min":2,"max":4}}',      3),
    ('ashen_wastes',      'herb',   'Cinder Bloom',           'UNCOMMON',  300, 5, '{"demon_fang": {"min":1,"max":2}}',    3),
    ('ashen_wastes',      'skin',   'Charred Hide',           'UNCOMMON',  420, 7, '{"grave_silk": {"min":1,"max":3}}',    4),
    ('hollow_cathedral',  'gem',    'Sanctified Crystal',     'RARE',      480, 8, '{"ancient_core": {"min":1,"max":1}}', 6),
    ('hollow_cathedral',  'herb',   'Voidbloom',              'RARE',      420, 7, '{"vampiric_bloodlet": {"min":1,"max":1}}', 7),
    ('crimson_depths',    'ore',    'Bloodstone Vein',        'RARE',      420, 7, '{"blood_crystal": {"min":1,"max":2}}', 5),
    ('crimson_depths',    'herb',   'Crimson Lotus',          'RARE',      360, 6, '{"vampiric_bloodlet": {"min":1,"max":2}}', 6),
    ('abyssal_rift',      'essence','Rift Essence Pool',      'EPIC',      600, 10,'{"pure_void_essence": {"min":1,"max":1}}', 8),
    ('abyssal_rift',      'gem',    'Void Crystal Cluster',   'EPIC',      540, 9, '{"void_fragment": {"min":1,"max":1}}',  9),
    ('iron_wastes',       'ore',    'Ancient War-Steel Node', 'EPIC',      480, 8, '{"iron_ore": {"min":3,"max":6}, "ancient_core": {"min":0,"max":1}}', 8),
    ('void_spire',        'essence','Dimensional Tear',       'LEGENDARY', 900, 12,'{"void_fragment": {"min":1,"max":2}, "celestial_dust": {"min":0,"max":1}}', 10),
    ('void_spire',        'gem',    'Reality Shard',          'LEGENDARY', 720, 10,'{"celestial_dust": {"min":1,"max":1}}', 10)
    ON CONFLICT DO NOTHING;
  `);
  console.log('[OK] 14 gathering nodes');


  // ══════════════════════════════════════════════════════════════════
  //  11. RATE LIMIT CONFIG
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 11. RATE LIMIT CONFIG ═══');
  await client.query(`
    INSERT INTO rate_limit_config (action, max_requests, window_seconds, description) VALUES
    ('login',           5,    60,  'Login attempts per minute'),
    ('register',        3,   300,  'Registration attempts per 5 min'),
    ('chat',           30,    60,  'Chat messages per minute'),
    ('shop_buy',       20,    60,  'Shop purchases per minute'),
    ('auction_list',   10,    60,  'Auction listings per minute'),
    ('combat',         60,    60,  'Combat actions per minute'),
    ('enhance',        20,    60,  'Enhancement attempts per minute'),
    ('craft',          15,    60,  'Crafting attempts per minute'),
    ('pvp',            10,    60,  'PvP challenges per minute'),
    ('casino',         30,    60,  'Casino bets per minute'),
    ('bank',           20,    60,  'Bank transactions per minute'),
    ('gather',         30,    60,  'Gathering attempts per minute'),
    ('quest',          20,    60,  'Quest actions per minute'),
    ('mail',           10,    60,  'Messages sent per minute')
    ON CONFLICT (action) DO NOTHING;
  `);
  console.log('[OK] 14 rate limit rules');


  // ══════════════════════════════════════════════════════════════════
  //  12. RESOURCE CONFIG
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 12. RESOURCE CONFIG ═══');
  await client.query(`
    INSERT INTO resource_config (resource_type, base_max, regen_seconds, regen_amount, max_scaling_stat, max_per_stat_point, max_per_level) VALUES
    ('essence',  100, 120, 1, 'int', 1.5, 0.75)
    ON CONFLICT (resource_type) DO NOTHING;
  `);
  console.log('[OK] resource config');


  // ══════════════════════════════════════════════════════════════════
  //  13. SERVER CONFIG — tunable game settings
  // ══════════════════════════════════════════════════════════════════
  console.log('\n═══ 13. SERVER CONFIG ═══');
  await client.query(`
    INSERT INTO server_config (key, value, description) VALUES
    ('xp_curve_base',       '100',                     'Base XP for level 2'),
    ('xp_curve_exponent',   '1.4',                     'XP curve exponential growth rate'),
    ('flask_heal_base',     '50',                      'Base HP restored per flask'),
    ('flask_max_base',      '3',                       'Starting flask count'),
    ('essence_regen_rate',  '0.5',                     'Essence per second'),
    ('pvp_elo_k_factor',    '32',                      'Elo K-factor for rating changes'),
    ('auction_fee_pct',     '5',                       'Auction house listing fee percentage'),
    ('auction_duration_hrs','48',                      'Default auction duration in hours'),
    ('bank_interest_daily', '0',                       'Daily interest rate on bank deposits'),
    ('max_inventory_size',  '100',                     'Maximum inventory slots per player'),
    ('death_gold_loss_pct', '10',                      'Percentage of gold lost on death'),
    ('party_max_size',       '4',                      'Maximum party size for dungeons'),
    ('coven_create_cost',  '5000',                     'Gold cost to create a coven'),
    ('name_change_cost',   '1000',                     'Gold cost for name change'),
    ('maintenance_mode',   'false',                    'Server maintenance flag')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('[OK] 15 server config entries');


  // ══════════════════════════════════════════════════════════════════
  //  FINAL REPORT
  // ══════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     BLACKWORLD — GAME CONTENT SEEDED                 ║');
  console.log('╠══════════════════════════════════════════════════════╣');

  const counts = [
    { table: 'zones',              label: 'Zones' },
    { table: 'monsters',           label: 'Monsters' },
    { table: 'items',              label: 'Items' },
    { table: 'npcs',               label: 'NPCs' },
    { table: 'npc_shop_inventory', label: 'Shop Listings' },
    { table: 'quests',             label: 'Quests' },
    { table: 'crafting_recipes',   label: 'Crafting Recipes' },
    { table: 'enhancement_config', label: 'Enhancement Levels' },
    { table: 'daily_login_rewards',label: 'Login Rewards' },
    { table: 'gathering_nodes',    label: 'Gathering Nodes' },
    { table: 'rate_limit_config',  label: 'Rate Limit Rules' },
    { table: 'resource_config',    label: 'Resource Config' },
    { table: 'server_config',      label: 'Server Config' },
  ];

  for (const { table, label } of counts) {
    const r = await client.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`║  ${label.padEnd(22)} ${String(r.rows[0].count).padStart(4)} rows${' '.repeat(22)}║`);
  }

  console.log('╚══════════════════════════════════════════════════════╝');

  await client.end();
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
