// ═══════════════════════════════════════════════════════════════════
// POST /api/player/refill — Spend Blood Stones to refill essence
// ═══════════════════════════════════════════════════════════════════
//
// NORMALIZED: blood_stones is now a COLUMN on hero_stats (not hero_data).
// Returns partial updatedHero for shallow merge.
//
// DATA FLOW:
//   DB columns:  blood_stones, essence, max_essence
//   API expects: { type: "essence", cost: 5 }
//   API returns: { essence, bloodStones } → updatedHero
//   UI merges:   updateHero(data.updatedHero)
//
// RACE CONDITION FIX:
//   Previously this route used two separate queries (SELECT + UPDATE)
//   without a transaction. A player could fire 10 refill requests
//   simultaneously and each would see the same blood_stones balance,
//   resulting in 10 deductions with only 1 charge.
//
//   NOW: Uses a single transaction with SELECT ... FOR UPDATE to lock
//   the hero row, preventing concurrent reads until the deduction
//   commits.
// ═══════════════════════════════════════════════════════════════════

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db/pool';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { type, cost } = await request.json();

        // Valid resource types to refill
        const validTypes = ['essence'];
        if (!validTypes.includes(type)) {
             return NextResponse.json({ error: 'Invalid resource type.' }, { status: 400 });
        }

        if (!cost || cost <= 0 || !Number.isInteger(cost)) {
            return NextResponse.json({ error: 'Invalid cost.' }, { status: 400 });
        }

        // ── Atomic transaction with row-level locking ──────────────
        //
        // SELECT ... FOR UPDATE locks the hero_stats row exclusively.
        // If another refill request arrives before this one commits,
        // it will WAIT for this lock to release, then read the
        // UPDATED balance (post-deduction). This prevents the
        // "fire 10 requests, get 10 refills for 1 charge" exploit.
        const { data, error } = await transaction(async (client) => {
            // ── Lock and read current stats ────────────────────────
            const { rows } = await client.query(
                `SELECT COALESCE(blood_stones, 0) AS blood_stones,
                        essence, max_essence
                 FROM hero_stats
                 WHERE player_id = $1
                 FOR UPDATE`,
                [userId]
            );

            if (rows.length === 0) throw new Error('Player not found.');

            const stats = rows[0];
            const currentStones = stats.blood_stones;

            if (currentStones < cost) {
                throw new Error(`Not enough Blood Stones: have ${currentStones}, need ${cost}.`);
            }

            // ── Deduct Blood Stones and refill resource ────────────
            //
            // Single UPDATE with SQL arithmetic — atomic even if our
            // FOR UPDATE lock were somehow bypassed.
            let newEssence = stats.essence;

            if (type === 'essence') {
                newEssence = stats.max_essence;
            }

            await client.query(
                `UPDATE hero_stats
                 SET blood_stones = blood_stones - $1,
                     essence = $2,
                     updated_at = NOW()
                 WHERE player_id = $3
                   AND blood_stones >= $1`,
                [cost, newEssence, userId]
            );

            // ── Log the transaction ────────────────────────────────
            await client.query(
                `INSERT INTO blood_stone_transactions
                   (player_id, amount, balance_after, transaction_type, description)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, -cost, currentStones - cost, 'purchase', `Refilled ${type}`]
            );

            return {
                essence: newEssence,
                maxEssence: stats.max_essence,
                bloodStones: currentStones - cost,
            };
        });

        if (error) {
            const msg = error.message;
            if (msg.includes('Not enough') || msg.includes('not found')) {
                return NextResponse.json({ error: msg }, { status: 400 });
            }
            throw error;
        }

        // ── Return ONLY changed fields for shallow merge ───────────
        return NextResponse.json({
          success: true,
          updatedHero: data,
        });
    } catch(err) {
        console.error('[POST /api/player/refill]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
