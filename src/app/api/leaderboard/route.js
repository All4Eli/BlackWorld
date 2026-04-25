import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

export async function GET() {
   try {
       // 1. The Ancients (Top 50 by Level)
       const { data: ancients, error: err1 } = await sql(
         `SELECT p.clerk_user_id, p.username, h.level
          FROM players p JOIN hero_stats h ON p.clerk_user_id = h.player_id
          WHERE p.deleted_at IS NULL
          ORDER BY h.level DESC LIMIT 50`
       );
       if (err1) throw err1;

       // 2. The Barons (Top 50 by Gold)
       const { data: barons, error: err2 } = await sql(
         `SELECT p.clerk_user_id, p.username, h.bank_balance
          FROM players p JOIN hero_stats h ON p.clerk_user_id = h.player_id
          WHERE p.deleted_at IS NULL
          ORDER BY h.bank_balance DESC NULLS LAST LIMIT 50`
       );
       if (err2) throw err2;

       // 3. Blood Champions (Top 50 by ELO)
       const { data: champions, error: err3 } = await sql(
         `SELECT pv.player_id, pv.elo_rating, pv.rank_tier, pv.win_streak, p.username
          FROM pvp_stats pv JOIN players p ON pv.player_id = p.clerk_user_id
          ORDER BY pv.elo_rating DESC LIMIT 50`
       );
       if (err3) throw err3;

       return NextResponse.json({
           ancients: ancients || [],
           barons: barons || [],
           champions: champions || []
       });

   } catch (error) {
       console.error("[Leaderboard]", error.message);
       return NextResponse.json({ error: error.message }, { status: 500 });
   }
}
