import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('covens')
    .select('id, name, tag, description, member_count, leader_id')
    .order('member_count', { ascending: false })
    .limit(50);
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ covens: data });
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { name, tag, description } = await request.json();
      
      if (!name || name.length < 3 || !tag || tag.length < 2 || tag.length > 5) {
         return NextResponse.json({ error: 'Invalid name or tag format.' }, { status: 400 });
      }

      // 1. Validate Gold First
      const { data: playerRows, error: pError } = await supabase
        .from('players')
        .select('*')
        .eq('clerk_user_id', userId)
        .single();

      if (pError || !playerRows) throw new Error('Player not found.');

      let hero = playerRows.hero_data || {};
      if ((hero.gold || 0) < 1000) {
        return NextResponse.json({ error: 'Not enough gold.' }, { status: 400 });
      }

      // 2. Create the Coven
      const { data: newCoven, error: createError } = await supabase
        .from('covens')
        .insert({
           name,
           tag: tag.toUpperCase(),
           description,
           leader_id: userId,
           member_count: 1
        })
        .select()
        .single();
        
      if (createError) throw createError;

      // 3. Deduct Gold & Update the Creator's player row
      hero.gold -= 1000;
      
      const { data: updatedPlayerRows, error: updateError } = await supabase
        .from('players')
        .update({
           hero_data: hero,
           coven_id: newCoven.id,
           coven_name: newCoven.name,
           coven_tag: newCoven.tag,
           coven_role: 'Leader'
        })
        .eq('clerk_user_id', userId)
        .select('*')
        .single();

      if (updateError) throw updateError;
      
      // Inject updated payload
      const payload = {
         ...(updatedPlayerRows?.hero_data || {}),
         coven_id: updatedPlayerRows?.coven_id,
         coven_name: updatedPlayerRows?.coven_name,
         coven_tag: updatedPlayerRows?.coven_tag,
         coven_role: updatedPlayerRows?.coven_role,
         bankedGold: updatedPlayerRows?.bank_balance
      };

      return NextResponse.json({ coven: newCoven, updatedHero: payload });
  } catch(err) {
      if (err.code === '23505') { // Postgres Uniqueness violation
         return NextResponse.json({ error: 'A Coven with that name already exists.' }, { status: 400 });
      }
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
