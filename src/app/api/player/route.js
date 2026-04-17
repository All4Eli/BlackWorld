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

  // Sanitize backwards-compatibility issues natively (Stale Emojis + Deprecated Quests)
  const legacyAsciiMap = { '⚔️': '⚔', '🩸': '♦', '🛡️': '⛨', '🦴': '✟', '🌋': '◬', '⛪': '⛫', '🌀': '❂', '💀': '☠', '💰': '¤', '💎': '✦', '✨': '▲', '☠️': '☠', '💨': '≈', '✉️': '✉', '🔔': '⚠', '❌': '✖', '💪': '♅', '🧠': '☤', '🏃': '≈', '🔮': '❂', '🎭': '♆', '⚡': 'ϟ' };
  
  if (data?.hero_data) {
     const h = data.hero_data;
     if (h.daily_quests) {
         h.daily_quests = h.daily_quests.filter(q => q.type !== 'ESSENCE_SPENT');
         h.daily_quests.forEach(q => { if (q.icon && legacyAsciiMap[q.icon]) q.icon = legacyAsciiMap[q.icon]; });
     }
     if (h.accepted_quests) {
         h.accepted_quests = h.accepted_quests.filter(q => q.type !== 'ESSENCE_SPENT');
         h.accepted_quests.forEach(q => { if (q.icon && legacyAsciiMap[q.icon]) q.icon = legacyAsciiMap[q.icon]; });
     }
     if (h.artifacts) {
         h.artifacts.forEach(a => { if (a.icon && legacyAsciiMap[a.icon]) a.icon = legacyAsciiMap[a.icon]; });
     }
  }

  // Inject trustworthy coven metadata into client payload
  const payload = {
     ...data,
     hero_data: {
       ...(data.hero_data || {}),
       coven_id: data.coven_id,
       coven_name: data.coven_name,
       coven_tag: data.coven_tag,
       coven_role: data.coven_role,
       bankedGold: data.bank_balance,
       pvp_flag: data.pvp_flag
     }
  };

  return NextResponse.json({ player: payload });
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
    const updatePayload = {
      stage,
      updated_at: new Date().toISOString()
    };
    
    // Only allow injection of hero_data on new character initialization
    // ALL OTHER hero_data updates MUST come from controlled gameplay APIs
    if (stage === 'CREATION' || existing.stage === 'BOOT') {
        updatePayload.hero_data = heroData;
        updatePayload.username = heroData?.name || existing.username;
        updatePayload.level = heroData?.level || existing.level || 1;
    }

    // Update existing record
    const { data, error } = await supabase
      .from('players')
      .update(updatePayload)
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
        hero_data: heroData,
        username: heroData?.name || 'Unknown',
        level: heroData?.level || 1
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ player: data });
  }
}
