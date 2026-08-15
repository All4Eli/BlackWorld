// ═══════════════════════════════════════════════════════════════════
// BlackWorld Expansion Project — API Route Verification Test Suite
// ═══════════════════════════════════════════════════════════════════
// Directly tests Next.js route handlers (/api/crimes, /api/gym,
// /api/education, /api/bazaar, /api/stocks, /api/explore, /api/combat).
// ═══════════════════════════════════════════════════════════════════

import { createSessionToken } from './test_utils.js';
import { GET as getCrimesRoute, POST as postCrimesRoute } from '../../src/app/api/crimes/route.js';
import { GET as getGymRoute, POST as postGymRoute } from '../../src/app/api/gym/route.js';
import { GET as getEduRoute, POST as postEduRoute } from '../../src/app/api/education/route.js';
import { GET as getBazaarRoute, POST as postBazaarRoute } from '../../src/app/api/bazaar/route.js';
import { GET as getStocksRoute, POST as postStocksRoute } from '../../src/app/api/stocks/route.js';
import { POST as postExploreRoute } from '../../src/app/api/explore/route.js';
import { POST as postCombatRoute } from '../../src/app/api/combat/route.js';
import { sql, sqlOne } from '../../src/lib/db/pool.js';

const ROUTE_TEST_USER = 'route_test_user_expansion';

async function setupRouteTestData() {
  await sql(
    `INSERT INTO players (clerk_user_id, email, password_hash, username)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_user_id) DO NOTHING`,
    [ROUTE_TEST_USER, 'route_test@blackworld.com', 'hash', 'RouteTester']
  );

  await sql(
    `INSERT INTO hero_stats (player_id, nerve, max_nerve, energy, max_energy, gold, str, def, spd, dex)
     VALUES ($1, 10, 10, 100, 100, 10000, 10, 10, 10, 10)
     ON CONFLICT (player_id) DO UPDATE SET
       nerve = 10, max_nerve = 10, energy = 100, max_energy = 100, gold = 10000,
       jail_until = NULL, jail_reason = NULL`,
    [ROUTE_TEST_USER]
  );
}

