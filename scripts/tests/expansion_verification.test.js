// ═══════════════════════════════════════════════════════════════════
// BlackWorld Expansion Project — Comprehensive Test Suite
// ═══════════════════════════════════════════════════════════════════
// Verifies DAL, Resource Regen, Jail Locks, Crimes, Gym, Education,
// Bazaar, and Stock Market logic against the PostgreSQL database.
// ═══════════════════════════════════════════════════════════════════

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
import * as DalExport from '../../src/lib/dal.js';

const TEST_PLAYER_ID_1 = 'test_user_expansion_1';
const TEST_PLAYER_ID_2 = 'test_user_expansion_2';

async function setupTestData() {
  console.log('--- SETTING UP TEST DATA ---');
  // 1. Ensure test players exist in `players` table
  await sql(
    `INSERT INTO players (clerk_user_id, email, password_hash, username)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_user_id) DO NOTHING`,
    [TEST_PLAYER_ID_1, 'test1@blackworld.com', 'hash', 'TestPlayer1']
  );

  await sql(
    `INSERT INTO players (clerk_user_id, email, password_hash, username)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_user_id) DO NOTHING`,
    [TEST_PLAYER_ID_2, 'test2@blackworld.com', 'hash', 'TestPlayer2']
  );

  // 2. Ensure test hero_stats exist
  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex)
     VALUES ($1, 10, 10, 100, 100, 10000, 10, 10, 10, 10)
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 10, max_nerve = 10, energy = 100, max_energy = 100, gold = 10000,
       jail_until = NULL, jail_reason = NULL`,
    [TEST_PLAYER_ID_1]
  );

  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex)
     VALUES ($1, 10, 10, 100, 100, 10000, 10, 10, 10, 10)
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 10, max_nerve = 10, energy = 100, max_energy = 100, gold = 10000,
       jail_until = NULL, jail_reason = NULL`,
    [TEST_PLAYER_ID_2]
  );

  // 3. Ensure test item exists for bazaar testing
  await sql(
    `INSERT INTO items (key, name, type, tier, description)
     VALUES ('test_potion', 'Test Potion', 'CONSUMABLE', 'COMMON', 'Test item for bazaar')
     ON CONFLICT (key) DO NOTHING`
  );
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    await setupTestData();

    // ── TEST 1: DAL Export Verification ───────────────────────────
    console.log('\n--- 1. DAL Export Verification ---');
    assert(typeof DalExport.tickPlayerResources === 'function', 'DalExport has tickPlayerResources');
    assert(typeof DalExport.checkJailStatus === 'function', 'DalExport has checkJailStatus');
    assert(typeof DalExport.commitCrime === 'function', 'DalExport has commitCrime');
    assert(typeof DalExport.trainGym === 'function', 'DalExport has trainGym');
    assert(typeof DalExport.enrollCourse === 'function', 'DalExport has enrollCourse');
    assert(typeof DalExport.listItemBazaar === 'function', 'DalExport has listItemBazaar');
    assert(typeof DalExport.buyStock === 'function', 'DalExport has buyStock');

    // ── TEST 2: Resource Regeneration ─────────────────────────────
    console.log('\n--- 2. Lazy Resource Regeneration ---');
    // Deplete nerve and energy, backdate tick timestamps
    const pastNerveTick = new Date(Date.now() - 12 * 60 * 1000); // 12 mins ago (2 ticks of +1)
    const pastEnergyTick = new Date(Date.now() - 32 * 60 * 1000); // 32 mins ago (2 ticks of +5)

    await sql(
      `UPDATE hero_stats SET
         nerve = 2, max_nerve = 10, last_nerve_tick = $2,
         energy = 10, max_energy = 100, last_energy_tick = $3
       WHERE player_id = $1`,
      [TEST_PLAYER_ID_1, pastNerveTick.toISOString(), pastEnergyTick.toISOString()]
    );

    const { data: regenHero } = await tickPlayerResources(TEST_PLAYER_ID_1);
    // nerve: 2 + 2 = 4
    // energy: 10 + 10 = 20
    assert(regenHero.nerve === 4, `Nerve regenerated to 4 (actual: ${regenHero.nerve})`);
    assert(regenHero.energy === 20, `Energy regenerated to 20 (actual: ${regenHero.energy})`);

    // ── TEST 3: Jail Status Helper & Lock ──────────────────────────
    console.log('\n--- 3. Jail Status Helper & Lock ---');
    const futureJail = new Date(Date.now() + 60 * 1000).toISOString();
    const mockJailedHero = { jail_until: futureJail, jail_reason: 'Shoplifting' };
    const jailCheck = checkJailStatus(mockJailedHero);
    assert(jailCheck.in_jail === true, 'checkJailStatus detects active jail');
    assert(jailCheck.remaining_seconds > 0, 'checkJailStatus calculates remaining_seconds > 0');

    // Set player 1 in jail and attempt actions
    await sql(`UPDATE hero_stats SET jail_until = $2, jail_reason = 'Robbery' WHERE player_id = $1`, [TEST_PLAYER_ID_1, futureJail]);
    const jailedCrimeRes = await commitCrime(TEST_PLAYER_ID_1, 'dummy_crime_id');
    assert(jailedCrimeRes.status === 403 && jailedCrimeRes.error.code === 'IN_DUNGEON', 'commitCrime returns HTTP 403 IN_DUNGEON when jailed');

    const jailedGymRes = await trainGym(TEST_PLAYER_ID_1, { statType: 'str' });
    assert(jailedGymRes.status === 403 && jailedGymRes.error.code === 'IN_DUNGEON', 'trainGym returns HTTP 403 IN_DUNGEON when jailed');

    // Clear jail state
    await sql(`UPDATE hero_stats SET jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_1]);

    // ── TEST 4: Crimes API ─────────────────────────────────────────
    console.log('\n--- 4. Crimes API ---');
    const { data: crimesList } = await getCrimes();
    assert(Array.isArray(crimesList) && crimesList.length >= 5, 'getCrimes returns at least 5 crimes');

    // Give player full nerve & reset timestamps/jail
    await sql(`UPDATE hero_stats SET nerve = 10, max_nerve = 10, last_nerve_tick = NOW(), jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_1]);
    const targetCrime = crimesList[0]; // Shoplifting
    const crimeResult = await commitCrime(TEST_PLAYER_ID_1, targetCrime.id);
    assert(crimeResult.data !== null || crimeResult.error !== null, 'commitCrime returned result');

    // Clear jail if crime failed, give 0 nerve with fresh timestamp
    await sql(`UPDATE hero_stats SET nerve = 0, last_nerve_tick = NOW(), jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_1]);
    const lowNerveRes = await commitCrime(TEST_PLAYER_ID_1, targetCrime.id);
    assert(lowNerveRes.status === 400 || lowNerveRes.error !== null, 'commitCrime returns 400 on insufficient nerve');

    // ── TEST 5: Gym API ────────────────────────────────────────────
    console.log('\n--- 5. Gym API ---');
    // Clear jail & set energy
    await sql(`UPDATE hero_stats SET energy = 100, max_energy = 100, str = 10, last_energy_tick = NOW(), jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_1]);
    const { data: gymTrainings } = await getGymTrainings();
    assert(Array.isArray(gymTrainings) && gymTrainings.length >= 4, 'getGymTrainings returns training options');

    const gymRes = await trainGym(TEST_PLAYER_ID_1, { statType: 'str' });
    const gymData = gymRes.data || gymRes;
    assert(gymData.success === true, 'trainGym succeeded');
    assert(gymData.new_stat_val === 11, 'Strength incremented from 10 to 11');
    assert(gymData.energy_remaining === 90, 'Energy consumed 10');

    // Insufficient energy check
    await sql(`UPDATE hero_stats SET energy = 5, last_energy_tick = NOW(), jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_1]);
    const lowEnergyRes = await trainGym(TEST_PLAYER_ID_1, { statType: 'str' });
    assert(lowEnergyRes.status === 400 || lowEnergyRes.error !== null, 'trainGym returns 400 on insufficient energy');

    // ── TEST 6: Education API ──────────────────────────────────────
    console.log('\n--- 6. Education API ---');
    await sql(`UPDATE hero_stats SET gold = 1000, jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_1]);
    const { data: courses } = await getEducationCourses();
    assert(Array.isArray(courses) && courses.length >= 4, 'getEducationCourses returns course list');

    const testCourse = courses[0];
    const enrollRes = await enrollCourse(TEST_PLAYER_ID_1, testCourse.id);
    const enrollData = enrollRes.data || enrollRes;
    assert(enrollData.success === true, 'enrollCourse succeeded');

    // Try double enroll
    const doubleEnrollRes = await enrollCourse(TEST_PLAYER_ID_1, courses[1].id);
    assert(doubleEnrollRes.status === 400 || doubleEnrollRes.error !== null, 'enrollCourse rejects enrolling when course already active');

    // Fast-forward course completion and claim
    await sql(
      `UPDATE player_education SET completes_at = NOW() - INTERVAL '1 second' WHERE player_id = $1 AND course_id = $2`,
      [TEST_PLAYER_ID_1, testCourse.id]
    );
    const claimRes = await claimCourse(TEST_PLAYER_ID_1, testCourse.id);
    const claimData = claimRes.data || claimRes;
    assert(claimData.success === true, 'claimCourse succeeded');
    assert(claimData.perk_unlocked === testCourse.perk_code, 'claimCourse returns perk_code');

    // ── TEST 7: Player Bazaar API ──────────────────────────────────
    console.log('\n--- 7. Player Bazaar API ---');
    await sql(`UPDATE hero_stats SET jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_1]);
    await sql(`UPDATE hero_stats SET jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [TEST_PLAYER_ID_2]);

    // Add item to Player 1 inventory
    const { data: item } = await sqlOne(`SELECT id FROM items WHERE key = 'test_potion'`);
    const { data: invRow } = await sqlOne(
      `INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, 5) RETURNING id`,
      [TEST_PLAYER_ID_1, item.id]
    );

    // List item on Bazaar
    const listRes = await listItemBazaar(TEST_PLAYER_ID_1, invRow.id, 50, 2);
    const listData = listRes.data || listRes;
    assert(listData.success === true, 'listItemBazaar succeeded');
    const listingId = listData.listing.id;

    // Verify bazaar listings
    const { data: listings } = await getBazaarListings();
    assert(listings.some(l => l.id === listingId), 'Bazaar listing visible in global listings');

    // Player 2 buys 1 item from listing
    await sql(`UPDATE hero_stats SET gold = 1000 WHERE player_id = $1`, [TEST_PLAYER_ID_2]);
    const buyRes = await buyItemBazaar(TEST_PLAYER_ID_2, listingId, 1);
    const buyData = buyRes.data || buyRes;
    assert(buyData.success === true, 'buyItemBazaar succeeded');
    assert(buyData.total_cost === 50, 'total cost transferred');

    // Player 1 removes remaining listing
    const removeRes = await removeListingBazaar(TEST_PLAYER_ID_1, listingId);
    const removeData = removeRes.data || removeRes;
    assert(removeData.success === true, 'removeListingBazaar succeeded');

    // ── TEST 8: Stock Market API ───────────────────────────────────
    console.log('\n--- 8. Stock Market API ---');
    const { data: stocks } = await getStocks();
    assert(Array.isArray(stocks) && stocks.length >= 3, 'getStocks returns at least 3 stocks');

    const testStock = stocks[0];
    await sql(`UPDATE hero_stats SET gold = 10000 WHERE player_id = $1`, [TEST_PLAYER_ID_1]);

    // Buy 10 shares
    const buyStockRes = await buyStock(TEST_PLAYER_ID_1, testStock.id, 10);
    const buyStockData = buyStockRes.data || buyStockRes;
    assert(buyStockData.success === true, 'buyStock succeeded');
    assert(buyStockData.shares_bought === 10, 'Shares bought = 10');

    // Sell 5 shares
    const sellStockRes = await sellStock(TEST_PLAYER_ID_1, testStock.id, 5);
    const sellStockData = sellStockRes.data || sellStockRes;
    assert(sellStockData.success === true, 'sellStock succeeded');
    assert(sellStockData.shares_sold === 5, 'Shares sold = 5');

    // Claim dividends
    // Backdate last_dividend_claim by 3 hours
    await sql(
      `UPDATE player_investments SET last_dividend_claim = NOW() - INTERVAL '3 hours' WHERE player_id = $1 AND stock_id = $2`,
      [TEST_PLAYER_ID_1, testStock.id]
    );

    const dividendRes = await claimDividends(TEST_PLAYER_ID_1);
    const dividendData = dividendRes.data || dividendRes;
    assert(dividendData.success === true, 'claimDividends succeeded');
    assert(dividendData.total_dividends_claimed > 0, `Dividends claimed: ${dividendData.total_dividends_claimed}`);

    console.log(`\n========================================`);
    console.log(`TOTAL PASSED: ${passed}`);
    console.log(`TOTAL FAILED: ${failed}`);
    console.log(`========================================`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('TEST ERROR:', err);
    process.exit(1);
  }
}

runTests();
