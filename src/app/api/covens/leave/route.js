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

      // 4. Decrement Coven Member Count
      if (coven) {
          await supabase
            .from('covens')
            .update({ member_count: Math.max(0, coven.member_count - 1) })
            .eq('id', covenId);
      }

      return NextResponse.json({ success: true });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
