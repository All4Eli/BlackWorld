// ═══════════════════════════════════════════════════════════════════
// /api/politics/sovereign — Election standings & Sovereign controls
// ═══════════════════════════════════════════════════════════════════
//
// TWO RESPONSIBILITIES:
//
//   GET:  Public data — election standings, current Sovereign info.
//         Uses COUNT(*) + GROUP BY to tally votes per candidate.
//
//   POST: Sovereign-only — adjust global server multipliers.
//         AUTHORIZATION MODEL: The API checks if the requester's
//         userId matches the sovereign_player_id in server_config.
//         If not → 403 Forbidden. No middleware role check needed
//         because Sovereign status is dynamic (changes every election).
//
// SQL FOCUS — AGGREGATE FUNCTIONS:
//
//   COUNT(*) counts the number of rows in each group.
//   GROUP BY candidate_id creates one bucket per candidate.
//   Together they produce: { candidate_id, vote_count }
//
//   Example with 3 voters:
//     voter_id | candidate_id
//     ---------|-------------
//     alice    | bob           ← group "bob" (count: 2)
//     charlie  | bob           ← group "bob"
//     dave     | eve           ← group "eve" (count: 1)
//
//   Result: bob=2, eve=1
//
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import { sql, sqlOne, transaction } from '@/lib/db/pool';


// ── Allowed multiplier keys and their bounds ────────────────────
// The Sovereign can only adjust these specific config keys.
// Each has a min and max to prevent abuse.
const SOVEREIGN_CONTROLS = {
  global_xp_multiplier:   { min: 0.5,  max: 2.0,  step: 0.1, label: 'Global XP Multiplier' },
  global_gold_multiplier: { min: 0.5,  max: 2.0,  step: 0.1, label: 'Global Gold Multiplier' },
  global_drop_rate_bonus: { min: -10,  max: 20,   step: 1,   label: 'Drop Rate Bonus (%)' },
  auction_tax_modifier:   { min: 0.5,  max: 1.5,  step: 0.1, label: 'Auction Tax Modifier' },
};


// ─────────────────────────────────────────────────────────────────
//  GET /api/politics/sovereign — Public election standings
// ─────────────────────────────────────────────────────────────────
//
// Returns:
//   {
//     election: { ... },
//     standings: [{ candidateId, candidateName, voteCount }],
//     sovereign: { id, name } or null,
//     multipliers: { ... },
//     controls: SOVEREIGN_CONTROLS (for the dashboard UI),
//   }
//
async function handleGet(req, { userId }) {

  // ── 1. Fetch the active or most recent election ───────────────
  const { data: election } = await sqlOne(
    `SELECT * FROM elections
     WHERE status IN ('active', 'completed')
     ORDER BY start_date DESC LIMIT 1`
  );

  // ── 2. Tally vote standings ───────────────────────────────────
  //
  // THE AGGREGATE QUERY:
  //
  //   SELECT candidate_id, p.username, COUNT(*) AS vote_count
  //   FROM election_votes ev
  //   JOIN players p ON p.clerk_user_id = ev.candidate_id
  //   WHERE ev.election_id = $1
  //   GROUP BY ev.candidate_id, p.username
  //   ORDER BY vote_count DESC
  //
  // BREAKDOWN:
  //   - FROM election_votes ev: Start with the votes table
  //   - JOIN players p: Link each vote to the candidate's player record
  //   - WHERE election_id = $1: Only count votes for this election
  //   - GROUP BY candidate_id, p.username: 
  //       Create one row per unique candidate. We must include
  //       p.username in GROUP BY because it's in the SELECT list
  //       and isn't an aggregate function. PostgreSQL requires all
  //       non-aggregate columns to be in GROUP BY.
  //   - COUNT(*): Count the number of vote rows in each group
  //   - ORDER BY vote_count DESC: Highest votes first (leader at top)
  //
  let standings = [];
  if (election) {
    const { data: rows } = await sql(
      `SELECT ev.candidate_id, p.username AS candidate_name, COUNT(*) AS vote_count
       FROM election_votes ev
       JOIN players p ON p.clerk_user_id = ev.candidate_id
       WHERE ev.election_id = $1
       GROUP BY ev.candidate_id, p.username
       ORDER BY vote_count DESC`,
      [election.id]
    );
    standings = (rows || []).map(r => ({
      candidateId:   r.candidate_id,
      candidateName: r.candidate_name,
      voteCount:     parseInt(r.vote_count),
    }));
  }

  // ── 3. Fetch current Sovereign ────────────────────────────────
  const { data: sovConfig } = await sqlOne(
    `SELECT value FROM server_config WHERE key = 'sovereign_player_id'`
  );
  let sovereign = null;
  const sovId = sovConfig?.value;
  if (sovId && sovId !== 'null' && sovId !== null) {
    const { data: sovPlayer } = await sqlOne(
      `SELECT clerk_user_id, username FROM players WHERE clerk_user_id = $1`,
      [typeof sovId === 'string' ? sovId : String(sovId)]
    );
    if (sovPlayer) {
      sovereign = { id: sovPlayer.clerk_user_id, name: sovPlayer.username };
    }
  }

  // ── 4. Fetch current global multipliers ───────────────────────
  const { data: configRows } = await sql(
    `SELECT key, value FROM server_config WHERE key IN ($1, $2, $3, $4)`,
    ['global_xp_multiplier', 'global_gold_multiplier', 'global_drop_rate_bonus', 'auction_tax_modifier']
  );
  const multipliers = {};
  (configRows || []).forEach(row => {
    multipliers[row.key] = typeof row.value === 'number' ? row.value : parseFloat(row.value) || 0;
  });

  // ── 5. Check if the requester IS the Sovereign ────────────────
  const isSovereign = sovereign?.id === userId;

  return NextResponse.json({
    election,
    standings,
    sovereign,
    isSovereign,
    multipliers,
    controls: SOVEREIGN_CONTROLS,
  });
}


