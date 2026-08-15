const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Parse .env.local manually if process.env.DATABASE_URL is not set
let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^DATABASE_URL=(.*)$/);
      if (match) {
        connectionString = match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    });
  }
}

if (!connectionString) {
  console.error("DATABASE_URL not found!");
  process.exit(1);
}
// Force 127.0.0.1 instead of localhost to prevent IPv6 ECONNREFUSED issues
connectionString = connectionString.replace('@localhost:', '@127.0.0.1:');

async function runMigration() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Connected to database:", connectionString.replace(/:[^:@]+@/, ':****@'));

  const sqlPath = path.join(__dirname, 'expansion_migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log("Executing expansion_migration.sql...");
  await client.query(sql);
  console.log("Migration SQL executed successfully.");

  // Verification queries
  console.log("\n--- VERIFICATION ---");
  
  // 1. Check hero_stats columns
  const heroStatsRes = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'hero_stats' 
    AND column_name IN ('nerve', 'max_nerve', 'last_nerve_tick', 'energy', 'max_energy', 'last_energy_tick', 'spd', 'dex', 'jail_until', 'jail_reason')
    ORDER BY column_name;
  `);
  console.log("hero_stats added columns:", heroStatsRes.rows);

  // 2. Check created tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('crimes', 'crime_logs', 'gym_trainings', 'education_courses', 'player_education', 'player_bazaar', 'stocks', 'player_investments')
    ORDER BY table_name;
  `);
  console.log("Created tables found:", tablesRes.rows.map(r => r.table_name));

  // 3. Check seed counts
  const crimesCount = await client.query("SELECT COUNT(*) FROM crimes;");
  const gymCount = await client.query("SELECT COUNT(*) FROM gym_trainings;");
  const eduCount = await client.query("SELECT COUNT(*) FROM education_courses;");
  const stocksCount = await client.query("SELECT COUNT(*) FROM stocks;");

  console.log(`Seeds verification:
  - crimes count: ${crimesCount.rows[0].count}
  - gym_trainings count: ${gymCount.rows[0].count}
  - education_courses count: ${eduCount.rows[0].count}
  - stocks count: ${stocksCount.rows[0].count}
  `);

  await client.end();
  console.log("Migration complete & verified!");
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
