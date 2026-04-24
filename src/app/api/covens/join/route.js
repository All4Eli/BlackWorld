import { Covens, Composite } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { covenId } = await request.json();
      
      if (!covenId) {
         return NextResponse.json({ error: 'Missing coven ID.' }, { status: 400 });
      }

      // Check if already in a coven
      const { data: currentCoven } = await Covens.getPlayerCoven(userId);
      if (currentCoven) {
          return NextResponse.json({ error: 'You are already in a Coven.' }, { status: 400 });
      }

      // 1. Fetch Coven Details
      const { data: coven, error: covenError } = await Covens.getById(covenId);
        
      if (covenError || !coven) throw new Error('Coven not found.');

      // 2. Add member
      const { error: updateError } = await Covens.addMember(coven.id, userId, 'Member');

      if (updateError) throw updateError;

      // Fetch the mutated player row for authoritative response
      const { data: composite, error: fetchError } = await Composite.getFullPlayer(userId);
      if (fetchError || !composite) throw new Error('Failed to fetch updated player data.');
         
      const payload = {
         ...(composite.stats?.hero_data || {}),
         coven_id: composite.coven?.id,
         coven_name: composite.coven?.name,
         coven_tag: composite.coven?.tag,
         coven_role: composite.coven?.role,
         bankedGold: composite.stats?.bank_balance,
         gold: composite.stats?.gold,
         hp: composite.stats?.hp,
         max_hp: composite.stats?.max_hp,
         level: composite.stats?.level
      };

      return NextResponse.json({ success: true, coven, updatedHero: payload });
  } catch(err) {
      if (err.code === '23505') {
          return NextResponse.json({ error: 'You are already in a Coven.' }, { status: 400 });
      }
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

