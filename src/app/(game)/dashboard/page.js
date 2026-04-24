import { auth } from '@/lib/auth';
import * as HeroDal from '@/lib/db/dal/hero';
import * as InventoryDal from '@/lib/db/dal/inventory';
import { Playfair_Display } from 'next/font/google';
import { redirect } from 'next/navigation';

const playfair = Playfair_Display({ subsets: ['latin'] });

export default async function DashboardPage() {
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/');
  }

  // RSC: Fetch directly from DB instead of hitting our own /api/player
  const { data: stats } = await HeroDal.getHeroStats(userId);
  const { data: equipment } = await InventoryDal.getEquipment(userId);

  if (!stats) return <div className="p-8">Initializing character...</div>;

  const equipped = equipment || [];
  
  // Helpers
  const getSlot = (slotName) => equipped.find(e => e.slot === slotName);

  return (
    <div className="min-h-[100dvh] md:min-h-full p-8 max-w-5xl mx-auto text-gray-300 pb-20 md:pb-8">
      <header className="mb-12 border-b border-[#333] pb-6">
        <h1 className={`${playfair.className} text-4xl text-white tracking-widest uppercase`}>
          The Arsenal
        </h1>
        <p className="text-sm uppercase tracking-widest text-gray-500 mt-2">
          Review your armaments before descending into the abyss.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Stats overview */}
        <div className="col-span-1 space-y-8">
          <section className="bg-[#1a1a1a] p-6 border border-[#333]">
            <h2 className={`${playfair.className} text-xl text-[#8b0000] border-b border-[#333] pb-2 mb-4 tracking-widest uppercase`}>
              Vitals
            </h2>
            <ul className="space-y-3 text-sm uppercase tracking-widest">
              <li className="flex justify-between"><span>Level</span> <span className="text-white">{stats.level}</span></li>
              <li className="flex justify-between"><span>XP</span> <span className="text-white">{stats.xp.toLocaleString()}</span></li>
              <li className="flex justify-between"><span>Kills</span> <span className="text-white">{stats.kills.toLocaleString()}</span></li>
              <li className="flex justify-between"><span>Deaths</span> <span className="text-[#8b0000]">{stats.deaths.toLocaleString()}</span></li>
            </ul>
          </section>

          <section className="bg-[#1a1a1a] p-6 border border-[#333]">
            <h2 className={`${playfair.className} text-xl text-[#8b0000] border-b border-[#333] pb-2 mb-4 tracking-widest uppercase`}>
              Attributes
            </h2>
             <ul className="space-y-3 text-sm uppercase tracking-widest mb-4">
              <li className="flex justify-between"><span>Strength</span> <span className="text-white">{stats.str}</span></li>
              <li className="flex justify-between"><span>Dexterity</span> <span className="text-white">{stats.dex}</span></li>
              <li className="flex justify-between"><span>Intelligence</span> <span className="text-white">{stats.int}</span></li>
              <li className="flex justify-between"><span>Vitality</span> <span className="text-white">{stats.vit}</span></li>
              <li className="flex justify-between"><span>Defense</span> <span className="text-white">{stats.def}</span></li>
            </ul>
            {stats.unspent_points > 0 && (
                <div className="mt-4 p-3 border border-[#8b0000] bg-black text-center text-sm uppercase tracking-widest text-[#8b0000]">
                  Unspent Points: {stats.unspent_points}
                </div>
            )}
          </section>
        </div>

        {/* Right Column: Equipment */}
        <div className="col-span-1 lg:col-span-2">
          <section className="bg-[#1a1a1a] p-6 border border-[#333] h-full">
            <h2 className={`${playfair.className} text-xl text-[#8b0000] border-b border-[#333] pb-2 mb-6 tracking-widest uppercase`}>
              Equipped Gear
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['WEAPON', 'OFFHAND', 'HELMET', 'ARMOR', 'GLOVES', 'BOOTS', 'RING_1', 'RING_2'].map(slot => {
                const item = getSlot(slot);
                return (
                  <div key={slot} className="bg-[#050505] border border-[#333] p-4 flex flex-col justify-center min-h-[100px] hover:border-[#555] transition-colors">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 block">
                      {slot.replace('_', ' ')}
                    </span>
                    {item ? (
                      <div>
                        <div className="text-white text-sm font-bold uppercase tracking-widest flex justify-between items-center">
                          <span>{item.custom_name || item.item_name} {item.enhancement > 0 ? `+${item.enhancement}` : ''}</span>
                        </div>
                        {/* Short preview of base/rolled stats if present */}
                        <div className="text-xs text-[#8b0000] mt-2 tracking-wider">
                           {item.base_stats?.dmg ? `DMG: ${item.base_stats.dmg}` : ''}
                           {item.base_stats?.def ? `DEF: ${item.base_stats.def}` : ''}
                           {item.rolled_stats?.hp ? ` HP: ${item.rolled_stats.hp}` : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600 block">[ Empty Slot ]</span>
                    )}
                  </div>
                );
              })}
            </div>
            
          </section>
        </div>

      </div>
    </div>
  );
}
