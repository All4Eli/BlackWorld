import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { auctionId } = await request.json();
      
      if (!auctionId) {
         return NextResponse.json({ error: 'Missing auction ID.' }, { status: 400 });
      }

      // Trigger Atomic PostgreSQL RPC
      const { data: item, error } = await supabase.rpc('execute_auction_purchase', {
          p_buyer_id: userId,
          p_auction_id: auctionId
      });

      if (error) {
          throw new Error(error.message);
      }

      const { data: player } = await supabase
          .from('players')
          .select('hero_data')
          .eq('clerk_user_id', userId)
          .single();

      return NextResponse.json({ success: true, item, updatedHero: player?.hero_data });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
