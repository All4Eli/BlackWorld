import { Covens, Composite } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      // 1. Fetch Player's Current Coven
      const { data: currentCoven } = await Covens.getPlayerCoven(userId);
      if (!currentCoven) throw new Error('Not in a coven.');

      if (currentCoven.role === 'Leader') {
          // Additional checks or block leader from leaving directly without transferring 
          return NextResponse.json({ error: 'Leaders cannot leave. Disband or transfer leadership first.' }, { status: 400 });
      }

      // 2. Remove member
      const { error: removeError } = await Covens.removeMember(currentCoven.id, userId);

      if (removeError) throw removeError;

      // 3. Fetch the mutated player row for authoritative response
      const { data: composite, error: fetchError } = await Composite.getFullPlayer(userId);
      if (fetchError || !composite) throw new Error('Failed to fetch updated player data.');
         
      const payload = {
         ...(composite.stats?.hero_data || {}),
         coven_id: null,
         coven_name: null,
         coven_tag: null,
         coven_role: 'Unpledged',
         bankedGold: composite.stats?.bank_balance,
         gold: composite.stats?.gold,
         hp: composite.stats?.hp,
         max_hp: composite.stats?.max_hp,
         level: composite.stats?.level
      };

      return NextResponse.json({ success: true, updatedHero: payload });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

