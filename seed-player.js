const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://zlrexmtlxxtzukpdcmhr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpscmV4bXRseHh0enVrcGRjbWhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM5Mzg5MSwiZXhwIjoyMDkxOTY5ODkxfQ.21rKw_AQCG9VbiXoPvVik4bsBZrg_kWAggOeMGWOvZk'
);

const TEST_HERO = {
  name: 'Elijah',
  class: 'Blood Knight',
  hp: 150,
  maxHp: 150,
  mana: 60,
  maxMana: 60,
  dmg: 22,
  baseDmg: 22,
  gold: 350,
  level: 4,
  xp: 40,
  flasks: 3,
  kills: 9,
  artifacts: [
    { id: 'abc123', name: "Executioner's Greatsword", type: 'WEAPON', stat: 15 },
    { id: 'def456', name: 'Abyssal Core', type: 'ARMOR', stat: 40 }
  ],
  equippedWeapon: { id: 'abc123', name: "Executioner's Greatsword", type: 'WEAPON', stat: 15 },
  equippedArmor: null
};

async function seed() {
  // Use a fake Clerk user ID for the test character
  const TEST_CLERK_ID = 'test_user_elijah_demo';

  // Delete any old test row
  await supabase.from('players').delete().eq('clerk_user_id', TEST_CLERK_ID);

  const { data, error } = await supabase.from('players').insert({
    clerk_user_id: TEST_CLERK_ID,
    stage: 'EXPLORATION',
    hero_data: TEST_HERO,
    updated_at: new Date().toISOString()
  }).select().single();

  if (error) {
    console.error('❌ Seed failed:', error.message);
    return;
  }

  console.log('✅ Test character inserted successfully!');
  console.log('   Name:', data.hero_data.name);
  console.log('   Class:', data.hero_data.class);
  console.log('   Level:', data.hero_data.level);
  console.log('   Gold:', data.hero_data.gold, 'g');
  console.log('   Kills:', data.hero_data.kills);
  console.log('   Artifacts:', data.hero_data.artifacts.map(a => a.name).join(', '));
  console.log('   Row ID:', data.id);

  // Now read all players
  const { data: all } = await supabase.from('players').select('*');
  console.log('\n📋 All players in database:', all.length);
  all.forEach(p => {
    console.log(`   - ${p.hero_data?.name || 'Unknown'} (${p.hero_data?.class}) | Stage: ${p.stage} | Clerk ID: ${p.clerk_user_id}`);
  });
}

seed();
