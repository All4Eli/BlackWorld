import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zlrexmtlxxtzukpdcmhr.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_edEdRgfFWY6ay7rrK6l8mg_eqslG9Ve';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
