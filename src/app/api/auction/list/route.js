import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { item, buyoutPrice, sellerName } = await request.json();
      
      if (!item || buyoutPrice <= 0) {
         return NextResponse.json({ error: 'Invalid listing details.' }, { status: 400 });
      }

      // Check if user has an active listing limit (optional, let's say 10max)
      const { count } = await supabase
        .from('auctions')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'ACTIVE');
        
      if (count >= 10) {
          return NextResponse.json({ error: 'You cannot have more than 10 active listings.' }, { status: 400 });
      }

      // Create the auction
      const { data, error } = await supabase
        .from('auctions')
        .insert({
           seller_id: userId,
           seller_name: sellerName || 'Unknown',
           item_id: item.id,
           item_name: item.name,
           item_type: item.type,
           item_rarity: item.rarity,
           item_stats: item.stats,
           buyout_price: buyoutPrice
        })
        .select()
        .single();
        
      if (error) throw error;

      return NextResponse.json({ auction: data });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
