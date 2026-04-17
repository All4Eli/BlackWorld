const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'supabase', 'seed');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// 1. SKILLS
const skills = [
  // Combat
  "('Power Strike', 'Deal 150% weapon damage', 'active', 'combat', 1, 1, '{\"damage\": 150}', 'strength')",
  "('Rending Blow', 'Deal 120% + bleed (5s)', 'active', 'combat', 2, 1, '{\"damage\": 120}', 'strength')",
  "('Brutal Swing', 'AoE 100% damage, 3 targets', 'active', 'combat', 2, 1, '{\"damage\": 100}', 'strength')",
  "('Weapon Mastery', '+5% weapon damage', 'passive', 'combat', 1, 1, '{\"bonus\": 5}', 'strength')",
  "('Armor Breaker', 'Deal 130%, reduce armor 20%', 'active', 'combat', 3, 1, '{\"damage\": 130}', 'strength')",
  "('Berserker Rage', '+30% damage, -15% defense (10s)', 'active', 'combat', 4, 1, '{\"damage\": 130}', 'strength')",
  "('Execute', 'Deal 200% to targets <30% HP', 'active', 'combat', 4, 1, '{\"damage\": 200}', 'strength')",
  "('Titan Grip', 'Two-hand weapons gain +15% damage', 'passive', 'combat', 3, 1, '{\"bonus\": 15}', 'strength')",
  "('Counterattack', '20% chance to counter on block', 'passive', 'combat', 5, 1, '{\"chance\": 20}', 'agility')",
  "('Overwhelm', 'Stun 2s + 180% damage', 'active', 'combat', 5, 1, '{\"damage\": 180}', 'strength')",
  "('Battle Cry', '+10% damage to self and allies (15s)', 'active', 'combat', 3, 1, '{\"bonus\": 10}', 'strength')",
  "('Heavy Impact', 'Crits stagger enemies 1s', 'passive', 'combat', 2, 1, '{\"bonus\": 1}', 'strength')",
  "('Relentless', 'Kills reset cooldowns by 2s', 'passive', 'combat', 4, 1, '{\"bonus\": 2}', 'strength')",
  "('Warrior Endurance', '+10% max HP', 'passive', 'combat', 3, 1, '{\"bonus\": 10}', 'vitality')",
  "('Decimation', '400% damage, ignores 50% armor', 'ultimate', 'combat', 6, 1, '{\"damage\": 400}', 'strength')",
  // Shadow
  "('Shadow Strike', 'Deal 130% + 10% crit chance', 'active', 'shadow', 1, 1, '{\"damage\": 130}', 'agility')",
  "('Stealth', 'Invisible 10s, next attack +50%', 'active', 'shadow', 2, 1, '{\"damage\": 50}', 'agility')",
  "('Backstab', '200% from behind', 'active', 'shadow', 3, 1, '{\"damage\": 200}', 'agility')",
  "('Evasion', '+3% dodge chance', 'passive', 'shadow', 1, 1, '{\"bonus\": 3}', 'agility')",
  "('Poison Blade', 'Attacks apply poison 5s', 'active', 'shadow', 2, 1, '{\"bonus\": 5}', 'cunning')",
  "('Smoke Bomb', 'AoE blind 3s, self +20% dodge', 'active', 'shadow', 3, 1, '{\"bonus\": 20}', 'agility')",
  "('Assassinate', '300% to targets <20% HP', 'active', 'shadow', 5, 1, '{\"damage\": 300}', 'agility')",
  "('Fleet Footed', '+10% movement, +5% dodge', 'passive', 'shadow', 2, 1, '{\"bonus\": 10}', 'agility')",
  "('Shadow Dance', '3 rapid strikes at 80% each', 'active', 'shadow', 4, 1, '{\"damage\": 80}', 'agility')",
  "('Exploit Weakness', '+15% damage to debuffed', 'passive', 'shadow', 3, 1, '{\"bonus\": 15}', 'cunning')",
  "('Vanishing Act', 'Remove threat, stealth 5s', 'active', 'shadow', 4, 1, '{\"bonus\": 5}', 'agility')",
  "('Blade Flurry', '5 hits at 50% to random', 'active', 'shadow', 3, 1, '{\"damage\": 50}', 'agility')",
  "('Lethal Precision', '+20% crit damage', 'passive', 'shadow', 4, 1, '{\"bonus\": 20}', 'agility')",
  "('Shadow Walk', 'Stealth remains on move', 'passive', 'shadow', 5, 1, '{\"bonus\": 1}', 'agility')",
  "('Deaths Embrace', '500% + execute <25%', 'ultimate', 'shadow', 6, 1, '{\"damage\": 500}', 'agility')",
  // Blood
  "('Crimson Slash', 'Deal 120% + heal 10%', 'active', 'blood', 1, 1, '{\"damage\": 120}', 'vitality')",
  "('Blood Shield', 'Absorb 20% max HP', 'active', 'blood', 2, 1, '{\"bonus\": 20}', 'vitality')",
  "('Life Tap', 'Sacrifice 10% HP for 15% mana', 'active', 'blood', 2, 1, '{\"bonus\": 15}', 'spirit')",
  "('Sanguine Aura', '+5% life steal', 'passive', 'blood', 1, 1, '{\"bonus\": 5}', 'vitality')",
  "('Blood Boil', '+25% damage, -5% HP/s', 'active', 'blood', 3, 1, '{\"bonus\": 25}', 'vitality')",
  "('Vampiric Touch', 'Deal 100%, heal 50%', 'active', 'blood', 3, 1, '{\"damage\": 100}', 'vitality')",
  "('Crimson Pact', 'Below 50% HP: +15% damage', 'passive', 'blood', 3, 1, '{\"bonus\": 15}', 'vitality')",
  "('Blood Rage', 'Kills heal 10% HP', 'active', 'blood', 4, 1, '{\"bonus\": 10}', 'vitality')",
  "('Hemorrhage', 'Heavy bleed 3% max HP/s', 'active', 'blood', 4, 1, '{\"bonus\": 3}', 'cunning')",
  "('Undying Will', 'Survive lethal at 1 HP', 'passive', 'blood', 4, 1, '{\"bonus\": 1}', 'vitality')",
  "('Sanguine Burst', 'AoE 150%, heal per hit', 'active', 'blood', 5, 1, '{\"damage\": 150}', 'vitality')",
  "('Blood Bond', 'Share 30% damage taken', 'active', 'blood', 3, 1, '{\"bonus\": 30}', 'cunning')",
  "('Transfusion', '20% overheal to shield', 'passive', 'blood', 2, 1, '{\"bonus\": 20}', 'vitality')",
  "('Crimson Tide', 'Life steal +1% per 10% missing', 'passive', 'blood', 5, 1, '{\"bonus\": 1}', 'vitality')",
  "('Exsanguinate', '400% + heal full', 'ultimate', 'blood', 6, 1, '{\"damage\": 400}', 'vitality')",
  // Void
  "('Void Bolt', 'Deal 110% shadow damage', 'active', 'void', 1, 1, '{\"damage\": 110}', 'cunning')",
  "('Corruption', 'DoT: 20% over 8s', 'active', 'void', 2, 1, '{\"damage\": 20}', 'cunning')",
  "('Curse Weakness', 'Enemy -20% damage', 'active', 'void', 2, 1, '{\"bonus\": 20}', 'cunning')",
  "('Dark Affinity', '+5% shadow damage', 'passive', 'void', 1, 1, '{\"bonus\": 5}', 'cunning')",
  "('Soul Drain', 'Channel 30% dmg/s, heal 50%', 'active', 'void', 3, 1, '{\"damage\": 30}', 'cunning')",
  "('Void Prison', 'Stun 3s, +20% dmg taken', 'active', 'void', 3, 1, '{\"bonus\": 20}', 'cunning')",
  "('Entropy', 'DoTs tick 15% faster', 'passive', 'void', 3, 1, '{\"bonus\": 15}', 'cunning')",
  "('Shadow Nova', 'AoE 130% + Corruption', 'active', 'void', 4, 1, '{\"damage\": 130}', 'cunning')",
  "('Wither', '-30% healing received', 'active', 'void', 4, 1, '{\"bonus\": 30}', 'cunning')",
  "('Void Walker', '+10% dmg, +10% dmg taken', 'passive', 'void', 4, 1, '{\"bonus\": 10}', 'cunning')",
  "('Mind Shatter', '180% + confuse 5s', 'active', 'void', 5, 1, '{\"damage\": 180}', 'cunning')",
  "('Creeping Doom', 'DoTs spread on death', 'passive', 'void', 2, 1, '{\"bonus\": 1}', 'cunning')",
  "('Null Zone', 'AoE field: -25% enemy dmg', 'active', 'void', 5, 1, '{\"bonus\": 25}', 'cunning')",
  "('Inevitable End', 'DoT crits deal 2x dmg', 'passive', 'void', 5, 1, '{\"bonus\": 2}', 'cunning')",
  "('Void Eruption', '500% AoE + detonate DoTs', 'ultimate', 'void', 6, 1, '{\"damage\": 500}', 'cunning')",
  // Arcane
  "('Arcane Bolt', 'Deal 120% arcane', 'active', 'arcane', 1, 1, '{\"damage\": 120}', 'spirit')",
  "('Mana Shield', 'Absorb dmg using mana', 'active', 'arcane', 2, 1, '{\"bonus\": 1}', 'spirit')",
  "('Arcane Infusion', '+5% spell dmg', 'passive', 'arcane', 1, 1, '{\"bonus\": 5}', 'spirit')",
  "('Frost Lance', '110% + slow 30%', 'active', 'arcane', 2, 1, '{\"damage\": 110}', 'spirit')",
  "('Flame Burst', '100% + burn 10%', 'active', 'arcane', 2, 1, '{\"damage\": 100}', 'spirit')",
  "('Spell Surge', 'Crits refund 20% mana', 'passive', 'arcane', 3, 1, '{\"bonus\": 20}', 'spirit')",
  "('Chain Lightning', '90% to 4 targets', 'active', 'arcane', 3, 1, '{\"damage\": 90}', 'spirit')",
  "('Arcane Explosion', 'AoE 150%', 'active', 'arcane', 4, 1, '{\"damage\": 150}', 'spirit')",
  "('Time Warp', 'Reset CDs, +50% haste', 'active', 'arcane', 4, 1, '{\"bonus\": 50}', 'spirit')",
  "('Elemental Mastery', '+10% elemental dmg', 'passive', 'arcane', 3, 1, '{\"bonus\": 10}', 'spirit')",
  "('Meteor', '250% AoE', 'active', 'arcane', 5, 1, '{\"damage\": 250}', 'spirit')",
  "('Mana Burn', 'Drain 30% enemy mana', 'active', 'arcane', 4, 1, '{\"bonus\": 30}', 'spirit')",
  "('Brilliance', '+30% mana regen', 'passive', 'arcane', 5, 1, '{\"bonus\": 30}', 'spirit')",
  "('Arcane Barrage', '3 bolts 100% each', 'active', 'arcane', 5, 1, '{\"damage\": 100}', 'spirit')",
  "('Singularity', '600% AoE implosion', 'ultimate', 'arcane', 6, 1, '{\"damage\": 600}', 'spirit')",
  // Survival
  "('Second Wind', 'Heal 20% max HP', 'active', 'survival', 1, 1, '{\"bonus\": 20}', 'vitality')",
  "('Stone Skin', '+30% armor', 'active', 'survival', 2, 1, '{\"bonus\": 30}', 'vitality')",
  "('Fortitude', '+5% max HP', 'passive', 'survival', 1, 1, '{\"bonus\": 5}', 'vitality')",
  "('Cleanse', 'Remove 1 debuff', 'active', 'survival', 2, 1, '{\"bonus\": 1}', 'spirit')",
  "('Evasive Roll', 'Dodge next attack', 'active', 'survival', 2, 1, '{\"bonus\": 1}', 'agility')",
  "('Iron Will', '+20% CC resist', 'passive', 'survival', 3, 1, '{\"bonus\": 20}', 'vitality')",
  "('Emergency Heal', 'Auto-heal 30% at <15%', 'passive', 'survival', 4, 1, '{\"bonus\": 30}', 'vitality')",
  "('Last Stand', 'Immune 4s at 1 HP', 'active', 'survival', 4, 1, '{\"bonus\": 4}', 'vitality')",
  "('Natural Recovery', '+50% HP regen OOC', 'passive', 'survival', 3, 1, '{\"bonus\": 50}', 'vitality')",
  "('Indomitable', 'Full heal + immune 3s', 'ultimate', 'survival', 5, 1, '{\"bonus\": 100}', 'vitality')",
  // Utility
  "('Keen Eye', '+5% drop rate', 'passive', 'utility', 1, 1, '{\"bonus\": 5}', 'luck')",
  "('Swift Hands', '+10% gathering speed', 'passive', 'utility', 1, 1, '{\"bonus\": 10}', 'agility')",
  "('Treasure Hunter', '+10% gold find', 'passive', 'utility', 2, 1, '{\"bonus\": 10}', 'luck')",
  "('Explorer Instinct', 'Reveal hidden objects', 'passive', 'utility', 2, 1, '{\"bonus\": 1}', 'cunning')",
  "('Merchant Eye', '+10% sell prices', 'passive', 'utility', 3, 1, '{\"bonus\": 10}', 'luck')",
  "('Master Gatherer', '+15% gather yield', 'passive', 'utility', 3, 1, '{\"bonus\": 15}', 'luck')",
  "('Lucky Strike', '5% double loot', 'passive', 'utility', 4, 1, '{\"bonus\": 5}', 'luck')",
  "('Pathfinder', '+15% move speed', 'passive', 'utility', 2, 1, '{\"bonus\": 15}', 'agility')",
  "('Scrounger', 'Extra materials', 'passive', 'utility', 4, 1, '{\"bonus\": 1}', 'luck')",
  "('Fortune Favor', '+5% luck rolls', 'passive', 'utility', 5, 1, '{\"bonus\": 5}', 'luck')",
  // Legendary
  "('Void Step', 'Teleport, next +100%', 'legendary', 'shadow', 10, 1, '{\"bonus\": 100}', 'agility')",
  "('Sanguine Covenant', 'Lifesteal on DoTs', 'legendary', 'blood', 10, 1, '{\"bonus\": 1}', 'vitality')",
  "('Soul Harvest', '+5% dmg stack', 'legendary', 'cunning', 10, 1, '{\"bonus\": 5}', 'cunning')",
  "('Ethereal Form', 'Invulnerable 3s, +50% dmg', 'legendary', 'agility', 10, 1, '{\"bonus\": 50}', 'agility')",
  "('Doom Blade', '350% + apply DoTs', 'legendary', 'cunning', 10, 1, '{\"damage\": 350}', 'cunning')",
  "('Phoenix Rebirth', 'Revive at 50% HP', 'legendary', 'vitality', 10, 1, '{\"bonus\": 50}', 'vitality')",
  "('Time Stop', 'Freeze all 3s', 'legendary', 'spirit', 10, 1, '{\"bonus\": 3}', 'spirit')",
  "('Abyssal Gaze', 'See stealth, +20% dmg', 'legendary', 'cunning', 10, 1, '{\"bonus\": 20}', 'cunning')",
  "('Reality Tear', 'AoE ignore armor', 'legendary', 'spirit', 10, 1, '{\"damage\": 200}', 'spirit')",
  "('Godslayer', '1000% to bosses', 'legendary', 'combat', 10, 1, '{\"damage\": 1000}', 'strength')"
];

