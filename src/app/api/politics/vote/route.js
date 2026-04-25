// ═══════════════════════════════════════════════════════════════════
// /api/politics/vote — Cast a vote using an Obsidian Ballot
// ═══════════════════════════════════════════════════════════════════
//
// DATA FLOW (Frontend → API → PostgreSQL):
//
//   1. HallOfLegendsView.jsx sends:
//        POST /api/politics/vote
//        Body: { candidateId: "clerk_user_id_of_candidate" }
//        Headers: x-idempotency-key (prevents double-vote on network retry)
//
//   2. The API wraps everything in a PostgreSQL TRANSACTION:
//        a) SELECT the active election (verify voting is open)
//        b) SELECT inventory FOR UPDATE (lock the ballot stack)
//        c) Verify the player owns ≥1 Obsidian Ballot
//        d) Deduct 1 ballot (UPDATE quantity or DELETE if qty=1)
//        e) INSERT INTO election_votes (the actual vote record)
//        f) UPDATE elections SET total_votes = total_votes + 1
//
//   3. Returns { success, votesRemaining, election }
//      → React updates the UI with the new ballot count and standings
//
// IDEMPOTENCY:
//   The withMiddleware wrapper checks x-idempotency-key. If the same
//   key was already processed, it returns the cached response instead
//   of re-running the transaction. This prevents accidental double-votes
//   caused by network retries or rapid button clicks.
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne, transaction } from '@/lib/db/pool';


// ─────────────────────────────────────────────────────────────────
//  GET /api/politics/vote — Get the player's ballot count and
//  their votes in the current election
// ─────────────────────────────────────────────────────────────────
async function handleGet(req, { userId }) {

  // ── Fetch active election ─────────────────────────────────────
  const { data: election } = await sqlOne(
    `SELECT * FROM elections WHERE status = 'active' ORDER BY start_date DESC LIMIT 1`
  );

  // ── Count player's Obsidian Ballots in inventory ──────────────
  //
  // JOIN items ON items.id = inventory.item_id
  //   → Links the inventory row to the item definition
  // WHERE items.key = 'obsidian_ballot'
  //   → Filters to only ballot items
  // AND inventory.deleted_at IS NULL
  //   → Excludes soft-deleted inventory entries
  //
  // COALESCE(SUM(inv.quantity), 0)
  //   → If the player has no ballots, SUM returns NULL.
  //     COALESCE converts NULL to 0 so the frontend gets a number.
  //
  const { data: ballotRow } = await sqlOne(
    `SELECT COALESCE(SUM(inv.quantity), 0) AS total_ballots
     FROM inventory inv
     JOIN items i ON i.id = inv.item_id
     WHERE inv.player_id = $1 AND i.key = 'obsidian_ballot' AND inv.deleted_at IS NULL`,
    [userId]
  );

  // ── Get the player's votes in this election ───────────────────
  let myVotes = [];
  if (election) {
    const { data: votes } = await sql(
      `SELECT ev.candidate_id, p.username AS candidate_name, COUNT(*) AS vote_count
       FROM election_votes ev
       JOIN players p ON p.clerk_user_id = ev.candidate_id
       WHERE ev.election_id = $1 AND ev.voter_id = $2
       GROUP BY ev.candidate_id, p.username`,
      [election.id, userId]
    );
    myVotes = votes || [];
  }

  return NextResponse.json({
    election,
    ballotsOwned: parseInt(ballotRow?.total_ballots || 0),
    myVotes,
  });
}


