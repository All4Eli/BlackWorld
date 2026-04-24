import { Covens, HeroStats, Composite, sql } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
      const { data, error } = await sql(`
          SELECT c.id, c.name, c.tag, c.description, c.leader_id, 
                 (SELECT COUNT(*) FROM coven_members cm WHERE cm.coven_id = c.id) as member_count
          FROM covens c 
          WHERE c.deleted_at IS NULL
          ORDER BY member_count DESC 
          LIMIT 50
      `);
      if (error) throw error;
      return NextResponse.json({ covens: data });
  } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
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
      const { data: composite, error: playerError } = await Composite.getFullPlayer(userId);

      if (playerError || !composite || !composite.stats) throw new Error('Player not found.');

      if ((composite.stats.gold || 0) < 1000) {
        return NextResponse.json({ error: 'Not enough gold.' }, { status: 400 });
      }

      const { data: currentCoven } = await Covens.getPlayerCoven(userId);
      if (currentCoven) {
          return NextResponse.json({ error: 'You are already in a Coven.' }, { status: 400 });
      }

      // 2. Create the Coven
      const { data: newCoven, error: createError } = await Covens.create(name, tag.toUpperCase(), userId, description);
        
      if (createError) throw createError;

      // 3. Add Leader to Members
      const { error: addMemberError } = await Covens.addMember(newCoven.id, userId, 'Leader');
      if (addMemberError) throw addMemberError;

      // 4. Deduct Gold
      const { error: updateError } = await HeroStats.update(userId, { gold: composite.stats.gold - 1000 });

      if (updateError) throw updateError;
      
      // Inject updated payload
      const payload = {
         ...(composite.stats.hero_data || {}),
         coven_id: newCoven.id,
         coven_name: newCoven.name,
         coven_tag: newCoven.tag,
         coven_role: 'Leader',
         bankedGold: composite.stats.bank_balance,
         gold: composite.stats.gold - 1000,
         hp: composite.stats.hp,
         max_hp: composite.stats.max_hp,
         level: composite.stats.level
      };

      return NextResponse.json({ coven: newCoven, updatedHero: payload });
  } catch(err) {
      if (err.code === '23505') { // Postgres Uniqueness violation
         return NextResponse.json({ error: 'A Coven with that name already exists.' }, { status: 400 });
      }
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

