const test = require('node:test');
const assert = require('node:assert');
const { fetchApi } = require('./test_utils.js');

test('Player Lairs - Feature Coverage and Boundary Cases', async (t) => {
    let createdLairId;

    await t.test('Tier 1: 1. Create a lair successfully', async () => {
        const res = await fetchApi('/api/lairs', {
            method: 'POST',
            body: JSON.stringify({ name: 'Doom Fortress', type: 'volcano' }),
            headers: { 'X-User-Id': 'player_lair_owner' }
        });
        assert.ok(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}`);
        assert.ok(res.data && res.data.id, 'Expected lair ID in response');
        createdLairId = res.data.id;
    });

    await t.test('Tier 1: 2. List lairs for the current user', async () => {
        const res = await fetchApi('/api/lairs', { 
            method: 'GET',
            headers: { 'X-User-Id': 'player_lair_owner' }
        });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data), 'Expected array of lairs');
        const found = res.data.find(l => l.id === createdLairId);
        assert.ok(found, 'Created lair should be in the list');
    });

    await t.test('Tier 1: 3. Get specific details of a lair', async () => {
        const res = await fetchApi(`/api/lairs/${createdLairId}`, { method: 'GET' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.id, createdLairId);
    });

    await t.test('Tier 1: 4. Upgrade a lair', async () => {
        const res = await fetchApi(`/api/lairs/${createdLairId}/upgrade`, {
            method: 'PUT',
            headers: { 'X-User-Id': 'player_lair_owner' }
        });
        assert.strictEqual(res.status, 200);
    });

    await t.test('Tier 1: 5. Attack a lair successfully', async () => {
        const res = await fetchApi(`/api/lairs/${createdLairId}/attack`, {
            method: 'POST',
            body: JSON.stringify({ power: 50 }),
            headers: { 'X-User-Id': 'player_attacker' }
        });
        assert.strictEqual(res.status, 200);
    });

    await t.test('Tier 2: 1. Attempt to create a second lair when max limit is reached', async () => {
        const res = await fetchApi('/api/lairs', {
            method: 'POST',
            body: JSON.stringify({ name: 'Second Lair' }),
            headers: { 'X-User-Id': 'player_lair_owner' }
        });
        assert.ok(res.status >= 400, 'Expected failure for max limit reached');
    });

    await t.test('Tier 2: 2. Attempt to upgrade a lair without sufficient resources', async () => {
        const createRes = await fetchApi('/api/lairs', {
            method: 'POST',
            body: JSON.stringify({ name: 'Poor Lair' }),
            headers: { 'X-User-Id': 'player_poor' }
        });
        const poorLairId = createRes.data?.id;

        if (poorLairId) {
            const res = await fetchApi(`/api/lairs/${poorLairId}/upgrade`, {
                method: 'PUT',
                headers: { 'X-User-Id': 'player_poor' } // Implicit lack of resources
            });
            assert.ok(res.status >= 400, 'Expected failure for insufficient resources');
        }
    });

    await t.test('Tier 2: 3. Attempt to attack a lair that doesn\'t exist', async () => {
        const res = await fetchApi(`/api/lairs/non_existent_lair_123/attack`, {
            method: 'POST',
            headers: { 'X-User-Id': 'player_attacker' }
        });
        assert.ok(res.status === 404, 'Expected 404 for non-existent lair');
    });

    await t.test('Tier 2: 4. Attempt to upgrade a lair beyond maximum level', async () => {
        const res = await fetchApi(`/api/lairs/${createdLairId}/upgrade`, {
            method: 'PUT',
            body: JSON.stringify({ bypassToMax: true }),
            headers: { 'X-User-Id': 'player_lair_owner' }
        });
        assert.ok(res.status < 500, `Expected graceful handling, got ${res.status}`);
    });

    await t.test('Tier 2: 5. Attempt to attack your own lair', async () => {
        const res = await fetchApi(`/api/lairs/${createdLairId}/attack`, {
            method: 'POST',
            headers: { 'X-User-Id': 'player_lair_owner' }
        });
        assert.ok(res.status >= 400, 'Expected failure for attacking own lair');
    });
});