async function createMockRequest(url, method = 'GET', body = null, token = null) {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (token) {
    headers.set('cookie', `__bw_sess=${token}`);
  }
  const init = { method, headers };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

async function runRouteTests() {
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
    await setupRouteTestData();
    const token = await createSessionToken(ROUTE_TEST_USER);

    // ── 1. GET /api/crimes ─────────────────────────────────────────
    console.log('\n--- 1. GET /api/crimes ---');
    const req1 = await createMockRequest('http://localhost:3000/api/crimes', 'GET', null, token);
    const res1 = await getCrimesRoute(req1);
    const json1 = await res1.json();
    assert(res1.status === 200, 'GET /api/crimes status 200');
    assert(json1.success === true && Array.isArray(json1.crimes), 'GET /api/crimes returns crimes array');
    assert(json1.jail_status !== undefined, 'GET /api/crimes returns jail_status');

    // ── 2. GET /api/gym ────────────────────────────────────────────
    console.log('\n--- 2. GET /api/gym ---');
    const req2 = await createMockRequest('http://localhost:3000/api/gym', 'GET', null, token);
    const res2 = await getGymRoute(req2);
    const json2 = await res2.json();
    assert(res2.status === 200, 'GET /api/gym status 200');
    assert(json2.success === true && Array.isArray(json2.trainings), 'GET /api/gym returns trainings');

    // ── 3. GET /api/education ──────────────────────────────────────
    console.log('\n--- 3. GET /api/education ---');
    const req3 = await createMockRequest('http://localhost:3000/api/education', 'GET', null, token);
    const res3 = await getEduRoute(req3);
    const json3 = await res3.json();
    assert(res3.status === 200, 'GET /api/education status 200');
    assert(json3.success === true && Array.isArray(json3.courses), 'GET /api/education returns courses');

    // ── 4. GET /api/bazaar ─────────────────────────────────────────
    console.log('\n--- 4. GET /api/bazaar ---');
    const req4 = await createMockRequest('http://localhost:3000/api/bazaar', 'GET', null, token);
    const res4 = await getBazaarRoute(req4);
    const json4 = await res4.json();
    assert(res4.status === 200, 'GET /api/bazaar status 200');
    assert(json4.success === true && Array.isArray(json4.listings), 'GET /api/bazaar returns listings');

    // ── 5. GET /api/stocks ─────────────────────────────────────────
    console.log('\n--- 5. GET /api/stocks ---');
    const req5 = await createMockRequest('http://localhost:3000/api/stocks', 'GET', null, token);
    const res5 = await getStocksRoute(req5);
    const json5 = await res5.json();
    assert(res5.status === 200, 'GET /api/stocks status 200');
    assert(json5.success === true && Array.isArray(json5.stocks), 'GET /api/stocks returns stocks');

    // ── 6. JAIL LOCK ENFORCEMENT ───────────────────────────────────
    console.log('\n--- 6. JAIL LOCK HTTP 403 ENFORCEMENT ---');
    const futureJail = new Date(Date.now() + 120 * 1000).toISOString();
    await sql(
      `UPDATE hero_stats SET jail_until = $2, jail_reason = 'Grand Theft Auto' WHERE player_id = $1`,
      [ROUTE_TEST_USER, futureJail]
    );

    // Crimes POST when jailed
    const crimesReqJailed = await createMockRequest('http://localhost:3000/api/crimes', 'POST', { crimeId: json1.crimes[0].id }, token);
    const crimesResJailed = await postCrimesRoute(crimesReqJailed);
    const crimesJsonJailed = await crimesResJailed.json();
    assert(crimesResJailed.status === 403, 'POST /api/crimes returns HTTP 403 when jailed');
    assert(crimesJsonJailed.code === 'IN_DUNGEON', 'POST /api/crimes error code is IN_DUNGEON');

    // Gym POST when jailed
    const gymReqJailed = await createMockRequest('http://localhost:3000/api/gym', 'POST', { statType: 'str' }, token);
    const gymResJailed = await postGymRoute(gymReqJailed);
    const gymJsonJailed = await gymResJailed.json();
    assert(gymResJailed.status === 403, 'POST /api/gym returns HTTP 403 when jailed');
    assert(gymJsonJailed.code === 'IN_DUNGEON', 'POST /api/gym error code is IN_DUNGEON');

    // Explore POST when jailed
    const exploreReqJailed = await createMockRequest('http://localhost:3000/api/explore', 'POST', { zoneId: 'dark_forest' }, token);
    const exploreResJailed = await postExploreRoute(exploreReqJailed);
    const exploreJsonJailed = await exploreResJailed.json();
    assert(exploreResJailed.status === 403, 'POST /api/explore returns HTTP 403 when jailed');
    assert(exploreJsonJailed.code === 'IN_DUNGEON', 'POST /api/explore error code is IN_DUNGEON');

    // Combat POST when jailed
    const combatReqJailed = await createMockRequest('http://localhost:3000/api/combat', 'POST', {}, token);
    const combatResJailed = await postCombatRoute(combatReqJailed);
    const combatJsonJailed = await combatResJailed.json();
    assert(combatResJailed.status === 403, 'POST /api/combat returns HTTP 403 when jailed');
    assert(combatJsonJailed.code === 'IN_DUNGEON', 'POST /api/combat error code is IN_DUNGEON');

    // Bazaar POST when jailed
    const bazaarReqJailed = await createMockRequest('http://localhost:3000/api/bazaar', 'POST', { action: 'list', inventoryId: 'dummy', price: 100 }, token);
    const bazaarResJailed = await postBazaarRoute(bazaarReqJailed);
    const bazaarJsonJailed = await bazaarResJailed.json();
    assert(bazaarResJailed.status === 403, 'POST /api/bazaar returns HTTP 403 when jailed');
    assert(bazaarJsonJailed.code === 'IN_DUNGEON', 'POST /api/bazaar error code is IN_DUNGEON');

    // Reset jail state
    await sql(`UPDATE hero_stats SET jail_until = NULL, jail_reason = NULL WHERE player_id = $1`, [ROUTE_TEST_USER]);

    console.log(`\n========================================`);
    console.log(`ROUTE TESTS PASSED: ${passed}`);
    console.log(`ROUTE TESTS FAILED: ${failed}`);
    console.log(`========================================`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('ROUTE TEST ERROR:', err);
    process.exit(1);
  }
}

runRouteTests();
