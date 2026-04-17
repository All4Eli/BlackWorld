const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'supabase', 'seed');

const getZone = (name) => `(SELECT id FROM zones WHERE name = '${name}' LIMIT 1)`;

// NPCs
const npcs = [
  `('Malachar', 'The Hollow Keeper', ${getZone('Sanctuary')}, 'true', '{"greeting": "Seek the truth."}')`,
  `('Seraphine', 'Blood Trader', ${getZone('Sanctuary')}, 'true', '{"greeting": "Blood is currency."}')`,
  `('Korrath', 'Scarred Veteran', ${getZone('Sanctuary')}, 'false', '{"greeting": "Watch your flank."}')`,
  `('The Nameless', '???', ${getZone('Ashen Wastes')}, 'false', '{"greeting": "..."}')`,
  `('Vex', 'Shadow Broker', ${getZone('Hollow Depths')}, 'true', '{"greeting": "Got coin?"}')`,
  `('Thornwick', 'Mad Alchemist', ${getZone('Blighted Grove')}, 'true', '{"greeting": "Explosions!"}')`,
  `('Sister Morgana', 'Blood Priestess', ${getZone('Crimson Sanctum')}, 'false', '{"greeting": "The blood calls."}')`,
  `('Orin', 'Relic Hunter', ${getZone('Shattered Ruins')}, 'false', '{"greeting": "Shinies?"}')`,
  `('The Void Oracle', 'Seer of Nothing', ${getZone('Void Breach')}, 'false', '{"greeting": "Inevitability."}')`,
  `('Captain Harken', 'Arena Master', ${getZone('Sanctuary')}, 'false', '{"greeting": "FIGHT!"}')`,
  `('Whisper', 'Information Dealer', ${getZone('Sanctuary')}, 'false', '{"greeting": "I know all."}')`,
  `('Elder Grimm', 'Coven Registrar', ${getZone('Sanctuary')}, 'false', '{"greeting": "Sign here."}')`
];
const npcsSql = `INSERT INTO npcs (name, title, zone_id, is_vendor, dialogue) VALUES \n${npcs.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'npcs.sql'), npcsSql);

// Bosses
const bosses = [
  `('Crypt Guardian', ${getZone('Hollow Depths')}, 'Common', 500, 20, 35, 0.05, '{}')`,
  `('Hollow Shade', ${getZone('Hollow Depths')}, 'Uncommon', 800, 35, 55, 0.08, '{}')`,
  `('Corrupted Treant', ${getZone('Blighted Grove')}, 'Uncommon', 1000, 40, 60, 0.05, '{}')`,
  `('Blood Sentinel', ${getZone('Crimson Sanctum')}, 'Rare', 1500, 55, 80, 0.10, '{}')`,
  `('Hollow Wraith', ${getZone('Ashen Wastes')}, 'Rare', 2000, 70, 100, 0.15, '{}')`,
  `('Abyssal Sentinel', ${getZone('Shattered Ruins')}, 'Epic', 3500, 100, 150, 0.12, '{}')`,
  `('Crimson Lich', ${getZone('Crimson Sanctum')}, 'Epic', 4000, 120, 180, 0.10, '{}')`,
  `('Void Harbinger', ${getZone('Void Breach')}, 'Legendary', 6000, 180, 280, 0.15, '{}')`,
  `('Elder Nightmare', ${getZone('Void Breach')}, 'Legendary', 8000, 220, 350, 0.18, '{}')`,
  `('The Hollow King', ${getZone('Celestial Spire')}, 'Celestial', 15000, 400, 600, 0.20, '{}')`,
  `('Void Titan', ${getZone('Celestial Spire')}, 'Celestial', 20000, 500, 800, 0.15, '{}')`,
  `('Celestial Warden', ${getZone('Celestial Spire')}, 'Celestial', 25000, 600, 900, 0.25, '{}')`
];
const bSql = `INSERT INTO boss_monsters (name, zone_id, tier, base_hp, base_damage_min, base_damage_max, dodge_chance, loot_table) VALUES \n${bosses.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'boss_monsters.sql'), bSql);

// Gathering Nodes
let nodes = [];
const zones = ['Sanctuary', 'Ashen Wastes', 'Hollow Depths', 'Blighted Grove', 'Crimson Sanctum', 'Shattered Ruins', 'Void Breach', 'Celestial Spire'];
for(let i=1; i<=50; i++) {
   let z = zones[i % zones.length];
   nodes.push(`(${getZone(z)}, 'ore', 'Node ${i}', 'Common', 300, 5, '{"iron": 10}', 1, 'url')`);
}
const nSql = `INSERT INTO gathering_nodes (zone_id, node_type, name, tier, respawn_seconds, gather_time_seconds, loot_table, min_skill_level, sprite_url) VALUES \n${nodes.join(',\n')} ON CONFLICT DO NOTHING;`;
fs.writeFileSync(path.join(outDir, 'gathering_nodes.sql'), nSql);

console.log("Fixed FKs.");
