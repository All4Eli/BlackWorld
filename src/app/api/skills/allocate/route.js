import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { sqlOne } from '@/lib/db/pool';
import { HeroStats } from '@/lib/dal';
import { SKILL_TREE } from '@/lib/skillTree';

// ═══════════════════════════════════════════════════════════════════
// POST /api/skills/allocate — Spend one skill point
// ═══════════════════════════════════════════════════════════════════
//
// NORMALIZED: No longer reads or spreads hero_data JSONB.
// Returns ONLY the updated skill-related fields for shallow merge.
// ═══════════════════════════════════════════════════════════════════

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { skillId } = await request.json();

      // Read ONLY the columns we need (no hero_data)
      const { data: heroRow, error } = await sqlOne(
        'SELECT skill_points, skill_points_unspent FROM hero_stats WHERE player_id = $1',
        [userId]
      );
      if (error || !heroRow) throw new Error('Player not found');

      const currentPoints = heroRow.skill_points || {};
      const availablePoints = heroRow.skill_points_unspent || 0;

      if (availablePoints <= 0) {
          return NextResponse.json({ error: 'No skill points available.' }, { status: 400 });
      }

      let targetSkill = null;
      for (const branch of Object.values(SKILL_TREE)) {
          const found = branch.skills.find(s => s.id === skillId);
          if (found) { targetSkill = found; break; }
      }

      if (!targetSkill) return NextResponse.json({ error: 'Skill not found.' }, { status: 400 });

      const currentRank = currentPoints[skillId] || 0;
      if (currentRank >= targetSkill.maxRank) {
          return NextResponse.json({ error: 'Skill is already maxed.' }, { status: 400 });
      }

      if (targetSkill.requires) {
          const reqRank = currentPoints[targetSkill.requires] || 0;
          if (reqRank < targetSkill.reqRank) {
              return NextResponse.json({ error: 'Prerequisites not met.' }, { status: 400 });
          }
      }

      const { data: updated, error: updateErr } = await HeroStats.allocateSkillPoint(userId, skillId, currentPoints);
      if (updateErr) throw updateErr;

      // Return ONLY skill-related fields for shallow merge.
      // The client's updateHero() merges these into the existing hero state,
      // so level, gold, xp, etc. are all preserved.
      return NextResponse.json({
        success: true,
        updatedHero: {
          skillPoints: updated.skill_points || { ...currentPoints, [skillId]: currentRank + 1 },
          skillPointsUnspent: updated.skill_points_unspent ?? (availablePoints - 1),
        }
      });

  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
