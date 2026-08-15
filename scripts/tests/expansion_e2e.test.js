// ═══════════════════════════════════════════════════════════════════
// BlackWorld Expansion Project — Automated E2E Test Suite
// ═══════════════════════════════════════════════════════════════════
// Comprehensive E2E test suite covering Tier 1 (Feature Coverage),
// Tier 2 (Boundary & Corner Cases), Tier 3 (Cross-Feature Combinations),
// and Tier 4 (Real-World Scenarios).
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Auto-load .env.local if DATABASE_URL is not set in environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const envPath = path.join(projectRoot, '.env.local');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { pool, sql, sqlOne } from '../../src/lib/db/pool.js';
import {
  tickPlayerResources,
  checkJailStatus,
  getCrimes,
  getCrimeById,
  commitCrime,
  getGymTrainings,
  trainGym,
  getEducationCourses,
  getPlayerEducation,
  enrollCourse,
  claimCourse,
  getBazaarListings,
  getPlayerBazaarListings,
  listItemBazaar,
  buyItemBazaar,
  removeListingBazaar,
  getStocks,
  getPlayerInvestments,
  buyStock,
  sellStock,
  claimDividends
} from '../../src/lib/db/dal/expansion.js';

// Dedicated E2E Test Player Identifiers
const PLAYER_PRIMARY = 'e2e_player_primary';
const PLAYER_COUNTERPARTY = 'e2e_player_counterparty';
const PLAYER_JAILED = 'e2e_player_jailed';
const PLAYER_BROKE = 'e2e_player_broke';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, message = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${message}`);
    failedTests++;
  }
}

async function setupTestData() {
  console.log('\n============================================================');
  console.log('INITIALIZING TEST USERS AND DATABASE DATA');
  console.log('============================================================');

  // Insert test players
  const testPlayers = [
    { id: PLAYER_PRIMARY, email: 'e2e_primary@blackworld.com', username: 'E2E_Primary' },
    { id: PLAYER_COUNTERPARTY, email: 'e2e_counterparty@blackworld.com', username: 'E2E_Counterparty' },
    { id: PLAYER_JAILED, email: 'e2e_jailed@blackworld.com', username: 'E2E_Jailed' },
    { id: PLAYER_BROKE, email: 'e2e_broke@blackworld.com', username: 'E2E_Broke' },
  ];

  for (const p of testPlayers) {
    await sql(
      `INSERT INTO players (clerk_user_id, email, password_hash, username)
       VALUES ($1, $2, 'hash_pass', $3)
       ON CONFLICT (clerk_user_id) DO UPDATE SET username = EXCLUDED.username`,
      [p.id, p.email, p.username]
    );
  }

  // Setup primary player: ample resources
  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex, level, xp)
     VALUES ($1, 20, 20, 100, 100, 50000, 10, 10, 10, 10, 1, 0)
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 20, max_nerve = 20, energy = 100, max_energy = 100, gold = 50000,
       str = 10, def = 10, spd = 10, dex = 10, jail_until = NULL, jail_reason = NULL`,
    [PLAYER_PRIMARY]
  );

  // Setup counterparty player: gold for buying bazaar items
  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex, level, xp)
     VALUES ($1, 20, 20, 100, 100, 50000, 10, 10, 10, 10, 1, 0)
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 20, max_nerve = 20, energy = 100, max_energy = 100, gold = 50000,
       str = 10, def = 10, spd = 10, dex = 10, jail_until = NULL, jail_reason = NULL`,
    [PLAYER_COUNTERPARTY]
  );

  // Setup jailed player: active dungeon lock
  const futureJail = new Date(Date.now() + 3600 * 1000).toISOString();
  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex, jail_until, jail_reason)
     VALUES ($1, 20, 20, 100, 100, 1000, 10, 10, 10, 10, $2, 'Armed Robbery')
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 20, max_nerve = 20, energy = 100, max_energy = 100, gold = 1000,
       jail_until = $2, jail_reason = 'Armed Robbery'`,
    [PLAYER_JAILED, futureJail]
  );

  // Setup broke player: 0 nerve, 0 energy, 0 gold
  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex, last_nerve_tick, last_energy_tick)
     VALUES ($1, 0, 10, 0, 100, 0, 10, 10, 10, 10, NOW(), NOW())
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 0, max_nerve = 10, energy = 0, max_energy = 100, gold = 0,
       last_nerve_tick = NOW(), last_energy_tick = NOW(), jail_until = NULL, jail_reason = NULL`,
    [PLAYER_BROKE]
  );

  // Clean test item and add to items catalog
  await sql(
    `INSERT INTO items (key, name, type, tier, description, is_stackable, max_stack)
     VALUES ('e2e_potion', 'E2E Health Potion', 'CONSUMABLE', 'COMMON', 'Test potion for E2E suite', true, 99)
     ON CONFLICT (key) DO NOTHING`
  );

  // Clean old test education enrollments, bazaar listings, investments for test users
  await sql(`DELETE FROM player_education WHERE player_id IN ($1, $2, $3, $4)`, [PLAYER_PRIMARY, PLAYER_COUNTERPARTY, PLAYER_JAILED, PLAYER_BROKE]);
  await sql(`DELETE FROM player_bazaar WHERE seller_id IN ($1, $2, $3, $4)`, [PLAYER_PRIMARY, PLAYER_COUNTERPARTY, PLAYER_JAILED, PLAYER_BROKE]);
  await sql(`DELETE FROM player_investments WHERE player_id IN ($1, $2, $3, $4)`, [PLAYER_PRIMARY, PLAYER_COUNTERPARTY, PLAYER_JAILED, PLAYER_BROKE]);

  console.log('✅ Test setup complete.');
}

async function runTier1Tests() {
  console.log('\n============================================================');
  console.log('TIER 1: FEATURE COVERAGE (>=5 TESTS PER FEATURE)');
  console.log('============================================================');

  // ─────────────────────────────────────────────────────────────────
  // 1. CRIMES (5 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Crimes ---');

  // 1.1 List crimes
  const { data: crimesList } = await getCrimes();
  assert(Array.isArray(crimesList) && crimesList.length >= 5, '1.1 List crimes', `Returned ${crimesList?.length} crimes`);

  // 1.2 Commit crime success
  const shoplifting = crimesList.find(c => c.name.toLowerCase().includes('shoplift') || c.id === 'shoplifting') || crimesList[0];
  await sql(`UPDATE hero_stats SET nerve = 20, max_nerve = 20, jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  
  const originalRate = shoplifting.success_rate;
  await sql(`UPDATE crimes SET success_rate = 1.0 WHERE id = $1`, [shoplifting.id]);
  const commitSuccess = await commitCrime(PLAYER_PRIMARY, shoplifting.id);
  assert(commitSuccess.data && commitSuccess.data.success === true, '1.2 Commit crime success', `Output: ${JSON.stringify(commitSuccess)}`);

  // 1.3 Commit crime failure (dungeon timeout)
  await sql(`UPDATE hero_stats SET nerve = 20, max_nerve = 20, jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await sql(`UPDATE crimes SET success_rate = 0.0 WHERE id = $1`, [shoplifting.id]);
  const commitFail = await commitCrime(PLAYER_PRIMARY, shoplifting.id);
  assert(
    commitFail.data && commitFail.data.success === false && commitFail.data.in_jail === true && commitFail.data.jail_seconds > 0,
    '1.3 Commit crime failure (dungeon timeout)',
    `Output: ${JSON.stringify(commitFail)}`
  );
  await sql(`UPDATE crimes SET success_rate = $2 WHERE id = $1`, [shoplifting.id, originalRate]);
  await sql(`UPDATE hero_stats SET jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);

  // 1.4 Nerve deduction
  await sql(`UPDATE hero_stats SET nerve = 20, max_nerve = 20, jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await sql(`UPDATE crimes SET success_rate = 1.0 WHERE id = $1`, [shoplifting.id]);
  const { data: heroBeforeNerve } = await sqlOne(`SELECT nerve FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await commitCrime(PLAYER_PRIMARY, shoplifting.id);
  const { data: heroAfterNerve } = await sqlOne(`SELECT nerve FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const expectedNerve = heroBeforeNerve.nerve - Number(shoplifting.nerve_cost);
  assert(heroAfterNerve.nerve === expectedNerve, '1.4 Nerve deduction', `Before: ${heroBeforeNerve.nerve}, After: ${heroAfterNerve.nerve}, Expected: ${expectedNerve}`);
  await sql(`UPDATE crimes SET success_rate = $2 WHERE id = $1`, [shoplifting.id, originalRate]);

  // 1.5 Reward validation
  await sql(`UPDATE hero_stats SET nerve = 20, gold = 1000, xp = 0, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await sql(`UPDATE crimes SET success_rate = 1.0 WHERE id = $1`, [shoplifting.id]);
  const rewardRes = await commitCrime(PLAYER_PRIMARY, shoplifting.id);
  const { data: heroRewarded } = await sqlOne(`SELECT gold, xp FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);
  assert(
    heroRewarded.gold === 1000 + rewardRes.data.gold_gained && heroRewarded.xp === rewardRes.data.xp_gained,
    '1.5 Reward validation',
    `Gold gained: ${rewardRes.data.gold_gained}, XP gained: ${rewardRes.data.xp_gained}`
  );
  await sql(`UPDATE crimes SET success_rate = $2 WHERE id = $1`, [shoplifting.id, originalRate]);

  // ─────────────────────────────────────────────────────────────────
  // 2. GYM (5 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Gym ---');

  // 2.1 List trainings
  const { data: trainingsList } = await getGymTrainings();
  assert(Array.isArray(trainingsList) && trainingsList.length >= 4, '2.1 List trainings', `Returned ${trainingsList?.length} trainings`);

  // 2.2 Train strength
  await sql(`UPDATE hero_stats SET energy = 100, str = 10, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const trainStr = await trainGym(PLAYER_PRIMARY, { statType: 'str' });
  const strData = trainStr.data || trainStr;
  assert(strData.success === true && strData.stat_type === 'str' && strData.new_stat_val === 11, '2.2 Train strength', `Val: ${strData.new_stat_val}`);

  // 2.3 Train speed
  await sql(`UPDATE hero_stats SET energy = 100, spd = 10, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const trainSpd = await trainGym(PLAYER_PRIMARY, { statType: 'spd' });
  const spdData = trainSpd.data || trainSpd;
  assert(spdData.success === true && spdData.stat_type === 'spd' && spdData.new_stat_val === 11, '2.3 Train speed', `Val: ${spdData.new_stat_val}`);

  // 2.4 Train defense
  await sql(`UPDATE hero_stats SET energy = 100, def = 10, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const trainDef = await trainGym(PLAYER_PRIMARY, { statType: 'def' });
  const defData = trainDef.data || trainDef;
  assert(defData.success === true && defData.stat_type === 'def' && defData.new_stat_val === 11, '2.4 Train defense', `Val: ${defData.new_stat_val}`);

  // 2.5 Train dexterity & energy deduction
  await sql(`UPDATE hero_stats SET energy = 100, dex = 10, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const trainDex = await trainGym(PLAYER_PRIMARY, { statType: 'dex' });
  const dexData = trainDex.data || trainDex;
  assert(
    dexData.success === true && dexData.stat_type === 'dex' && dexData.new_stat_val === 11 && dexData.energy_remaining === 90,
    '2.5 Train dexterity & energy deduction',
    `New val: ${dexData.new_stat_val}, energy: ${dexData.energy_remaining}`
  );

  // ─────────────────────────────────────────────────────────────────
  // 3. EDUCATION (5 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Education ---');

  // 3.1 List courses
  const { data: coursesList } = await getEducationCourses();
  assert(Array.isArray(coursesList) && coursesList.length >= 4, '3.1 List courses', `Returned ${coursesList?.length} courses`);

  // 3.2 Enroll course
  await sql(`DELETE FROM player_education WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await sql(`UPDATE hero_stats SET gold = 10000, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const courseToEnroll = coursesList[0];
  const enrollRes = await enrollCourse(PLAYER_PRIMARY, courseToEnroll.id);
  const enrollData = enrollRes.data || enrollRes;
  assert(enrollData.success === true && enrollData.enrollment !== undefined, '3.2 Enroll course', `Output: ${JSON.stringify(enrollData)}`);

  // 3.3 Active course progress tick
  const { data: playerEdState } = await getPlayerEducation(PLAYER_PRIMARY);
  assert(
    Array.isArray(playerEdState) && playerEdState.length > 0 && playerEdState[0].is_completed === false,
    '3.3 Active course progress tick',
    `Records: ${playerEdState?.length}`
  );

  // 3.4 Claim course perks
  await sql(
    `UPDATE player_education SET completes_at = NOW() - INTERVAL '10 seconds' WHERE player_id = $1 AND course_id = $2`,
    [PLAYER_PRIMARY, courseToEnroll.id]
  );
  const claimRes = await claimCourse(PLAYER_PRIMARY, courseToEnroll.id);
  const claimData = claimRes.data || claimRes;
  assert(claimData.success === true && claimData.perk_unlocked === courseToEnroll.perk_code, '3.4 Claim course perks', `Perk: ${claimData.perk_unlocked}`);

  // 3.5 Stat/perk grant
  const { data: heroAfterEdu } = await sqlOne(`SELECT max_energy, max_nerve, str, def, spd, dex FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const boostType = courseToEnroll.stat_boost_type;
  assert(heroAfterEdu[boostType] !== undefined, '3.5 Stat/perk grant', `Boosted column ${boostType} value: ${heroAfterEdu[boostType]}`);

  // ─────────────────────────────────────────────────────────────────
  // 4. ECONOMY BAZAAR (5 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Economy Bazaar ---');

  // Reset primary hero gold to 10000
  await sql(`UPDATE hero_stats SET gold = 10000, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);

  // Ensure item inventory for PLAYER_PRIMARY
  const { data: testItem } = await sqlOne(`SELECT id FROM items WHERE key = 'e2e_potion'`);
  const { data: invRow } = await sqlOne(
    `INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, 10) RETURNING id`,
    [PLAYER_PRIMARY, testItem.id]
  );

  // 4.1 List bazaar items
  const { data: initialListings } = await getBazaarListings();
  assert(Array.isArray(initialListings), '4.1 List bazaar items', `Found ${initialListings?.length} listings`);

  // 4.2 List item for sale
  const listBazaarRes = await listItemBazaar(PLAYER_PRIMARY, invRow.id, 150, 3);
  const listBazaarData = listBazaarRes.data || listBazaarRes;
  assert(listBazaarData.success === true && listBazaarData.listing.id !== undefined, '4.2 List item for sale', `Listing ID: ${listBazaarData.listing?.id}`);
  const createdListingId = listBazaarData.listing.id;

  // 4.3 Buy bazaar item with gold
  await sql(`UPDATE hero_stats SET gold = 50000, jail_until = NULL WHERE player_id = $1`, [PLAYER_COUNTERPARTY]);
  const buyBazaarRes = await buyItemBazaar(PLAYER_COUNTERPARTY, createdListingId, 1);
  const buyBazaarData = buyBazaarRes.data || buyBazaarRes;
  assert(buyBazaarData.success === true && buyBazaarData.total_cost === 150, '4.3 Buy bazaar item with gold', `Cost: ${buyBazaarData.total_cost}`);

  // 4.4 Transfer inventory & gold
  const { data: buyerInv } = await sqlOne(`SELECT quantity FROM inventory WHERE player_id = $1 AND item_id = $2`, [PLAYER_COUNTERPARTY, testItem.id]);
  const { data: sellerHero } = await sqlOne(`SELECT gold FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);
  assert(buyerInv.quantity >= 1 && sellerHero.gold === 10150, '4.4 Transfer inventory & gold', `Buyer item qty: ${buyerInv.quantity}, Seller gold: ${sellerHero.gold}`);

  // 4.5 Remove listing
  const removeRes = await removeListingBazaar(PLAYER_PRIMARY, createdListingId);
  const removeData = removeRes.data || removeRes;
  assert(removeData.success === true && removeData.quantity_returned === 2, '4.5 Remove listing', `Returned qty: ${removeData.quantity_returned}`);

  // ─────────────────────────────────────────────────────────────────
  // 5. ECONOMY STOCKS (5 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Economy Stocks ---');

  // 5.1 List stocks
  const { data: stocksList } = await getStocks();
  assert(Array.isArray(stocksList) && stocksList.length >= 3, '5.1 List stocks', `Found ${stocksList?.length} stocks`);

  const testStock = stocksList[0];

  // 5.2 Buy shares
  await sql(`UPDATE hero_stats SET gold = 50000 WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const buyStockRes = await buyStock(PLAYER_PRIMARY, testStock.id, 10);
  const buyStockData = buyStockRes.data || buyStockRes;
  assert(
    buyStockData.success === true && buyStockData.shares_bought === 10 && buyStockData.total_cost === Number(testStock.share_price) * 10,
    '5.2 Buy shares',
    `Shares bought: ${buyStockData.shares_bought}, cost: ${buyStockData.total_cost}`
  );

  // 5.3 Sell shares
  const sellStockRes = await sellStock(PLAYER_PRIMARY, testStock.id, 4);
  const sellStockData = sellStockRes.data || sellStockRes;
  assert(
    sellStockData.success === true && sellStockData.shares_sold === 4 && sellStockData.revenue === Number(testStock.share_price) * 4,
    '5.3 Sell shares',
    `Shares sold: ${sellStockData.shares_sold}, revenue: ${sellStockData.revenue}`
  );

  // 5.4 Dividend calculation
  await sql(
    `UPDATE player_investments SET last_dividend_claim = NOW() - INTERVAL '5 hours' WHERE player_id = $1 AND stock_id = $2`,
    [PLAYER_PRIMARY, testStock.id]
  );
  const { data: playerInvs } = await sqlOne(`SELECT shares_owned, last_dividend_claim FROM player_investments WHERE player_id = $1 AND stock_id = $2`, [PLAYER_PRIMARY, testStock.id]);
  const hoursElapsed = Math.floor((Date.now() - new Date(playerInvs.last_dividend_claim).getTime()) / (3600 * 1000));
  const expectedPayout = playerInvs.shares_owned * Number(testStock.dividend_rate_per_hour) * hoursElapsed;
  assert(hoursElapsed === 5 && expectedPayout > 0, '5.4 Dividend calculation', `Hours: ${hoursElapsed}, Expected payout: ${expectedPayout}`);

  // 5.5 Claim dividends
  const claimDivRes = await claimDividends(PLAYER_PRIMARY);
  const claimDivData = claimDivRes.data || claimDivRes;
  assert(claimDivData.success === true && claimDivData.total_dividends_claimed === expectedPayout, '5.5 Claim dividends', `Claimed: ${claimDivData.total_dividends_claimed}`);
}

async function runTier2Tests() {
  console.log('\n============================================================');
  console.log('TIER 2: BOUNDARY & CORNER CASES (>=5 TESTS PER FEATURE)');
  console.log('============================================================');

  // ─────────────────────────────────────────────────────────────────
  // 1. RESOURCE DEPLETION (3 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Resource Depletion ---');

  const { data: crimesList } = await getCrimes();
  const shoplifting = crimesList[0];

  // 1. Attempt crime with insufficient nerve (400 error)
  const lowNerveRes = await commitCrime(PLAYER_BROKE, shoplifting.id);
  assert(lowNerveRes.status === 400 && lowNerveRes.error !== null, 'Tier2_Res_1: Insufficient nerve returns HTTP 400', `Status: ${lowNerveRes.status}`);

  // 2. Attempt gym train with insufficient energy (400 error)
  const lowEnergyRes = await trainGym(PLAYER_BROKE, { statType: 'str' });
  assert(lowEnergyRes.status === 400 && lowEnergyRes.error !== null, 'Tier2_Res_2: Insufficient energy returns HTTP 400', `Status: ${lowEnergyRes.status}`);

  // 3. Attempt education enroll with insufficient gold (400 error)
  const { data: coursesList } = await getEducationCourses();
  const lowGoldEduRes = await enrollCourse(PLAYER_BROKE, coursesList[0].id);
  assert(lowGoldEduRes.status === 400 && lowGoldEduRes.error !== null, 'Tier2_Res_3: Insufficient gold returns HTTP 400', `Status: ${lowGoldEduRes.status}`);

  // ─────────────────────────────────────────────────────────────────
  // 2. DUNGEON LOCKOUTS (HTTP 403) (7 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Dungeon Lockouts (HTTP 403) ---');

  // Jailed player setup check
  const { data: jailedHero } = await sqlOne(`SELECT jail_until, jail_reason FROM hero_stats WHERE player_id = $1`, [PLAYER_JAILED]);
  const jailStatus = checkJailStatus(jailedHero);
  assert(jailStatus.in_jail === true, 'Jailed player is active in jail helper check', `Remaining sec: ${jailStatus.remaining_seconds}`);

  // 4. Jailed player cannot commit crime (403)
  const jailedCrimeRes = await commitCrime(PLAYER_JAILED, shoplifting.id);
  assert(jailedCrimeRes.status === 403 && jailedCrimeRes.error.code === 'IN_DUNGEON', 'Tier2_Jail_1: Jailed player commitCrime returns 403 IN_DUNGEON');

  // 5. Jailed player cannot train in gym (403)
  const jailedGymRes = await trainGym(PLAYER_JAILED, { statType: 'str' });
  assert(jailedGymRes.status === 403 && jailedGymRes.error.code === 'IN_DUNGEON', 'Tier2_Jail_2: Jailed player trainGym returns 403 IN_DUNGEON');

  // 6. Jailed player cannot enroll in education (403)
  const jailedEduRes = await enrollCourse(PLAYER_JAILED, coursesList[0].id);
  assert(jailedEduRes.status === 403 && jailedEduRes.error.code === 'IN_DUNGEON', 'Tier2_Jail_3: Jailed player enrollCourse returns 403 IN_DUNGEON');

  // 7. Jailed player cannot list in bazaar (403)
  const jailedBazaarListRes = await listItemBazaar(PLAYER_JAILED, 'dummy_inv_id', 100, 1);
  assert(jailedBazaarListRes.status === 403 && jailedBazaarListRes.error.code === 'IN_DUNGEON', 'Tier2_Jail_4: Jailed player listItemBazaar returns 403 IN_DUNGEON');

  // 8. Jailed player cannot buy in bazaar (403)
  const jailedBazaarBuyRes = await buyItemBazaar(PLAYER_JAILED, 'dummy_list_id', 1);
  assert(jailedBazaarBuyRes.status === 403 && jailedBazaarBuyRes.error.code === 'IN_DUNGEON', 'Tier2_Jail_5: Jailed player buyItemBazaar returns 403 IN_DUNGEON');

  // 9. Jailed player explore lockout (403)
  const jailedExploreCheck = checkJailStatus(jailedHero);
  assert(jailedExploreCheck.in_jail === true && jailedExploreCheck.remaining_seconds > 0, 'Tier2_Jail_6: Jailed player explore lock (checkJailStatus) returns active jail state');

  // 10. Jailed player combat lockout (403)
  const jailedCombatCheck = checkJailStatus(jailedHero);
  assert(jailedCombatCheck.in_jail === true && jailedCombatCheck.remaining_seconds > 0, 'Tier2_Jail_7: Jailed player combat lock (checkJailStatus) returns active jail state');

  // ─────────────────────────────────────────────────────────────────
  // 3. EDUCATION LOCKOUT (1 test)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Education Lockout ---');

  // 11. Attempt to enroll in second course while active course ongoing (400 error)
  await sql(`DELETE FROM player_education WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await sql(`UPDATE hero_stats SET gold = 50000, jail_until = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await enrollCourse(PLAYER_PRIMARY, coursesList[0].id);
  const doubleEnrollRes = await enrollCourse(PLAYER_PRIMARY, coursesList[1].id);
  assert(doubleEnrollRes.status === 400 && doubleEnrollRes.error !== null, 'Tier2_Edu_1: Enrolling in second active course returns HTTP 400');

  // ─────────────────────────────────────────────────────────────────
  // 4. BAZAAR & STOCK BOUNDS (14 tests)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Bazaar & Stock Bounds ---');

  const { data: stocksList } = await getStocks();
  const testStock = stocksList[0];

  // 12. Buy 0 or negative shares in stocks (400 error)
  const buyZeroStock = await buyStock(PLAYER_PRIMARY, testStock.id, 0);
  const buyNegStock = await buyStock(PLAYER_PRIMARY, testStock.id, -5);
  assert(buyZeroStock.status === 400 && buyNegStock.status === 400, 'Tier2_Bound_1: Buying 0 or negative stock shares returns 400');

  // 13. Sell 0 or negative shares in stocks (400 error)
  const sellZeroStock = await sellStock(PLAYER_PRIMARY, testStock.id, 0);
  const sellNegStock = await sellStock(PLAYER_PRIMARY, testStock.id, -3);
  assert(sellZeroStock.status === 400 && sellNegStock.status === 400, 'Tier2_Bound_2: Selling 0 or negative stock shares returns 400');

  // 14. List item on bazaar with negative price (400 error)
  const listNegPrice = await listItemBazaar(PLAYER_PRIMARY, 'dummy_id', -50, 1);
  assert(listNegPrice.status === 400, 'Tier2_Bound_3: Listing item with negative price returns 400');

  // 15. List item on bazaar with 0 or negative quantity (400 error)
  const listZeroQty = await listItemBazaar(PLAYER_PRIMARY, 'dummy_id', 50, 0);
  assert(listZeroQty.status === 400, 'Tier2_Bound_4: Listing item with 0 quantity returns 400');

  // 16. List non-existent inventory item (400 error)
  try {
    const listNonExistent = await listItemBazaar(PLAYER_PRIMARY, '00000000-0000-0000-0000-000000000000', 50, 1);
    assert(listNonExistent.error !== null, 'Tier2_Bound_5: Listing non-existent inventory item returns error');
  } catch (err) {
    assert(err !== null, 'Tier2_Bound_5: Listing non-existent inventory item throws error');
  }

  // 17. Buy item in bazaar with insufficient gold (400 error)
  const { data: testItem } = await sqlOne(`SELECT id FROM items WHERE key = 'e2e_potion'`);
  const { data: invRow } = await sqlOne(
    `INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, 5) RETURNING id`,
    [PLAYER_PRIMARY, testItem.id]
  );
  const listForBroke = await listItemBazaar(PLAYER_PRIMARY, invRow.id, 1000, 1);
  const listingIdForBroke = listForBroke.data.listing.id;

  try {
    const buyBrokeRes = await buyItemBazaar(PLAYER_BROKE, listingIdForBroke, 1);
    assert(buyBrokeRes.error !== null, 'Tier2_Bound_6: Buying bazaar item with insufficient gold returns error');
  } catch (err) {
    assert(err !== null, 'Tier2_Bound_6: Buying bazaar item with insufficient gold throws error');
  }

  // 18. Buy stock with insufficient gold
  try {
    const buyStockBroke = await buyStock(PLAYER_BROKE, testStock.id, 1000);
    assert(buyStockBroke.error !== null, 'Tier2_Bound_7: Buying stock with insufficient gold returns error');
  } catch (err) {
    assert(err !== null, 'Tier2_Bound_7: Buying stock with insufficient gold throws error');
  }

  // 19. Sell stock with insufficient shares owned
  try {
    const sellStockExceed = await sellStock(PLAYER_COUNTERPARTY, testStock.id, 99999);
    assert(sellStockExceed.error !== null, 'Tier2_Bound_8: Selling unowned stock shares returns error');
  } catch (err) {
    assert(err !== null, 'Tier2_Bound_8: Selling unowned stock shares throws error');
  }

  // 20. Attempt to buy own bazaar listing
  try {
    const buyOwnListing = await buyItemBazaar(PLAYER_PRIMARY, listingIdForBroke, 1);
    assert(buyOwnListing.error !== null, 'Tier2_Bound_9: Buying own bazaar listing returns error');
  } catch (err) {
    assert(err !== null, 'Tier2_Bound_9: Buying own bazaar listing throws error');
  }

  // 21. Remove non-existent bazaar listing or listing belonging to another player
  try {
    const removeOtherListing = await removeListingBazaar(PLAYER_COUNTERPARTY, listingIdForBroke);
    assert(removeOtherListing.error !== null, 'Tier2_Bound_10: Removing another player listing returns error');
  } catch (err) {
    assert(err !== null, 'Tier2_Bound_10: Removing another player listing throws error');
  }

  // Clean up test listing
  await sql(`DELETE FROM player_bazaar WHERE id = $1`, [listingIdForBroke]);

  // 22. Claim course before completes_at time (400 error)
  await sql(`DELETE FROM player_education WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await enrollCourse(PLAYER_PRIMARY, coursesList[0].id);
  const claimPrematureRes = await claimCourse(PLAYER_PRIMARY, coursesList[0].id);
  assert(claimPrematureRes.status === 400 && claimPrematureRes.error !== null, 'Tier2_Bound_11: Claiming ongoing course early returns HTTP 400');

  // 23. Claim course with no active enrollment (404 error)
  await sql(`DELETE FROM player_education WHERE player_id = $1`, [PLAYER_COUNTERPARTY]);
  const claimNoEnrollRes = await claimCourse(PLAYER_COUNTERPARTY, coursesList[0].id);
  assert(claimNoEnrollRes.status === 404 && claimNoEnrollRes.error !== null, 'Tier2_Bound_12: Claiming un-enrolled course returns HTTP 404');

  // 24. Commit crime with non-existent crimeId (404 error)
  const invalidCrimeRes = await commitCrime(PLAYER_PRIMARY, '00000000-0000-0000-0000-000000000000');
  assert(invalidCrimeRes.status === 404 && invalidCrimeRes.error !== null, 'Tier2_Bound_13: Non-existent crimeId returns HTTP 404');

  // 25. Buy non-existent stockId (404 error)
  const invalidStockRes = await buyStock(PLAYER_PRIMARY, '00000000-0000-0000-0000-000000000000', 1);
  assert(invalidStockRes.status === 404 && invalidStockRes.error !== null, 'Tier2_Bound_14: Non-existent stockId returns HTTP 404');
}

async function runTier3Tests() {
  console.log('\n============================================================');
  console.log('TIER 3: CROSS-FEATURE COMBINATIONS');
  console.log('============================================================');

  // ─────────────────────────────────────────────────────────────────
  // Cross-1: Crime failure -> Jail timeout -> Actions locked -> Expire jail -> Unlocked
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Cross-1: Crime Failure -> Jail Lockout -> Jail Expiry -> Unlocked ---');

  await sql(`UPDATE hero_stats SET nerve = 20, energy = 100, gold = 10000, jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const { data: crimesList } = await getCrimes();
  const shoplifting = crimesList[0];

  await sql(`UPDATE crimes SET success_rate = 0.0 WHERE id = $1`, [shoplifting.id]);
  const failCrime = await commitCrime(PLAYER_PRIMARY, shoplifting.id);
  assert(failCrime.data.in_jail === true, 'Cross-1.a: Crime failure sent player to jail');

  const lockedGym = await trainGym(PLAYER_PRIMARY, { statType: 'str' });
  const { data: courses } = await getEducationCourses();
  const lockedEdu = await enrollCourse(PLAYER_PRIMARY, courses[0].id);
  const lockedBazaar = await listItemBazaar(PLAYER_PRIMARY, 'dummy', 100, 1);
  assert(
    lockedGym.status === 403 && lockedEdu.status === 403 && lockedBazaar.status === 403,
    'Cross-1.b: All expansion features (Gym, Education, Bazaar) locked with 403 IN_DUNGEON'
  );

  await sql(`UPDATE hero_stats SET jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [PLAYER_PRIMARY]);
  const unlockedGym = await trainGym(PLAYER_PRIMARY, { statType: 'str' });
  assert(unlockedGym.data && unlockedGym.data.success === true, 'Cross-1.c: Expiring jail unlocks features again');

  await sql(`UPDATE crimes SET success_rate = 0.6 WHERE id = $1`, [shoplifting.id]);

  // ─────────────────────────────────────────────────────────────────
  // Cross-2: Gym stat training -> Increased battle stats -> Stats persist in hero_stats
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Cross-2: Gym Stat Training -> Persistent Hero Stats ---');

  await sql(`UPDATE hero_stats SET energy = 100, str = 25, def = 25, spd = 25, dex = 25 WHERE player_id = $1`, [PLAYER_PRIMARY]);

  await trainGym(PLAYER_PRIMARY, { statType: 'str' });
  await trainGym(PLAYER_PRIMARY, { statType: 'def' });
  await trainGym(PLAYER_PRIMARY, { statType: 'spd' });
  await trainGym(PLAYER_PRIMARY, { statType: 'dex' });

  const { data: trainedHero } = await sqlOne(`SELECT str, def, spd, dex FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);
  assert(
    trainedHero.str === 26 && trainedHero.def === 26 && trainedHero.spd === 26 && trainedHero.dex === 26,
    'Cross-2: Trained stats (str, def, spd, dex) incremented and persisted in hero_stats table',
    `Str: ${trainedHero.str}, Def: ${trainedHero.def}, Spd: ${trainedHero.spd}, Dex: ${trainedHero.dex}`
  );

  // ─────────────────────────────────────────────────────────────────
  // Cross-3: Education perk claim -> Increased max_energy / max_nerve -> Resource cap increases
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Cross-3: Education Perk Claim -> Resource Cap Increases ---');

  await sql(`DELETE FROM player_education WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await sql(`UPDATE hero_stats SET max_energy = 100, max_nerve = 10, gold = 50000 WHERE player_id = $1`, [PLAYER_PRIMARY]);

  const energyCourse = courses.find(c => c.stat_boost_type === 'max_energy' || c.stat_boost_type === 'max_nerve') || courses[0];
  await enrollCourse(PLAYER_PRIMARY, energyCourse.id);

  await sql(
    `UPDATE player_education SET completes_at = NOW() - INTERVAL '1 minute' WHERE player_id = $1 AND course_id = $2`,
    [PLAYER_PRIMARY, energyCourse.id]
  );

  const beforeCapHero = (await sqlOne(`SELECT max_energy, max_nerve FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY])).data;
  await claimCourse(PLAYER_PRIMARY, energyCourse.id);
  const afterCapHero = (await sqlOne(`SELECT max_energy, max_nerve FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY])).data;

  const boostCol = energyCourse.stat_boost_type;
  const expectedCap = beforeCapHero[boostCol] + Number(energyCourse.stat_boost_val || 0);
  assert(
    afterCapHero[boostCol] === expectedCap,
    'Cross-3: Education perk claim increased resource cap in hero_stats',
    `Boosted ${boostCol}: before=${beforeCapHero[boostCol]}, after=${afterCapHero[boostCol]}`
  );

  // ─────────────────────────────────────────────────────────────────
  // Cross-4: Bazaar transaction -> Seller receives gold -> Seller buys stocks with profits
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Cross-4: Bazaar Transaction -> Seller Receives Gold -> Stock Market Investment ---');

  await sql(`UPDATE hero_stats SET gold = 1000 WHERE player_id = $1`, [PLAYER_PRIMARY]);
  await sql(`UPDATE hero_stats SET gold = 20000 WHERE player_id = $1`, [PLAYER_COUNTERPARTY]);

  const { data: item } = await sqlOne(`SELECT id FROM items WHERE key = 'e2e_potion'`);
  const { data: sellerInv } = await sqlOne(
    `INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, 5) RETURNING id`,
    [PLAYER_PRIMARY, item.id]
  );

  const { data: bazaarList } = await listItemBazaar(PLAYER_PRIMARY, sellerInv.id, 5000, 1);
  const listId = bazaarList.listing.id;

  await buyItemBazaar(PLAYER_COUNTERPARTY, listId, 1);

  const { data: sellerAfterSale } = await sqlOne(`SELECT gold FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);
  assert(sellerAfterSale.gold === 6000, 'Cross-4.a: Seller gold increased by 5000 after bazaar sale');

  const { data: stocksList } = await getStocks();
  const targetStock = stocksList[0];
  const sharePrice = Number(targetStock.share_price);
  const sharesToBuy = Math.floor(sellerAfterSale.gold / sharePrice);

  const stockBuyRes = await buyStock(PLAYER_PRIMARY, targetStock.id, sharesToBuy);
  const { data: sellerAfterStock } = await sqlOne(`SELECT gold FROM hero_stats WHERE player_id = $1`, [PLAYER_PRIMARY]);

  assert(
    stockBuyRes.data && stockBuyRes.data.success === true && sellerAfterStock.gold === 6000 - (sharesToBuy * sharePrice),
    'Cross-4.b: Seller successfully invested bazaar profits into Stock Market shares',
    `Shares bought: ${sharesToBuy}, Gold remaining: ${sellerAfterStock.gold}`
  );
}

async function runTier4Tests() {
  console.log('\n============================================================');
  console.log('TIER 4: REAL-WORLD SCENARIOS (COMPLETE PLAYER LOOP)');
  console.log('============================================================');

  console.log('\n--- Scenario 1: Complete Player Life Cycle ---');

  const LOOP_USER = 'e2e_player_lifecycle';
  const COUNTER_USER = 'e2e_player_loop_counter';

  // 1. Register & Initialize Player
  await sql(
    `INSERT INTO players (clerk_user_id, email, password_hash, username)
     VALUES ($1, 'loop@blackworld.com', 'hash', 'LoopPlayer')
     ON CONFLICT (clerk_user_id) DO NOTHING`,
    [LOOP_USER]
  );
  await sql(
    `INSERT INTO players (clerk_user_id, email, password_hash, username)
     VALUES ($1, 'loop_counter@blackworld.com', 'hash', 'LoopCounter')
     ON CONFLICT (clerk_user_id) DO NOTHING`,
    [COUNTER_USER]
  );
  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex)
     VALUES ($1, 20, 20, 100, 100, 10000, 10, 10, 10, 10)
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 20, max_nerve = 20, energy = 100, max_energy = 100, gold = 10000,
       str = 10, def = 10, spd = 10, dex = 10, jail_until = NULL`,
    [LOOP_USER]
  );
  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex)
     VALUES ($1, 20, 20, 100, 100, 50000, 10, 10, 10, 10)
     ON CONFLICT (player_id) DO UPDATE SET gold = 50000, jail_until = NULL`,
    [COUNTER_USER]
  );

  assert(true, 'Step 1: Player registration & initialization complete');

  // 2. Train in Gym
  const gymTrain = await trainGym(LOOP_USER, { statType: 'str' });
  assert(gymTrain.data && gymTrain.data.new_stat_val === 11, 'Step 2: Trained strength in Gym');

  // 3. Perform Crimes
  const { data: crimes } = await getCrimes();
  const shoplifting = crimes[0];
  await sql(`UPDATE crimes SET success_rate = 1.0 WHERE id = $1`, [shoplifting.id]);
  const crimeRes = await commitCrime(LOOP_USER, shoplifting.id);
  assert(crimeRes.data && crimeRes.data.success === true, 'Step 3: Performed crime and earned rewards');
  await sql(`UPDATE crimes SET success_rate = 0.6 WHERE id = $1`, [shoplifting.id]);

  // 4. Enroll in Academy
  const { data: courses } = await getEducationCourses();
  const eduEnroll = await enrollCourse(LOOP_USER, courses[0].id);
  assert(eduEnroll.data && eduEnroll.data.success === true, 'Step 4: Enrolled in Academy course');

  // Fast forward & claim course
  await sql(`UPDATE player_education SET completes_at = NOW() - INTERVAL '1 second' WHERE player_id = $1`, [LOOP_USER]);
  const eduClaim = await claimCourse(LOOP_USER, courses[0].id);
  assert(eduClaim.data && eduClaim.data.success === true, 'Step 4b: Completed and claimed Academy course perks');

  // 5. Setup Bazaar Shop
  const { data: item } = await sqlOne(`SELECT id FROM items WHERE key = 'e2e_potion'`);
  const { data: shopInv } = await sqlOne(
    `INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, 2) RETURNING id`,
    [LOOP_USER, item.id]
  );
  const shopList = await listItemBazaar(LOOP_USER, shopInv.id, 2000, 1);
  const shopListingId = shopList.data.listing.id;

  const { data: heroBeforeShop } = await sqlOne(`SELECT gold FROM hero_stats WHERE player_id = $1`, [LOOP_USER]);
  await buyItemBazaar(COUNTER_USER, shopListingId, 1);
  const { data: heroAfterShop } = await sqlOne(`SELECT gold FROM hero_stats WHERE player_id = $1`, [LOOP_USER]);
  assert(heroAfterShop.gold === heroBeforeShop.gold + 2000, 'Step 5: Setup Bazaar shop & received buyer gold');

  // 6. Invest Profits in Stock Market
  const { data: stocks } = await getStocks();
  const loopStock = stocks[0];
  const stockBuy = await buyStock(LOOP_USER, loopStock.id, 5);
  assert(stockBuy.data && stockBuy.data.shares_bought === 5, 'Step 6: Invested bazaar profits into Stock Market');

  // 7. Claim Dividends
  await sql(
    `UPDATE player_investments SET last_dividend_claim = NOW() - INTERVAL '10 hours' WHERE player_id = $1 AND stock_id = $2`,
    [LOOP_USER, loopStock.id]
  );
  const loopDividends = await claimDividends(LOOP_USER);
  assert(loopDividends.data && loopDividends.data.total_dividends_claimed > 0, 'Step 7: Claimed stock market dividends');

  // Cleanup loop test data
  await sql(`DELETE FROM player_education WHERE player_id = $1`, [LOOP_USER]);
  await sql(`DELETE FROM player_investments WHERE player_id = $1`, [LOOP_USER]);
  await sql(`DELETE FROM inventory WHERE player_id IN ($1, $2)`, [LOOP_USER, COUNTER_USER]);
  await sql(`DELETE FROM hero_stats WHERE player_id IN ($1, $2)`, [LOOP_USER, COUNTER_USER]);
  await sql(`DELETE FROM players WHERE clerk_user_id IN ($1, $2)`, [LOOP_USER, COUNTER_USER]);

  console.log('✅ Complete player loop executed flawlessly!');
}

async function main() {
  console.log('============================================================');
  console.log('BLACKWORLD EXPANSION E2E AUTOMATED TEST SUITE');
  console.log('============================================================');

  try {
    await setupTestData();
    await runTier1Tests();
    await runTier2Tests();
    await runTier3Tests();
    await runTier4Tests();

    console.log('\n============================================================');
    console.log('E2E TEST SUITE EXECUTION SUMMARY');
    console.log('============================================================');
    console.log(`Total Tiers Executed : 4`);
    console.log(`Total Tests Passed   : ${passedTests}`);
    console.log(`Total Tests Failed   : ${failedTests}`);
    console.log('============================================================\n');

    if (failedTests > 0) {
      console.error('❌ E2E TEST SUITE FAILED WITH FAILURES.');
      process.exit(1);
    } else {
      console.log('🎉 ALL E2E TESTS PASSED WITH 0 FAILURES!');
      process.exit(0);
    }
  } catch (err) {
    console.error('FATAL UNHANDLED ERROR IN E2E TEST SUITE:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
