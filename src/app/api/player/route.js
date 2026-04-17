import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// GET /api/player — Load player save data for the signed-in user
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('clerk_user_id', userId)
    .single();

  if (error && error.code === 'PGRST116') {
    // No row found — new player
    return NextResponse.json({ player: null });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ player: data });
}

// POST /api/player — Save/update player data
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { stage, heroData } = body;

  // Check if player already exists
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('clerk_user_id', userId)
    .single();

  if (existing) {
    // Update existing record
    const { data, error } = await supabase
      .from('players')
      .update({
        stage,
        hero_data: heroData,
        updated_at: new Date().toISOString()
      })
      .eq('clerk_user_id', userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ player: data });
  } else {
    // Insert new record
    const { data, error } = await supabase
      .from('players')
      .insert({
        clerk_user_id: userId,
        stage,
        hero_data: heroData
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ player: data });
  }
}
