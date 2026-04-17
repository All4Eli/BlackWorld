import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      // 1. Fetch Player's Current Coven ID
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('coven_id')
        .eq('clerk_user_id', userId)
        .single();
        
      if (playerError || !player?.coven_id) throw new Error('Not in a coven.');

      const covenId = player.coven_id;

      // 2. Fetch Coven Details
      const { data: coven } = await supabase
        .from('covens')
        .select('id, member_count')
        .eq('id', covenId)
        .single();

      // 3. Update the Player (clear coven fields)
      const { error: updateError } = await supabase
        .from('players')
        .update({
           coven_id: null,
           coven_name: null,
           coven_tag: null,
           coven_role: 'Unpledged'
        })
        .eq('clerk_user_id', userId);

      if (updateError) throw updateError;

      // 4. Atomically decrement Coven Member Count
      if (coven) {
          await supabase.rpc('decrement_member_count', { coven_uuid: coven.id });
      }

      // Fetch the mutated player row for authoritative response
      const { data: updatedPlayer } = await supabase
         .from('players')
         .select('*')
         .eq('clerk_user_id', userId)
         .single();
         
      const payload = {
         ...(updatedPlayer?.hero_data || {}),
         coven_id: updatedPlayer?.coven_id,
         coven_name: updatedPlayer?.coven_name,
         coven_tag: updatedPlayer?.coven_tag,
         coven_role: updatedPlayer?.coven_role,
         bankedGold: updatedPlayer?.bank_balance
      };

      return NextResponse.json({ success: true, updatedHero: payload });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