// ─────────────────────────────────────────────────────────────────
//  POST /api/politics/vote — Cast a vote (consumes 1 ballot)
// ─────────────────────────────────────────────────────────────────
//
// Body: { candidateId: string }
//
// TRANSACTION STEPS:
//   1. Verify active election exists
//   2. Verify candidate exists and is a real player
//   3. Lock the voter's ballot inventory row (FOR UPDATE)
//   4. Deduct 1 ballot
//   5. Record the vote
//   6. Increment election total_votes counter
//
async function handlePost(req, { userId }) {
  const { candidateId } = await req.json();

  if (!candidateId) {
    return NextResponse.json({ error: 'candidateId is required.' }, { status: 400 });
  }

  // ── Execute the full vote inside a transaction ────────────────
  const { data: result, error: txErr } = await transaction(async (client) => {

    // ── STEP 1: Find the active election ────────────────────────
    const electionRes = await client.query(
      `SELECT * FROM elections WHERE status = 'active' ORDER BY start_date DESC LIMIT 1`
    );
    if (electionRes.rows.length === 0) {
      throw new Error('No active election. Voting is closed.');
    }
    const election = electionRes.rows[0];

    // Check if the election period is still valid
    // PostgreSQL's now() is compared against end_date
    if (new Date(election.end_date) < new Date()) {
      throw new Error('This election has expired. Awaiting results.');
    }

    // ── STEP 2: Verify candidate is a real player ───────────────
    const candidateRes = await client.query(
      `SELECT clerk_user_id, username FROM players WHERE clerk_user_id = $1`,
      [candidateId]
    );
    if (candidateRes.rows.length === 0) {
      throw new Error('Candidate not found.');
    }

    // ── STEP 3: Lock the voter's ballot in inventory ────────────
    //
    // FOR UPDATE locks these specific inventory rows for the duration
    // of the transaction. If another request tries to deduct a ballot
    // simultaneously, it blocks here until this transaction commits.
    //
    // WHY is this needed?
    //   Without FOR UPDATE, two simultaneous votes could both read
    //   quantity=1, both pass the check, and both try to deduct,
    //   potentially resulting in quantity=-1 (invalid state).
    //
    const ballotRes = await client.query(
      `SELECT inv.id, inv.quantity
       FROM inventory inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.player_id = $1 AND i.key = 'obsidian_ballot'
         AND inv.deleted_at IS NULL AND inv.quantity >= 1
       ORDER BY inv.quantity ASC
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (ballotRes.rows.length === 0) {
      throw new Error('You need an Obsidian Ballot to vote. Acquire one from monsters, crafting, or the Auction House.');
    }

    const ballotRow = ballotRes.rows[0];

    // ── STEP 4: Deduct 1 ballot from inventory ──────────────────
    //
    // If the stack has exactly 1, soft-delete the row.
    // If the stack has more than 1, decrement quantity.
    //
    if (ballotRow.quantity <= 1) {
      // Soft-delete: mark as deleted rather than hard-removing
      await client.query(
        `UPDATE inventory SET deleted_at = now(), quantity = 0 WHERE id = $1`,
        [ballotRow.id]
      );
    } else {
      await client.query(
        `UPDATE inventory SET quantity = quantity - 1 WHERE id = $1`,
        [ballotRow.id]
      );
    }

    // ── STEP 5: Record the vote ─────────────────────────────────
    //
    // INSERT into election_votes — this is the immutable audit record.
    // No ON CONFLICT — each ballot = one vote row.
    //
    await client.query(
      `INSERT INTO election_votes (election_id, voter_id, candidate_id, ballot_item_id)
       VALUES ($1, $2, $3, $4)`,
      [election.id, userId, candidateId, ballotRow.id]
    );

    // ── STEP 6: Increment election vote counter ─────────────────
    await client.query(
      `UPDATE elections SET total_votes = total_votes + 1 WHERE id = $1`,
      [election.id]
    );

    // ── Fetch remaining ballots for the response ────────────────
    const remainRes = await client.query(
      `SELECT COALESCE(SUM(inv.quantity), 0) AS remaining
       FROM inventory inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.player_id = $1 AND i.key = 'obsidian_ballot' AND inv.deleted_at IS NULL`,
      [userId]
    );

    return {
      electionId:     election.id,
      candidateId,
      candidateName:  candidateRes.rows[0].username,
      ballotsRemaining: parseInt(remainRes.rows[0]?.remaining || 0),
    };
  });

  if (txErr) {
    return NextResponse.json({ error: txErr.message, success: false }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...result });
}


// ─────────────────────────────────────────────────────────────────
//  EXPORTS — Middleware-wrapped handlers
// ─────────────────────────────────────────────────────────────────
export const GET  = withMiddleware(handleGet,  { rateLimit: null });
export const POST = withMiddleware(handlePost, {
  rateLimit:   'vote',
  idempotency: true,   // Prevents double-vote on network retry
});
