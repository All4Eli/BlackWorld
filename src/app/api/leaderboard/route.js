import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
   try {
       // 1. The Ancients (Top 50 by Level)
       const { data: ancients, error: err1 } = await supabase
           .from('players')
           .select('clerk_user_id, username, level, hero_data')
           .order('level', { ascending: false })
           .limit(50);
       if (err1) throw err1;

       // 2. The Barons (Top 50 by Gold)
       // Supabase jsonb ordering directly via ->>'gold' requires cast. We can order by extracting in RPC, 
       // or if we rely on a generated column. Or simpler, fetch all and sort. 
       // Wait, players has a 'bank_balance' column natively!
       const { data: barons, error: err2 } = await supabase
           .from('players')
           .select('clerk_user_id, username, bank_balance')
           .order('bank_balance', { ascending: false, nullsFirst: false })
           .limit(50);
       if (err2) throw err2;

       // 3. Blood Champions (Top 50 by ELO)
       const { data: champions, error: err3 } = await supabase
           .from('pvp_stats')
           .select(`
               player_id, 
               elo_rating, 
               rank_tier, 
               win_streak,
               players!inner(clerk_user_id, username)
           `)
           .order('elo_rating', { ascending: false })
           .limit(50);
       if (err3) throw err3;

       return NextResponse.json({
           ancients: ancients || [],
           barons: barons || [],
           champions: champions || []
       });

   } catch (error) {
       console.error("Leaderboard Fetch Error:", error);
       return NextResponse.json({ error: error.message }, { status: 500 });
   }
}
