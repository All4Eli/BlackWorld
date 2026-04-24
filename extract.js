const fs = require('fs');
let schema = '';

// Rebuild script
try {
  const rebuild = fs.readFileSync('scripts/rebuild_database.js', 'utf8');
  const queries = [...rebuild.matchAll(/client\.query\(\s*`([\s\S]*?)`/g)].map(m => m[1]);
  schema += queries.join(';\n\n') + ';\n\n';
} catch(e) {}

// Migrations
try {
  const scaling = fs.readFileSync('scripts/scaling_migration.js', 'utf8');
  const qs = [...scaling.matchAll(/`([^`]*CREATE[^`]*)`/g)].map(m => m[1]);
  schema += qs.join(';\n\n') + ';\n\n';
} catch(e) {}

// Monetization
try {
    const files = fs.readdirSync('supabase/migrations').sort();
    for(const f of files) {
        if(f.endsWith('.sql')) schema += fs.readFileSync('supabase/migrations/' + f, 'utf8') + '\n\n';
    }
} catch(e){}

// Append generic statements for Vercel + Supabase production
schema = `-- BLACKWORLD PRODUCTION SCHEMA --\n\n` + schema;

fs.writeFileSync('schema.sql', schema);
console.log('Schema written to schema.sql');
