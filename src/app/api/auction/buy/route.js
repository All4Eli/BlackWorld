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

      // 1. Fetch the Auction
      const { data: auction, error: auctionError } = await supabase
        .from('auctions')
        .select('*')
        .eq('id', auctionId)
        .eq('status', 'ACTIVE')
        .single();
        
      if (auctionError || !auction) throw new Error('Auction no longer available.');

      if (auction.seller_id === userId) {
         throw new Error('You cannot buy your own auction.');
      }

      // 2. Mark as SOLD (optimistic lock pattern)
      const { data: updateData, error: lockError } = await supabase
        .from('auctions')
        .update({ status: 'SOLD' })
        .eq('id', auctionId)
        .eq('status', 'ACTIVE') // Ensure it wasn't bought a split second ago
        .select()
        .single();

      if (lockError || !updateData) throw new Error('Failed to resolve transaction. It may have already sold.');

      // 3. Deposit gold into Seller's Bank (Fetch current bank balance first)
      const { data: sellerData } = await supabase
        .from('players')
        .select('bank_balance')
        .eq('clerk_user_id', auction.seller_id)
        .single();

      const newBalance = (sellerData?.bank_balance || 0) + auction.buyout_price;

      await supabase
        .from('players')
        .update({ bank_balance: newBalance })
        .eq('clerk_user_id', auction.seller_id);

      // 4. Send Notification to Seller
      await supabase
        .from('notifications')
        .insert({
           user_id: auction.seller_id,
           type: 'MARKET',
           message: `Your auction for [${auction.item_name}] has sold for ${auction.buyout_price}g! The funds have been deposited in your Bank.`
        });

      // 5. Reconstruct the item object to return to the buyer
      const purchasedItem = {
          id: auction.item_id, // Keep exact original ID or generate new? We'll keep it so stats match
          name: auction.item_name,
          type: auction.item_type,
          rarity: auction.item_rarity,
          stats: auction.item_stats
      };

      return NextResponse.json({ success: true, item: purchasedItem });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