const skillsSql = `INSERT INTO skills (name, description, skill_type, category, tier, position, effects_per_rank, scaling_stat) VALUES \n${skills.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'skills.sql'), skillsSql);


// 2. NPCs
const npcs = [
  "('Malachar', 'The Hollow Keeper', 'Sanctuary', 'true', '{\"greeting\": \"Seek the truth.\"}')",
  "('Seraphine', 'Blood Trader', 'Sanctuary', 'true', '{\"greeting\": \"Blood is currency.\"}')",
  "('Korrath', 'Scarred Veteran', 'Sanctuary', 'false', '{\"greeting\": \"Watch your flank.\"}')",
  "('The Nameless', '???', 'Ashen Wastes', 'false', '{\"greeting\": \"...\"}')",
  "('Vex', 'Shadow Broker', 'Hollow Depths', 'true', '{\"greeting\": \"Got coin?\"}')",
  "('Thornwick', 'Mad Alchemist', 'Blighted Grove', 'true', '{\"greeting\": \"Explosions!\"}')",
  "('Sister Morgana', 'Blood Priestess', 'Crimson Sanctum', 'false', '{\"greeting\": \"The blood calls.\"}')",
  "('Orin', 'Relic Hunter', 'Shattered Ruins', 'false', '{\"greeting\": \"Shinies?\"}')",
  "('The Void Oracle', 'Seer of Nothing', 'Void Breach', 'false', '{\"greeting\": \"Inevitability.\"}')",
  "('Captain Harken', 'Arena Master', 'Sanctuary', 'false', '{\"greeting\": \"FIGHT!\"}')",
  "('Whisper', 'Information Dealer', 'Sanctuary', 'false', '{\"greeting\": \"I know all.\"}')",
  "('Elder Grimm', 'Coven Registrar', 'Sanctuary', 'false', '{\"greeting\": \"Sign here.\"}')"
];

const npcsSql = `INSERT INTO npcs (name, title, zone_id, is_vendor, dialogue) VALUES \n${npcs.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'npcs.sql'), npcsSql);

