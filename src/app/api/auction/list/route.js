import { Composite, HeroStats, sql } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { item, buyoutPrice, sellerName } = await request.json();
      
      if (!item || buyoutPrice <= 0) {
         return NextResponse.json({ error: 'Invalid listing details.' }, { status: 400 });
      }

      // 1. Fetch player
      const { data: composite, error: playerError } = await Composite.getFullPlayer(userId);

      if (playerError || !composite || !composite.stats) throw new Error('Player not found.');

      let hero = composite.stats.hero_data || {};
      const artifacts = hero.artifacts || [];

      // Find the artifact to remove
      const itemIdx = artifacts.findIndex(a => a.id === item.id);
      if (itemIdx === -1) {
          return NextResponse.json({ error: 'Item not found in inventory.' }, { status: 404 });
      }

      // Remove item
      hero.artifacts.splice(itemIdx, 1);

      // 2. Insert into Auctions table
      const { data: auctionRows, error: insertError } = await sql(`
          INSERT INTO auctions (seller_id, seller_name, item_id, item_name, item_type, item_rarity, item_stats, buyout_price)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
      `, [userId, sellerName || 'Unknown', item.id, item.name, item.type, item.rarity, item.stats, buyoutPrice]);

      if (insertError) throw new Error(insertError.message);
      
      const auction = auctionRows[0];

      // 3. Update player data
      const { error: updateError } = await HeroStats.update(userId, { hero_data: hero });

      if (updateError) throw updateError;

      // Ensure updated hero payload matches frontend expectations
      const updatedHero = {
          ...hero,
          coven_id: composite.coven?.id,
          coven_name: composite.coven?.name,
          coven_tag: composite.coven?.tag,
          coven_role: composite.coven?.role,
          bankedGold: composite.stats.bank_balance,
          gold: composite.stats.gold,
          hp: composite.stats.hp,
          max_hp: composite.stats.max_hp,
          level: composite.stats.level
      };

      return NextResponse.json({ auction, updatedHero });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

