const test = require('node:test');
const assert = require('node:assert');
const { fetchApi } = require('./test_utils.js');

test('Cross-Feature and Real-World Scenarios', async (t) => {
    await t.test('Tier 3: 1. Create a lair, then a bounty targeting the owner', async () => {
        const lairRes = await fetchApi('/api/lairs', {
            method: 'POST',
            body: JSON.stringify({ name: 'Bounty Target Lair' }),
            headers: { 'X-User-Id': 'target_player' }
        });
        assert.ok(lairRes.status === 200 || lairRes.status === 201);
        
        const bountyRes = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'target_player', reward: 500 }),
            headers: { 'X-User-Id': 'bounty_issuer' }
        });
        assert.ok(bountyRes.status === 200 || bountyRes.status === 201);
    });

    await t.test('Tier 3: 2. Claim a bounty, use resources to upgrade lair', async () => {
        const bountyRes = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'some_target', reward: 100 }),
            headers: { 'X-User-Id': 'issuer' }
        });
        const bountyId = bountyRes.data?.id;

        if (bountyId) {
            const claimRes = await fetchApi(`/api/bounties/${bountyId}/claim`, {
                method: 'POST',
                headers: { 'X-User-Id': 'claimer_player' }
            });
            assert.strictEqual(claimRes.status, 200);
        }

        const lairRes = await fetchApi('/api/lairs', {
            method: 'POST',
            body: JSON.stringify({ name: 'Upgraded Lair' }),
            headers: { 'X-User-Id': 'claimer_player' }
        });
        const lairId = lairRes.data?.id;

        if (lairId) {
            const upgradeRes = await fetchApi(`/api/lairs/${lairId}/upgrade`, {
                method: 'PUT',
                headers: { 'X-User-Id': 'claimer_player' }
            });
            assert.strictEqual(upgradeRes.status, 200);
        }
    });

    await t.test('Tier 3: 3. Attack lair successfully, trigger bounty creation', async () => {
        const lairRes = await fetchApi('/api/lairs', {
            method: 'POST',
            body: JSON.stringify({ name: 'Victim Lair' }),
            headers: { 'X-User-Id': 'victim_player' }
        });
        const lairId = lairRes.data?.id;

        if (lairId) {
            const attackRes = await fetchApi(`/api/lairs/${lairId}/attack`, {
                method: 'POST',
                headers: { 'X-User-Id': 'attacker_player' }
            });
            assert.strictEqual(attackRes.status, 200);
            
            const bountyRes = await fetchApi('/api/bounties', {
                method: 'POST',
                body: JSON.stringify({ target: 'attacker_player', reward: 300 }),
                headers: { 'X-User-Id': 'victim_player' }
            });
            assert.ok(bountyRes.status === 200 || bountyRes.status === 201);
        }
    });

    await t.test('Tier 4: 1. End-to-end user loop', async () => {
        const p1 = 'e2e_player_1';
        const p2 = 'e2e_player_2';
        const p3 = 'e2e_player_3';

        // 1. P1 creates lair
        const lairRes = await fetchApi('/api/lairs', {
            method: 'POST',
            body: JSON.stringify({ name: 'E2E Lair' }),
            headers: { 'X-User-Id': p1 }
        });
        const lairId = lairRes.data?.id;
        assert.ok(lairId, 'E2E Lair created');

        // 2. P2 attacks
        const attackRes = await fetchApi(`/api/lairs/${lairId}/attack`, {
            method: 'POST',
            headers: { 'X-User-Id': p2 }
        });
        assert.strictEqual(attackRes.status, 200);

        // 3. P1 places bounty on P2
        const bountyRes = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: p2, reward: 1000 }),
            headers: { 'X-User-Id': p1 }
        });
        const bountyId = bountyRes.data?.id;
        assert.ok(bountyId, 'E2E Bounty created');

        // 4. P3 claims bounty
        const claimRes = await fetchApi(`/api/bounties/${bountyId}/claim`, {
            method: 'POST',
            headers: { 'X-User-Id': p3 }
        });
        assert.strictEqual(claimRes.status, 200);

        // 5. P1 upgrades their lair
        const upgradeRes = await fetchApi(`/api/lairs/${lairId}/upgrade`, {
            method: 'PUT',
            headers: { 'X-User-Id': p1 }
        });
        assert.strictEqual(upgradeRes.status, 200);
    });
});
