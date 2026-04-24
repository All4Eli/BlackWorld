import { auth } from '@/lib/auth';
import { sqlOne } from '@/lib/db/pool';
import { redirect } from 'next/navigation';
import CovenDashboard from '@/components/game/CovenDashboard';
import * as HeroDal from '@/lib/db/dal/hero';

export const revalidate = 0; // Don't statically cache Coven pages since treasuries move fast

export default async function CovensPage() {
  const { userId } = await auth();
  if (!userId) redirect('/');

  // 1. Fetch Gold
  const { data: hero } = await HeroDal.getHeroStats(userId);
  if (!hero) return null;

  // 2. Fetch Coven Data directly using the pool
  const { data: member } = await sqlOne(
      `SELECT coven_id, role, contribution FROM coven_members WHERE player_id = $1`,
      [userId]
  );

  let covenData = null;

  if (member) {
      const { data: coven } = await sqlOne(
          `SELECT id, name, tag, treasury, max_members, level FROM covens WHERE id = $1 AND deleted_at IS NULL`,
          [member.coven_id]
      );

      // We could also do a quick COUNT(*) on coven_members for memberCount
      const { data: countRow } = await sqlOne(
          `SELECT COUNT(*)::int as count FROM coven_members WHERE coven_id = $1`,
          [coven.id]
      );

      covenData = {
          ...coven,
          role: member.role,
          contribution: member.contribution,
          memberCount: countRow?.count || 1
      };
  }

  return (
      <div className="min-h-[100dvh] md:min-h-full p-8 max-w-5xl mx-auto text-gray-300 pb-20 md:pb-8">
         <CovenDashboard initialCoven={covenData} playerGold={hero.gold} />
      </div>
  );
}
