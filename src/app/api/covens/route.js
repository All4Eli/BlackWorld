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

      // 1. Create the Coven
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

      // 2. Update the Creator's player row
      const { error: updateError } = await supabase
        .from('players')
        .update({
           coven_id: newCoven.id,
           coven_name: newCoven.name,
           coven_tag: newCoven.tag,
           coven_role: 'Leader'
        })
        .eq('clerk_user_id', userId);

      if (updateError) throw updateError;

      return NextResponse.json({ coven: newCoven });
  } catch(err) {
      if (err.code === '23505') { // Postgres Uniqueness violation
         return NextResponse.json({ error: 'A Coven with that name already exists.' }, { status: 400 });
      }
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
