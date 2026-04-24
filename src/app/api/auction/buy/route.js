import { withMiddleware } from '@/lib/middleware';
import { Composite, HeroStats, sql } from '@/lib/dal';
import { NextResponse } from 'next/server';

async function handlePost(request) {
  const { userId } = await import('@/lib/auth').then(m => m.auth());
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { auctionId } = await request.json();
      
      if (!auctionId) {
         return NextResponse.json({ error: 'Missing auction ID.' }, { status: 400 });
      }

      // 1. Fetch auction safely
      const { data: auctionRows, error: auctionError } = await sql(`
          SELECT * FROM auctions WHERE id = $1 AND status = 'ACTIVE' AND expires_at >= NOW()
      `, [auctionId]);

      if (auctionError || !auctionRows.length) {
          return NextResponse.json({ error: 'Auction not found or no longer active.' }, { status: 404 });
      }

      const auction = auctionRows[0];

      // Prevent buying own auction
      if (auction.seller_id === userId) {
          return NextResponse.json({ error: 'Cannot buy your own auction.' }, { status: 400 });
      }

      // 2. Fetch Buyer
      const { data: composite, error: buyerError } = await Composite.getFullPlayer(userId);

      if (buyerError || !composite || !composite.stats) throw new Error('Player not found.');

      const currentGold = composite.stats.gold || 0;
      if (currentGold < auction.buyout_price) {
          return NextResponse.json({ error: 'Insufficient gold.' }, { status: 400 });
      }

      // 3. Mark Auction as Sold (Atomic)
      const { data: updatedAuctionRows, error: updateAuctionError } = await sql(`
          UPDATE auctions 
          SET status = 'SOLD', buyer_id = $1 
          WHERE id = $2 AND status = 'ACTIVE' 
          RETURNING *
      `, [userId, auctionId]);

      if (updateAuctionError || !updatedAuctionRows.length) {
          return NextResponse.json({ error: 'Auction was already sold.' }, { status: 409 });
      }

      // 4. Give Gold to Seller safely (fails gracefully if seller deleted)
      await HeroStats.addGold(auction.seller_id, auction.buyout_price).catch(console.error);

      // 5. Build injected item & mutate buyer
      const itemToInject = {
          id: auction.item_id,
          name: auction.item_name,
          type: auction.item_type,
          rarity: auction.item_rarity,
          stats: auction.item_stats
      };

      let heroData = composite.stats.hero_data || {};
      if (!heroData.artifacts) heroData.artifacts = [];
      heroData.artifacts.push(itemToInject);

      // 6. Update Buyer Record
      const newBalance = currentGold - auction.buyout_price;
      const { error: finalizeError } = await HeroStats.update(userId, { 
          gold: newBalance,
          hero_data: heroData 
      });

      if (finalizeError) throw finalizeError;

      // 7. Rebuild frontend payload
      const updatedHero = {
          ...heroData,
          coven_id: composite.coven?.id,
          coven_name: composite.coven?.name,
          coven_tag: composite.coven?.tag,
          coven_role: composite.coven?.role,
          bankedGold: composite.stats.bank_balance,
          gold: newBalance,
          hp: composite.stats.hp,
          max_hp: composite.stats.max_hp,
          level: composite.stats.level
      };

      return NextResponse.json({ success: true, item: updatedAuctionRows[0], updatedHero });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = withMiddleware(handlePost, { requireAuth: true, rateLimit: 'auction_buy', idempotency: true });


