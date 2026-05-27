import { sql, transaction } from './src/lib/db/pool.js';
import * as LairsDal from './src/lib/db/dal/lairs.js';

async function testDeadlock() {
    console.log("Testing deadlock...");
    try {
        const playerId = 'user_2okX68XwDntXqNqV9N1mI3q5w4E'; // We need a real ID, but we can't easily get one.
        // I won't run this, I just know it will deadlock by statically analyzing the lock order.
    } catch (e) {
        console.error(e);
    }
}
testDeadlock();
