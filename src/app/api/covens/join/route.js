import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { covenId } = await request.json();
      
      if (!covenId) {
         return NextResponse.json({ error: 'Missing coven ID.' }, { status: 400 });
      }

      // 1. Fetch Coven Details
      const { data: coven, error: covenError } = await supabase
        .from('covens')
        .select('id, name, tag, member_count')
        .eq('id', covenId)
        .single();
        
      if (covenError) throw new Error('Coven not found.');

      // 2. Update the Player
      const { error: updateError } = await supabase
        .from('players')
        .update({
           coven_id: coven.id,
           coven_name: coven.name,
           coven_tag: coven.tag,
           coven_role: 'Member'
        })
        .eq('clerk_user_id', userId);

      if (updateError) throw updateError;

      // 3. Atomically increment Coven Member Count
      await supabase.rpc('increment_member_count', { coven_uuid: coven.id });

      return NextResponse.json({ success: true, coven });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
