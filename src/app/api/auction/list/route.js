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

      const { data: auction, error } = await supabase.rpc('execute_auction_list', {
          p_seller_id: userId,
          p_seller_name: sellerName || 'Unknown',
          p_item_id: item.id,
          p_item_name: item.name,
          p_item_type: item.type,
          p_item_rarity: item.rarity,
          p_item_stats: item.stats,
          p_buyout_price: buyoutPrice
      });

      if (error) throw new Error(error.message);

      return NextResponse.json({ auction });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