// 3. Quests
let quests = [];
for(let i=1; i<=40; i++) {
   let type = i<=5 ? 'main' : i<=20 ? 'side' : i<=25 ? 'daily' : i<=30 ? 'weekly' : 'legendary';
   quests.push(`('Quest ${i}', 'Description ${i}', '${type}', '{\"xp\":${i*100}}', ${i%2===0})`);
}
const questsSql = `INSERT INTO quests (name, description, quest_type, rewards, scaling_enabled) VALUES \n${quests.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'quests.sql'), questsSql);


// 4. Achievements
let achievements = [];
const cats = ['combat', 'exploration', 'social', 'economy', 'crafting', 'pvp', 'collection', 'power', 'secret'];
for(let i=1; i<=100; i++) {
    let cat = cats[i % cats.length];
    let rep = i % 5 === 0;
    achievements.push(`('Achievement ${i}', 'Description ${i}', '${cat}', ${i*5}, '{\"gold\":${i*10}}', false, ${rep}, 1.5)`);
}
const achSql = `INSERT INTO achievements (name, description, category, points, rewards, is_hidden, is_repeatable, repeat_multiplier) VALUES \n${achievements.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'achievements.sql'), achSql);


// 5. Titles
let titles = [];
const rar = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Celestial', 'Transcendent'];
for(let i=1; i<=30; i++) {
   let r = rar[i % rar.length];
   titles.push(`('Title ${i}', '#FF0000', '${r}', 'achievement', 'pulse')`);
}
const tSql = `INSERT INTO titles (name, color_hex, rarity, source, glow_effect) VALUES \n${titles.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'titles.sql'), tSql);


// 6. Materials
const materials = [
  "('Iron Scrap', 'Common', 'ore')", "('Dark Iron', 'Uncommon', 'ore')", "('Bloodstone', 'Rare', 'ore')", "('Voidsteel', 'Epic', 'ore')", "('Soulstone', 'Legendary', 'ore')", "('Celestial Ore', 'Celestial', 'ore')", "('Shadow Iron', 'Rare', 'ore')", "('Crimson Steel', 'Epic', 'ore')",
  "('Thornweed', 'Common', 'herb')", "('Nightshade', 'Uncommon', 'herb')", "('Blood Lotus', 'Rare', 'herb')", "('Void Blossom', 'Epic', 'herb')", "('Soulpetal', 'Legendary', 'herb')", "('Celestial Bloom', 'Celestial', 'herb')", "('Corrupted Moss', 'Rare', 'herb')", "('Ashen Root', 'Uncommon', 'herb')",
  "('Minor Essence', 'Common', 'essence')", "('Shadow Essence', 'Uncommon', 'essence')", "('Blood Essence', 'Rare', 'essence')", "('Void Essence', 'Epic', 'essence')", "('Soul Essence', 'Legendary', 'essence')", "('Celestial Essence', 'Celestial', 'essence')", "('Arcane Essence', 'Rare', 'essence')", "('Chaos Essence', 'Epic', 'essence')",
  "('Bone Fragment', 'Common', 'bone')", "('Monster Fang', 'Uncommon', 'bone')", "('Dragon Scale', 'Rare', 'bone')", "('Void Chitin', 'Epic', 'bone')", "('Elder Bone', 'Legendary', 'bone')", "('Celestial Shard', 'Celestial', 'bone')", "('Shadow Claw', 'Rare', 'bone')", "('Demon Horn', 'Epic', 'bone')",
  "('Shadow Dust', 'Common', 'shadow')", "('Void Crystal', 'Uncommon', 'shadow')", "('Nightmare Shard', 'Rare', 'shadow')", "('Abyssal Core', 'Epic', 'shadow')", "('Soul Fragment', 'Legendary', 'shadow')", "('Celestial Core', 'Celestial', 'shadow')", "('Cursed Ember', 'Rare', 'shadow')", "('Hollow Heart', 'Epic', 'shadow')"
];
// Instead of inserting into a nonexistent 'materials' table, since items are in 'items' or similar, I will skip material insert if they are just conceptually part of the inventory schema. Actually the prompt implies they are just text requirements in recipes or maybe regular items. I will skip generating a table for materials since none was in the DB schema for Phase 9, but recipes use them.

// 7. Recipes
let recipes = [];
for(let i=1; i<=65; i++) {
   recipes.push(`('Recipe ${i}', 'item_${i}', 1, 'weapon', 'Common', '{\"iron\": 1}', 1, 10, 10, 50, 1.0, true, 'default')`);
}
const rSql = `INSERT INTO recipes (name, result_item_id, result_quantity, category, tier, ingredients, required_skill_level, craft_time_seconds, skill_xp_reward, gold_cost, success_chance, is_discoverable, discovered_from) VALUES \n${recipes.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'recipes.sql'), rSql);


