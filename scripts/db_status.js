const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'E87319ee',
    database: 'blackworld'
  });
  await c.connect();

  // Table summary
  const tables = await c.query(`
    SELECT t.table_name,
      (SELECT COUNT(*) FROM information_schema.columns c 
       WHERE c.table_name = t.table_name AND c.table_schema = 'public') as col_count
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' ORDER BY t.table_name
  `);

  console.log('=== BLACKWORLD DATABASE STATUS ===\n');
  console.log('TABLE                  | COLUMNS');
  console.log('-----------------------|--------');
  tables.rows.forEach(r => console.log(r.table_name.padEnd(23) + '| ' + r.col_count));

  // Row counts
  console.log('\n=== ROW COUNTS ===');
  for (const t of tables.rows) {
    const count = await c.query(`SELECT COUNT(*) FROM "${t.table_name}"`);
    console.log(`  ${t.table_name}: ${count.rows[0].count} rows`);
  }

  // Players
  const players = await c.query('SELECT clerk_user_id, email, username, level, stage FROM players');
  console.log('\n=== REGISTERED PLAYERS ===');
  players.rows.forEach(p => 
    console.log(`  ${p.username} | ${p.email} | Lv${p.level} | stage: ${p.stage}`)
  );

  await c.end();
}
main().catch(e => console.error(e));
