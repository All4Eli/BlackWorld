import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  if (!id) return NextResponse.json({ error: 'Missing coven ID' }, { status: 400 });

  try {
      // 1. Fetch Coven basic data
      const { data: coven, error: covenError } = await supabase
        .from('covens')
        .select('*')
        .eq('id', id)
        .single();
        
      if (covenError) throw covenError;

      // 2. Fetch Coven Roster from players table
      // We only want lightweight data to avoid leaking hero stats if not intended
      const { data: roster, error: rosterError } = await supabase
        .from('players')
        .select('clerk_user_id, username, level, coven_role')
        .eq('coven_id', id)
        .order('level', { ascending: false });

      if (rosterError) throw rosterError;

      return NextResponse.json({ coven, roster });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