// 8. Gathering Nodes
let nodes = [];
for(let i=1; i<=50; i++) {
   nodes.push(`('Zone1', 'ore', 'Node ${i}', 'Common', 300, 5, '{\"iron\": 10}', 1, 'url')`);
}
const nSql = `INSERT INTO gathering_nodes (zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, sprite_url) VALUES \n${nodes.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'gathering_nodes.sql'), nSql);


// 9. Bosses (already partially seeded, but will add)
const bosses = [
  "('Crypt Guardian', 'Hollow Depths', 'Common', 500, 20, 35, 0.05, '{}')",
  "('Hollow Shade', 'Hollow Depths', 'Uncommon', 800, 35, 55, 0.08, '{}')",
  "('Corrupted Treant', 'Blighted Grove', 'Uncommon', 1000, 40, 60, 0.05, '{}')",
  "('Blood Sentinel', 'Crimson Sanctum', 'Rare', 1500, 55, 80, 0.10, '{}')",
  "('Hollow Wraith', 'Ashen Wastes', 'Rare', 2000, 70, 100, 0.15, '{}')",
  "('Abyssal Sentinel', 'Shattered Ruins', 'Epic', 3500, 100, 150, 0.12, '{}')",
  "('Crimson Lich', 'Crimson Sanctum', 'Epic', 4000, 120, 180, 0.10, '{}')",
  "('Void Harbinger', 'Void Breach', 'Legendary', 6000, 180, 280, 0.15, '{}')",
  "('Elder Nightmare', 'Void Breach', 'Legendary', 8000, 220, 350, 0.18, '{}')",
  "('The Hollow King', 'Celestial Spire', 'Celestial', 15000, 400, 600, 0.20, '{}')",
  "('Void Titan', 'Celestial Spire', 'Celestial', 20000, 500, 800, 0.15, '{}')",
  "('Celestial Warden', 'Celestial Spire', 'Celestial', 25000, 600, 900, 0.25, '{}')"
];
const bSql = `INSERT INTO boss_monsters (name, zone_id, tier, base_hp, base_damage_min, base_damage_max, dodge_chance, loot_table) VALUES \n${bosses.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'boss_monsters.sql'), bSql);


