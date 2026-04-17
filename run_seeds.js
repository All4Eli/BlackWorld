const fs = require('fs');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        let key = match[1].trim();
        let val = match[2].trim().replace(/^['"]|['"]$/g, '');
        env[key] = val;
    }
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function run() {
    console.log("Starting master seed...");

    // Zones map
    const { data: zones } = await supabase.from('zones').select('id, name');
    const getZone = (name) => zones.find(z => z.name === name)?.id;
    if (!zones) {
        console.error("No zones found. Make sure DB is live and zones seeded.");
        return;
    }

    // 1. Skills
    const skills = [];
    const cats = ['combat', 'shadow', 'blood', 'void', 'arcane', 'survival', 'utility'];
    for(let i=0; i<95; i++) {
        let cat = cats[i % cats.length];
        skills.push({
            name: `Skill ${i}`, description: `Detailed description for Skill ${i}`, skill_type: 'active', category: cat, tier: (i%10)+1,
            position: 1, effects_per_rank: { damage: 100 }, scaling_stat: 'strength'
        });
    }
    await supabase.from('skills').upsert(skills, { onConflict: 'name' });
    console.log("Skills: " + skills.length);

    // 2. NPCs
    const npcs = [
      { name: 'Malachar', title: 'The Hollow Keeper', zone_id: getZone('Sanctuary'), is_vendor: true, dialogue: { greeting: "Seek the truth." }},
      { name: 'Seraphine', title: 'Blood Trader', zone_id: getZone('Sanctuary'), is_vendor: true, dialogue: { greeting: "Blood is currency." }},
      { name: 'Korrath', title: 'Scarred Veteran', zone_id: getZone('Sanctuary'), is_vendor: false, dialogue: { greeting: "Watch your flank." }},
      { name: 'The Nameless', title: '???', zone_id: getZone('Ashen Wastes'), is_vendor: false, dialogue: { greeting: "..." }},
      { name: 'Vex', title: 'Shadow Broker', zone_id: getZone('Hollow Depths'), is_vendor: true, dialogue: { greeting: "Got coin?" }},
      { name: 'Thornwick', title: 'Mad Alchemist', zone_id: getZone('Blighted Grove'), is_vendor: true, dialogue: { greeting: "Explosions!" }},
      { name: 'Sister Morgana', title: 'Blood Priestess', zone_id: getZone('Crimson Sanctum'), is_vendor: false, dialogue: { greeting: "The blood calls." }},
      { name: 'Orin', title: 'Relic Hunter', zone_id: getZone('Shattered Ruins'), is_vendor: false, dialogue: { greeting: "Shinies?" }},
      { name: 'The Void Oracle', title: 'Seer of Nothing', zone_id: getZone('Void Breach'), is_vendor: false, dialogue: { greeting: "Inevitability." }},
      { name: 'Captain Harken', title: 'Arena Master', zone_id: getZone('Sanctuary'), is_vendor: false, dialogue: { greeting: "FIGHT!" }},
      { name: 'Whisper', title: 'Information Dealer', zone_id: getZone('Sanctuary'), is_vendor: false, dialogue: { greeting: "I know all." }},
      { name: 'Elder Grimm', title: 'Coven Registrar', zone_id: getZone('Sanctuary'), is_vendor: false, dialogue: { greeting: "Sign here." }}
    ];
    await supabase.from('npcs').upsert(npcs.filter(n => n.zone_id), { onConflict: 'name' });
    console.log("NPCs seeded.");

    // 3. Quests
    const quests = [];
    for(let i=1; i<=40; i++) {
        let type = i<=5 ? 'main' : i<=20 ? 'side' : i<=25 ? 'daily' : i<=30 ? 'weekly' : 'legendary';
        quests.push({ name: `Quest ${i}`, description: `Desc ${i}`, quest_type: type, rewards: { xp: i*100 }, scaling_enabled: i%2===0 });
    }
    await supabase.from('quests').upsert(quests, { onConflict: 'name' });
    console.log("Quests: 40");

    // 4. Achievements
    const achievements = [];
    const achCats = ['combat', 'exploration', 'social', 'economy', 'crafting', 'pvp', 'collection', 'power', 'secret'];
    for(let i=1; i<=100; i++) {
        achievements.push({
            name: `Achievement ${i}`, description: `Desc ${i}`, category: achCats[i%achCats.length], points: i*5,
            rewards: { gold: i*10 }, is_hidden: false, is_repeatable: i%5===0, repeat_multiplier: 1.5
        });
    }
    await supabase.from('achievements').upsert(achievements, { onConflict: 'name' });
    console.log("Achievements: 100");

    // 5. Titles
    const titles = [];
    const rar = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Celestial', 'Transcendent'];
    for(let i=1; i<=30; i++) {
        titles.push({ name: `Title ${i}`, color_hex: '#FF0000', rarity: rar[i%rar.length], source: 'achievement', glow_effect: 'pulse' });
    }
    await supabase.from('titles').upsert(titles, { onConflict: 'name' });
    console.log("Titles: 30");

    // 6. Recipes
    const recipes = [];
    for(let i=1; i<=65; i++) {
        recipes.push({
            name: `Recipe ${i}`, result_item_id: '123e4567-e89b-12d3-a456-426614174000', result_quantity: 1, category: 'weapon',
            tier: 'Common', ingredients: { iron: 1 }, required_skill_level: 1, craft_time_seconds: 10,
            skill_xp_reward: 10, gold_cost: 50, success_chance: 1.0, is_discoverable: true
        });
    }
    await supabase.from('recipes').upsert(recipes, { onConflict: 'name' });
    console.log("Recipes: 65");

    // 7. Gathering Nodes
    const nodes = [];
    const zoneKeys = Object.values(zones).map(z => z.id);
    for(let i=1; i<=50; i++) {
        if(zoneKeys.length === 0) break;
        nodes.push({
            zone_id: zoneKeys[i % zoneKeys.length], node_type: 'ore', name: `Node ${i}`, tier: 'Common',
            respawn_seconds: 300, gather_time_seconds: 5, loot_table: { iron: 10 }, min_skill_level: 1, sprite_url: 'url'
        });
    }
    await supabase.from('gathering_nodes').upsert(nodes, { onConflict: 'name' });
    console.log("Nodes: 50");

    // 8. Bosses
    const bosses = [
      { name: 'Crypt Guardian', zone_id: getZone('Hollow Depths'), tier: 'Common', base_hp: 500, base_damage_min: 20, base_damage_max: 35, dodge_chance: 0.05, loot_table: {} },
      { name: 'Hollow Shade', zone_id: getZone('Hollow Depths'), tier: 'Uncommon', base_hp: 800, base_damage_min: 35, base_damage_max: 55, dodge_chance: 0.08, loot_table: {} },
      { name: 'Corrupted Treant', zone_id: getZone('Blighted Grove'), tier: 'Uncommon', base_hp: 1000, base_damage_min: 40, base_damage_max: 60, dodge_chance: 0.05, loot_table: {} },
      { name: 'Blood Sentinel', zone_id: getZone('Crimson Sanctum'), tier: 'Rare', base_hp: 1500, base_damage_min: 55, base_damage_max: 80, dodge_chance: 0.10, loot_table: {} },
      { name: 'Hollow Wraith', zone_id: getZone('Ashen Wastes'), tier: 'Rare', base_hp: 2000, base_damage_min: 70, base_damage_max: 100, dodge_chance: 0.15, loot_table: {} },
      { name: 'Abyssal Sentinel', zone_id: getZone('Shattered Ruins'), tier: 'Epic', base_hp: 3500, base_damage_min: 100, base_damage_max: 150, dodge_chance: 0.12, loot_table: {} },
      { name: 'Crimson Lich', zone_id: getZone('Crimson Sanctum'), tier: 'Epic', base_hp: 4000, base_damage_min: 120, base_damage_max: 180, dodge_chance: 0.10, loot_table: {} },
      { name: 'Void Harbinger', zone_id: getZone('Void Breach'), tier: 'Legendary', base_hp: 6000, base_damage_min: 180, base_damage_max: 280, dodge_chance: 0.15, loot_table: {} },
      { name: 'Elder Nightmare', zone_id: getZone('Void Breach'), tier: 'Legendary', base_hp: 8000, base_damage_min: 220, base_damage_max: 350, dodge_chance: 0.18, loot_table: {} },
      { name: 'The Hollow King', zone_id: getZone('Celestial Spire'), tier: 'Celestial', base_hp: 15000, base_damage_min: 400, base_damage_max: 600, dodge_chance: 0.20, loot_table: {} },
      { name: 'Void Titan', zone_id: getZone('Celestial Spire'), tier: 'Celestial', base_hp: 20000, base_damage_min: 500, base_damage_max: 800, dodge_chance: 0.15, loot_table: {} },
      { name: 'Celestial Warden', zone_id: getZone('Celestial Spire'), tier: 'Celestial', base_hp: 25000, base_damage_min: 600, base_damage_max: 900, dodge_chance: 0.25, loot_table: {} }
    ];
    await supabase.from('boss_monsters').upsert(bosses.filter(b => b.zone_id), { onConflict: 'name' });
    console.log("Bosses: " + bosses.length);

    // 9. World Events
    const events = [
      { name: 'Daily Invasion', description: 'desc', event_type: 'invasion', modifiers: {xp: 2}, schedule_cron: '0 12 * * *', duration_minutes: 60, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true },
      { name: 'Hollow Invasion', description: 'desc', event_type: 'invasion', modifiers: {xp: 2}, schedule_cron: '0 18 * * *', duration_minutes: 60, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true },
      { name: 'Crimson Invasion', description: 'desc', event_type: 'invasion', modifiers: {xp: 2}, schedule_cron: '0 0 * * *', duration_minutes: 60, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true },
      { name: 'Weekly Boss', description: 'desc', event_type: 'world_boss', modifiers: {xp: 2}, schedule_cron: '0 20 * * 6', duration_minutes: 120, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true },
      { name: 'Double XP', description: 'desc', event_type: 'double_xp', modifiers: {xp: 2}, schedule_cron: '0 0 * * 5', duration_minutes: 2880, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true },
      { name: 'Void Rift', description: 'desc', event_type: 'void_rift', modifiers: {xp: 2}, schedule_cron: '0 21 * * 3', duration_minutes: 90, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true },
      { name: 'Contested War', description: 'desc', event_type: 'contested_war', modifiers: {xp: 2}, schedule_cron: '0 19 * * 1', duration_minutes: 180, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true },
      { name: 'Monthly Tournament', description: 'desc', event_type: 'pvp_tournament', modifiers: {xp: 2}, schedule_cron: '0 18 1 * *', duration_minutes: 240, min_participants: 1, max_participants: 100, scaling_enabled: true, rewards: {g:10}, is_active: true }
    ];
    await supabase.from('world_events').upsert(events, { onConflict: 'name' });
    console.log("Events: " + events.length);

    console.log("✅ Seed script finished successfully.");
}

run();
