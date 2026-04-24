// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Shared PostgreSQL Connection Pool
// ═══════════════════════════════════════════════════════════════════
// Single pool instance shared across ALL DAL modules.
// Uses globalThis caching to survive Next.js HMR (Hot Module Replacement)
// in development without leaking connections.
// ═══════════════════════════════════════════════════════════════════

import dns from 'dns';

// Vercel serverless Node 18+ uses ipv4first by default. 
// Supabase direct URLs are IPv6 only, causing ENOTFOUND.
// This forces Node to resolve the AAAA records which Vercel's network natively supports routing.
dns.setDefaultResultOrder('ipv6first');

import { Pool } from 'pg';

let connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:E87319ee@localhost:5432/blackworld';

// Defensive URL parser: If a user pastes a Supabase password with an '@' in it natively to Vercel,
// the pg parser breaks. We URL encode the password portion if an unescaped '@' is detected.
if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
  const parts = connectionString.split('@');
  if (parts.length > 2) {
    const tail = parts.pop();      // host:port/db
    const creds = parts.join('@'); // protocol://user:pass
    const protoIdx = creds.indexOf('://') + 3;
    const protocol = creds.slice(0, protoIdx);
    const auth = creds.slice(protoIdx);
    const colonIdx = auth.indexOf(':');
    if (colonIdx !== -1) {
      const user = auth.slice(0, colonIdx);
      const rawPass = auth.slice(colonIdx + 1);
      connectionString = `${protocol}${user}:${encodeURIComponent(rawPass)}@${tail}`;
    }
  }
}

/**
 * Returns the singleton Pool instance.
 * In development, caches on globalThis to survive Next.js hot-reloads.
 * In production (serverless), each cold start gets its own pool.
 *
 * @returns {import('pg').Pool}
 */
function getPool() {
  if (globalThis.__bw_pool) return globalThis.__bw_pool;

  const poolConfig = {
    connectionString,
    max: process.env.NODE_ENV === 'production' ? 2 : 20, // Strict 2 max per serverless instance
    idleTimeoutMillis: 30000,      // close idle clients after 30s
    connectionTimeoutMillis: 5000, // fail fast if can't connect in 5s
    statement_timeout: 10000,      // kill queries running > 10s
    query_timeout: 10000,          // client-side query timeout
  };

  // Ensure SSL is active and bypass strict CA checks for Supabase pooler
  if (connectionString.includes('supabase.co') || connectionString.includes('supabase.com')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);

  // In development, stash the pool on globalThis so the next HMR
  // cycle reuses the same pool instead of opening 20 new connections.
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__bw_pool = pool;
  }

  return pool;
}

/** @type {import('pg').Pool} */
const pool = getPool();

// ── Query Helpers ───────────────────────────────────────────────

/**
 * Execute a parameterized SQL query and return all rows.
 *
 * @param {string} query  - SQL string with $1, $2, ... placeholders
 * @param {any[]}  params - Values bound to the placeholders
 * @returns {Promise<{ data: Object[]|null, count: number, error: Error|null }>}
 */
export async function sql(query, params = []) {
  try {
    const res = await pool.query(query, params);
    return { data: res.rows, count: res.rowCount, error: null };
  } catch (err) {
    console.error('[DB ERROR]', err.message, '\nQuery:', query);
    return { data: null, count: 0, error: err };
  }
}

/**
 * Execute a parameterized SQL query and return exactly ONE row (or null).
 *
 * @param {string} query  - SQL string with $1, $2, ... placeholders
 * @param {any[]}  params - Values bound to the placeholders
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export async function sqlOne(query, params = []) {
  const { data, error } = await sql(query, params);
  if (error) return { data: null, error };
  if (!data || data.length === 0) return { data: null, error: null };
  return { data: data[0], error: null };
}

/**
 * Run a function inside a PostgreSQL transaction.
 * Automatically BEGINs, COMMITs on success, and ROLLBACKs on error.
 * The callback receives a dedicated `client` that MUST be used for
 * all queries within the transaction (not the shared pool).
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 * @returns {Promise<{ data: any, error: Error|null }>}
 *
 * @example
 * const { data, error } = await transaction(async (client) => {
 *   await client.query('UPDATE hero_stats SET gold = gold - $1 WHERE player_id = $2', [100, uid]);
 *   await client.query('INSERT INTO trade_log (player_id, action, gold_amount) VALUES ($1, $2, $3)', [uid, 'buy', -100]);
 *   return { success: true };
 * });
 */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return { data: result, error: null };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[TX ERROR]', err.message);
    return { data: null, error: err };
  } finally {
    client.release();
  }
}

export { pool };