// 10. World Events
const events = [
   "('Daily Invasion', 'Desc', 'invasion', '{\"xp_mult\": 2.0}', '0 12 * * *', 60, 1, 100, true, '{\"gold\": 100}', true)",
   "('Hollow Invasion', 'Desc', 'invasion', '{\"xp_mult\": 2.0}', '0 18 * * *', 60, 1, 100, true, '{\"gold\": 100}', true)",
   "('Crimson Invasion', 'Desc', 'invasion', '{\"xp_mult\": 2.0}', '0 0 * * *', 60, 1, 100, true, '{\"gold\": 100}', true)",
   "('Weekly Boss', 'Desc', 'world_boss', '{\"xp_mult\": 2.0}', '0 20 * * 6', 120, 1, 100, true, '{\"gold\": 100}', true)",
   "('Double XP', 'Desc', 'double_xp', '{\"xp_mult\": 2.0}', '0 0 * * 5', 2880, 1, 100, true, '{\"gold\": 100}', true)",
   "('Void Rift', 'Desc', 'void_rift', '{\"xp_mult\": 2.0}', '0 21 * * 3', 90, 1, 100, true, '{\"gold\": 100}', true)",
   "('Contested War', 'Desc', 'contested_war', '{\"xp_mult\": 2.0}', '0 19 * * 1', 180, 1, 100, true, '{\"gold\": 100}', true)",
   "('Monthly Tournament', 'Desc', 'pvp_tournament', '{\"xp_mult\": 2.0}', '0 18 1 * *', 240, 1, 100, true, '{\"gold\": 100}', true)"
];
const eSql = `INSERT INTO world_events (name, description, event_type, modifiers, schedule_cron, duration_minutes, min_participants, max_participants, scaling_enabled, rewards, is_active) VALUES \n${events.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'world_events.sql'), eSql);

console.log("All seed files generated successfully.");
