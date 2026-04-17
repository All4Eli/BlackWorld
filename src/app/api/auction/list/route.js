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

      // 1. Fetch player
      const { data: player, error: playerError } = await supabase
          .from('players')
          .select('hero_data')
          .eq('clerk_user_id', userId)
          .single();

      if (playerError || !player) throw new Error('Player not found.');

      let hero = player.hero_data || {};
      const artifacts = hero.artifacts || [];

      // Find the artifact to remove
      const itemIdx = artifacts.findIndex(a => a.id === item.id);
      if (itemIdx === -1) {
          return NextResponse.json({ error: 'Item not found in inventory.' }, { status: 404 });
      }

      // Remove item
      hero.artifacts.splice(itemIdx, 1);

      // 2. Insert into Auctions table
      const { data: auction, error: insertError } = await supabase
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

      if (insertError) throw new Error(insertError.message);

      // 3. Update player data
      const { error: updateError } = await supabase
          .from('players')
          .update({ hero_data: hero })
          .eq('clerk_user_id', userId);

      if (updateError) throw updateError;

      return NextResponse.json({ auction, updatedHero: hero });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
