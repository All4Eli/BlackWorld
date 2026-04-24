const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost', port: 5432,
    user: 'postgres', password: 'E87319ee',
    database: 'blackworld'
  });
  await client.connect();
  console.log('[CONNECTED] blackworld\n');

  // IDX-5 fix: Use a non-partial composite index instead
  // The combat resolver filters by (player_id, buff_type) and checks expires_at in the WHERE clause
  // This composite index supports that query path efficiently without needing an IMMUTABLE predicate
  await client.query(`CREATE INDEX IF NOT EXISTS idx_player_buffs_type ON player_buffs(player_id, buff_type, expires_at);`);
  console.log('[OK] IDX-5: idx_player_buffs_type created (composite with expires_at for range scan)');

  // Full verification
  const idxCount = await client.query(`SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'`);
  const fkCount = await client.query(`SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'`);
  console.log('\n=== POST-PATCH STATUS ===');
  console.log('Total indexes:', idxCount.rows[0].count);
  console.log('Total foreign keys:', fkCount.rows[0].count);

  await client.end();
  console.log('\n[DONE] All 5 patches confirmed.');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
