require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function runQATest() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log("== Starting QA Backend Test ==");
    
    // 1. Get a random active user ID
    const { rows: users } = await pool.query('SELECT player_id FROM hero_stats LIMIT 1');
    if (users.length === 0) {
       console.log("No users found to test.");
       return;
    }
    const userId = users[0].player_id;
    console.log("Testing with user:", userId);

    // 2. Fetch Quest Progress
    const QuestDal = require('./src/lib/db/dal/quests');
    const { data: activeQuests } = await QuestDal.getActiveQuests(userId);
    console.log("Active Quests:", activeQuests.map(q => q.title));

    // 3. Simulate Combat Kill
    console.log("\\n-- Simulating KILL_ENEMIES in bone_crypts --");
    const incRes = await QuestDal.incrementProgress(userId, 'KILL_ENEMIES', 1, { zoneId: 'bone_crypts' });
    console.log("Increment Result:", incRes);

    // 4. Test Arsenal Equipment State
    console.log("\\n-- Checking Arsenal State --");
    const { rows: inventory } = await pool.query('SELECT * FROM inventory WHERE player_id = $1 LIMIT 1', [userId]);
    if (inventory.length > 0) {
      const invId = inventory[0].id;
      const { rows: eq } = await pool.query('SELECT * FROM player_equipment WHERE player_id = $1 AND inventory_id = $2', [userId, invId]);
      console.log("Is Item Equipped?", eq.length > 0);
    }
    
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

runQATest();
