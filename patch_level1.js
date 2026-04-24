const { pool } = require('./src/lib/db/pool.js');

async function patch() {
  try {
    await pool.query(`
      INSERT INTO zones (id, name, description, icon, level_required) 
      VALUES ('the_shallows', 'The Shallows', 'A relatively safe training ground near the capital.', '🏕', 1)
      ON CONFLICT (id) DO NOTHING;
    `);

    await pool.query(`
      INSERT INTO dungeons (id, name, description, zone_id, icon, min_level, floor_count, rewards, cooldown_hours, difficulty) 
      VALUES ('rats_nest', 'The Rats Nest', 'A festering den of vermin beneath the Shallows. Perfect for fledglings.', 'the_shallows', '🐀', 1, 3, '{"gold": 50, "xp": 100}', 1, 'normal')
      ON CONFLICT (id) DO NOTHING;
    `);

    const monsters = [
        `('Dire Rat', 'the_shallows', 30, 4, 1, 0.05, 'COMMON')`,
        `('Slime', 'the_shallows', 45, 6, 2, 0.0, 'UNCOMMON')`,
        `('Rat King', 'the_shallows', 80, 12, 4, 0.05, 'BOSS')`
    ].join(',');

    await pool.query(`
      INSERT INTO monsters (name, zone_id, base_hp, base_dmg, defense, dodge_chance, tier) 
      VALUES ${monsters}
      ON CONFLICT DO NOTHING;
    `);

    console.log("Patch applied correctly.");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
patch();
