'use client';
import { calculateSkillBonuses } from '@/lib/skillTree';

export default function DashboardView({ hero }) {
  const sb = calculateSkillBonuses(hero?.skillPoints || {});
  
  const currentHp = hero?.hp ?? 0;
  const maxHp = (hero?.maxHp ?? 100) + sb.maxHp;
  const currentLevel = hero?.level ?? 1;
  const currentXp = hero?.xp ?? 0;
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Primary Hero Plaque */}
      <section className="lg:col-span-1 border border-neutral-900 bg-[#050505] p-8 shadow-[0_0_20px_rgba(0,0,0,0.8)] flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-red-950/20 border border-red-900/50 flex flex-col items-center justify-center text-red-600 mb-6 shadow-inner">
          <span className="text-4xl font-serif leading-none mt-2">†</span>
          <span className="text-[10px] font-mono mt-1 opacity-50">SOUL</span>
        </div>
        
        <h2 className="text-3xl font-black uppercase tracking-widest text-stone-200 mb-2 font-serif">{hero?.name}</h2>
        <div className="text-red-700 font-mono text-xs uppercase tracking-widest bg-red-950/30 px-4 py-1 border border-red-900/30 mb-8">
          Level {currentLevel}
        </div>
        
        <div className="w-full space-y-4">
          <div>
             <div className="flex justify-between text-[10px] font-mono uppercase text-stone-500 mb-1">
               <span>Prowess</span><span>{currentXp} / 100 XP</span>
             </div>
             <div className="h-1 bg-neutral-900 w-full">
               <div className="h-full bg-stone-400" style={{ width: `${Math.min(100, currentXp)}%` }} />
             </div>
          </div>
          <div>
             <div className="flex justify-between text-[10px] font-mono uppercase text-stone-500 mb-1">
               <span>Integrity</span><span className="text-red-500">{currentHp} / {maxHp}</span>
             </div>
             <div className="h-1 bg-neutral-900 w-full">
               <div className="h-full bg-red-700" style={{ width: `${(currentHp / maxHp) * 100}%` }} />
             </div>
          </div>
          <div className="pt-4 border-t border-neutral-900 flex justify-between font-mono">
            <div className="text-center w-1/2 border-r border-neutral-900">
              <div className="text-[10px] text-stone-600 uppercase mb-1">Gold</div>
              <div className="text-yellow-600 text-lg font-bold">{hero?.gold || 0}g</div>
            </div>
            <div className="text-center w-1/2">
              <div className="text-[10px] text-stone-600 uppercase mb-1">Entities Slain</div>
              <div className="text-stone-300 text-lg font-bold tracking-widest">{hero?.kills || 0}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Breakdown */}
      <section className="lg:col-span-2 flex flex-col gap-8">
        
        <div className="border border-neutral-900 bg-black/40 p-6 flex-1">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">Combat Math</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 font-mono text-xs text-stone-500">
            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Attack Damage</div>
              <div className="text-lg text-stone-200">
                {(hero?.baseDmg || 12) + (hero?.equippedWeapon?.stat || 0) + (sb.baseDmg || 0)}
                <span className="text-stone-600 text-[10px] ml-2">BASE + GEAR</span>
              </div>
            </div>
            
            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Magic Power</div>
              <div className="text-lg text-purple-400">{sb.magicDmg || 0}</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Maximum Mana</div>
              <div className="text-lg text-blue-400">{50 + (sb.maxMana || 0)}</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Critical Chance</div>
              <div className="text-lg text-yellow-600">{sb.critChance || 0}%</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Damage Reduction</div>
              <div className="text-lg text-stone-400">{sb.damageReduction || 0}</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Lifesteal</div>
              <div className="text-lg text-red-400">{sb.lifesteal || 0} HP/HIT</div>
            </div>
          </div>
        </div>

        <div className="border border-neutral-900 bg-black/40 p-6 flex-1">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">Equipped Instruments</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-neutral-800 bg-[#030303] p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-stone-600 uppercase tracking-widest">Main Hand</div>
                {hero?.equippedWeapon ? (
                  <div className="text-stone-300 font-bold tracking-widest uppercase text-sm mt-1">{hero.equippedWeapon.name}</div>
                ) : (
                  <div className="text-stone-700 italic text-sm mt-1">Empty Hands</div>
                )}
              </div>
              {hero?.equippedWeapon && <div className="text-stone-500 font-mono text-xs">+{hero.equippedWeapon.stat} DMG</div>}
            </div>

            <div className="border border-neutral-800 bg-[#030303] p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-stone-600 uppercase tracking-widest">Body</div>
                {hero?.equippedArmor ? (
                  <div className="text-stone-300 font-bold tracking-widest uppercase text-sm mt-1">{hero.equippedArmor.name}</div>
                ) : (
                  <div className="text-stone-700 italic text-sm mt-1">Rags</div>
                )}
              </div>
              {hero?.equippedArmor && <div className="text-stone-500 font-mono text-xs">+{hero.equippedArmor.stat} HP</div>}
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}
