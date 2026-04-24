import { createClient } from '@supabase/supabase-js';
import { supabase as localPgBase } from './db';

// Dual-Target Routing
const USE_LOCAL_PG = process.env.NODE_ENV === 'development';

let supabaseInstance;
if (USE_LOCAL_PG) {
    console.log('[DB PROTOCOL] Booting Local PostgreSQL Wrapper');
    supabaseInstance = localPgBase;
} else {
    // Server-side only — never exposed to the browser
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'dummy_key';
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
}

export const supabase = supabaseInstance;
