const test = require('node:test');
const assert = require('node:assert');
const { fetchApi } = require('./test_utils.js');

test('Player Bounties - Feature Coverage and Boundary Cases', async (t) => {
    let createdBountyId;

    await t.test('Tier 1: 1. Create a bounty successfully', async () => {
        const res = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'player_2', reward: 100 }),
            headers: { 'X-User-Id': 'player_1' }
        });
        assert.ok(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}`);
        assert.ok(res.data && res.data.id, 'Expected bounty ID in response');
        createdBountyId = res.data.id;
    });

    await t.test('Tier 1: 2. List all available bounties', async () => {
        const res = await fetchApi('/api/bounties', { method: 'GET' });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data), 'Expected array of bounties');
        const found = res.data.find(b => b.id === createdBountyId);
        assert.ok(found, 'Created bounty should be in the list');
    });

    await t.test('Tier 1: 3. Get specific details of a bounty', async () => {
        const res = await fetchApi(`/api/bounties/${createdBountyId}`, { method: 'GET' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.id, createdBountyId);
    });

    await t.test('Tier 1: 5. Cancel a bounty created by the current user', async () => {
        const res = await fetchApi(`/api/bounties/${createdBountyId}`, {
            method: 'DELETE',
            headers: { 'X-User-Id': 'player_1' }
        });
        assert.ok(res.status === 200 || res.status === 204, `Expected 200/204, got ${res.status}`);
    });

    await t.test('Tier 1: 4. Claim a bounty successfully', async () => {
        // Recreate a bounty to claim
        const createRes = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'player_3', reward: 50 }),
            headers: { 'X-User-Id': 'player_1' }
        });
        const claimBountyId = createRes.data.id;

        const claimRes = await fetchApi(`/api/bounties/${claimBountyId}/claim`, {
            method: 'POST',
            headers: { 'X-User-Id': 'player_2' }
        });
        assert.strictEqual(claimRes.status, 200);
    });

    await t.test('Tier 2: 1. Create a bounty with negative or zero reward', async () => {
        const res = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'player_2', reward: -10 }),
            headers: { 'X-User-Id': 'player_1' }
        });
        assert.ok(res.status >= 400, 'Expected failure for negative reward');
    });

    await t.test('Tier 2: 2. Create a bounty targeting a non-existent player', async () => {
        const res = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'non_existent_player_999', reward: 100 }),
            headers: { 'X-User-Id': 'player_1' }
        });
        assert.ok(res.status >= 400, 'Expected failure for non-existent player');
    });

    await t.test('Tier 2: 3. Attempt to claim a bounty that is already claimed or cancelled', async () => {
        const res = await fetchApi(`/api/bounties/${createdBountyId}/claim`, {
            method: 'POST',
            headers: { 'X-User-Id': 'player_2' }
        });
        assert.ok(res.status >= 400, 'Expected failure for already claimed/cancelled bounty');
    });

    await t.test('Tier 2: 4. Attempt to cancel someone else\'s bounty', async () => {
        const createRes = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'player_3', reward: 50 }),
            headers: { 'X-User-Id': 'player_1' }
        });
        const otherBountyId = createRes.data.id;

        const cancelRes = await fetchApi(`/api/bounties/${otherBountyId}`, {
            method: 'DELETE',
            headers: { 'X-User-Id': 'player_2' } // Different user
        });
        assert.ok(cancelRes.status === 403 || cancelRes.status === 401, 'Expected forbidden/unauthorized');
    });

    await t.test('Tier 2: 5. Attempt to create a bounty exceeding max limits or with excessively large strings', async () => {
        const res = await fetchApi('/api/bounties', {
            method: 'POST',
            body: JSON.stringify({ target: 'a'.repeat(10000), reward: 1000000000000 }),
            headers: { 'X-User-Id': 'player_1' }
        });
        assert.ok(res.status >= 400, 'Expected failure for limits/large strings');
    });
});
