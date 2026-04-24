import { auth } from '@/lib/auth';
import * as DungeonDal from '@/lib/db/dal/dungeons';
import * as HeroDal from '@/lib/db/dal/hero';
import ExplorationEngine from '@/components/game/ExplorationEngine';
import { redirect } from 'next/navigation';

export default async function ExplorePage() {
  const { userId } = await auth();
  if (!userId) redirect('/');

  // RSC Data fetching
  const { data: stats } = await HeroDal.getHeroStats(userId);
  if (!stats) return null;

  // Note: we fetch available dungeons directly
  const { data: dungeons } = await DungeonDal.getAvailableDungeons(userId, stats.level);

  // We could also pass active combat session if one exists to immediately resume it
  // But for this step, let's keep it simple.

  return (
    <div className="min-h-[100dvh] md:min-h-full p-8 max-w-5xl mx-auto text-gray-300 pb-20 md:pb-8">
      <ExplorationEngine 
        initialDungeons={dungeons || []} 
        playerLevel={stats.level} 
        playerHp={stats.hp}
        maxHp={stats.max_hp}
      />
    </div>
  );
}
