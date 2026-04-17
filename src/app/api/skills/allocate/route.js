import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { SKILL_TREE } from '@/lib/skillTree';

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { skillId } = await request.json();

      const { data: player, error } = await supabase
          .from('players')
          .select('id, hero_data')
          .eq('clerk_user_id', userId)
          .single();

      if (error || !player) throw new Error('Player not found');

      let hero = player.hero_data || {};
      const availablePoints = hero.skillPointsUnspent || hero.unspentSkillPoints || 0;
      
      if (availablePoints <= 0) {
          return NextResponse.json({ error: 'No skill points available.' }, { status: 400 });
      }

      // Find the requested skill in the library to validate it exists and check level cap
      let targetSkill = null;
      for (const branch of Object.values(SKILL_TREE)) {
          const found = branch.skills.find(s => s.id === skillId);
          if (found) { targetSkill = found; break; }
      }

      if (!targetSkill) {
          return NextResponse.json({ error: 'Skill not found.' }, { status: 400 });
      }

      // Initialize points blob if undefined
      if (!hero.skillPoints) hero.skillPoints = {};
      
      const currentRank = hero.skillPoints[skillId] || 0;
      if (currentRank >= targetSkill.maxRank) {
          return NextResponse.json({ error: 'Skill is already maxed.' }, { status: 400 });
      }

      // Validate prerequisites
      if (targetSkill.requires) {
          const reqRank = hero.skillPoints[targetSkill.requires] || 0;
          if (reqRank < targetSkill.reqRank) {
              return NextResponse.json({ error: 'Prerequisites not met.' }, { status: 400 });
          }
      }

      // Execute Allocation
      hero.skillPoints[skillId] = currentRank + 1;
      hero.skillPointsUnspent = availablePoints - 1;

      // Persist to database
      const { error: updateError } = await supabase
          .from('players')
          .update({ hero_data: hero })
          .eq('clerk_user_id', userId);

      if (updateError) throw updateError;

      return NextResponse.json({ success: true, updatedHero: hero });

  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