// ─────────────────────────────────────────────────────────────────
//  POST /api/politics/sovereign — Sovereign adjusts multipliers
// ─────────────────────────────────────────────────────────────────
//
// Body: { key: "global_xp_multiplier", value: 1.5 }
//
// AUTHORIZATION:
//   This endpoint uses role-based authorization at the application level.
//   The "role" is not stored in a roles table — it's derived from the
//   server_config row where key='sovereign_player_id'. If the requester's
//   userId doesn't match that value, they get 403 Forbidden.
//
//   WHY this approach instead of middleware?
//     - Sovereign status is dynamic (changes every election cycle)
//     - It's a single config lookup, not a JWT claim or session role
//     - The check runs INSIDE the handler, after auth middleware
//       has already verified the user's identity
//
async function handlePost(req, { userId }) {
  const { key, value } = await req.json();

  if (!key || value === undefined || value === null) {
    return NextResponse.json({ error: 'key and value are required.' }, { status: 400 });
  }

  // ── Validate the key is an allowed control ────────────────────
  const control = SOVEREIGN_CONTROLS[key];
  if (!control) {
    return NextResponse.json({
      error: `Invalid control key. Allowed: ${Object.keys(SOVEREIGN_CONTROLS).join(', ')}`,
    }, { status: 400 });
  }

  // ── Validate the value is within bounds ───────────────────────
  const numValue = parseFloat(value);
  if (isNaN(numValue) || numValue < control.min || numValue > control.max) {
    return NextResponse.json({
      error: `Value for ${key} must be between ${control.min} and ${control.max}.`,
    }, { status: 400 });
  }

  // ── Execute authorization + update in a transaction ───────────
  const { data: result, error: txErr } = await transaction(async (client) => {

    // ── AUTHORIZATION CHECK ─────────────────────────────────────
    //
    // Fetch the sovereign_player_id from server_config.
    // Compare it to the requesting user's ID.
    //
    // This is the ROLE-BASED AUTHORIZATION pattern:
    //   "Does the requester hold the Sovereign role?"
    //   The role is stored as data in the database, not as a JWT claim.
    //
    const sovRes = await client.query(
      `SELECT value FROM server_config WHERE key = 'sovereign_player_id'`
    );
    const sovereignId = sovRes.rows[0]?.value;

    // ── THE 403 GATE ────────────────────────────────────────────
    // If the requester is NOT the Sovereign, deny access.
    // The error message intentionally doesn't reveal who IS the Sovereign
    // (security: don't leak privileged user identity in error messages).
    if (!sovereignId || sovereignId === 'null' || sovereignId !== userId) {
      throw new Error('FORBIDDEN');
    }

    // ── Update the server_config row ────────────────────────────
    //
    // We store the value as JSONB (a number wrapped in JSON).
    // $2::text::jsonb converts the number to a JSON-compatible format.
    //
    await client.query(
      `UPDATE server_config SET value = $2::text::jsonb, updated_at = now(), updated_by = $3
       WHERE key = $1`,
      [key, String(numValue), userId]
    );

    return { key, value: numValue, label: control.label };
  });

  if (txErr) {
    if (txErr.message === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'Only the reigning Sovereign may adjust server multipliers.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: txErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...result });
}


// ─────────────────────────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────────────────────────
export const GET  = withMiddleware(handleGet,  { rateLimit: null });
export const POST = withMiddleware(handlePost, { rateLimit: 'vote' });
