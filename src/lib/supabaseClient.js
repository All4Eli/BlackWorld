import { createClient } from '@supabase/supabase-js';

// Client-side module — runs in the browser.
// In local dev, client components cannot use 'pg' (Node-only).
// Instead, they should call API routes which handle DB access server-side.
// For client-side Supabase features like Realtime, we still need the Supabase client,
// but we stub it in dev mode if credentials are missing.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

let supabaseInstance;

if (supabaseUrl !== 'https://placeholder.supabase.co') {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Stub for local dev when no Supabase credentials are set
  const noopQuery = () => ({ data: [], error: null, count: 0 });
  supabaseInstance = {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => noopQuery(), ...noopQuery() }), order: () => ({ limit: () => noopQuery(), ...noopQuery() }), ...noopQuery() }),
      insert: () => noopQuery(),
      update: () => ({ eq: () => noopQuery(), ...noopQuery() }),
      delete: () => ({ eq: () => noopQuery(), ...noopQuery() }),
    }),
    channel: (name) => {
      const stub = {
        on: () => stub,
        subscribe: (cb) => { if (cb) setTimeout(() => cb('SUBSCRIBED'), 0); return stub; },
        track: () => Promise.resolve(),
        untrack: () => Promise.resolve(),
        presenceState: () => ({}),
      };
      return stub;
    },
    removeChannel: () => Promise.resolve(),
  };
}

export const supabase = supabaseInstance;
