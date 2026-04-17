'use client';
import { calculateSkillBonuses } from '@/lib/skillTree';
import { calcCombatStats } from '@/lib/gameData';
import DailyLoginCalendar from './DailyLoginCalendar';

export default function DashboardView({ hero, updateHero }) {
  const sb = calculateSkillBonuses(hero?.skillPoints || {});
  const c = calcCombatStats(hero, sb);
  
  const currentHp = hero?.hp ?? 0;
  const maxHp = c.maxHp;
  const currentLevel = hero?.level ?? 1;
  const currentXp = hero?.xp ?? 0;
  
  const str = hero?.str ?? 5;
  const def = hero?.def ?? 5;
  const dex = hero?.dex ?? 5;
  const int = hero?.int ?? 5;
  const vit = hero?.vit ?? 5;
  const unspentStats = hero?.unspentStatPoints ?? 0;

  const getTierColor = (tier) => {
    switch(tier) {
      case 'COMMON': return 'text-stone-400';
      case 'UNCOMMON': return 'text-green-500';
      case 'RARE': return 'text-blue-500';
      case 'EPIC': return 'text-purple-500';
      case 'LEGENDARY': return 'text-yellow-500';
      case 'CELESTIAL': return 'text-cyan-400';
      default: return 'text-stone-400';
    }
  };

  const getSlotDisplay = (slotKey) => {
    const displayNames = {
      head: 'Head', amulet: 'Amulet', body: 'Body', mainHand: 'Main Hand',
      offHand: 'Off Hand', ring1: 'Ring 1', ring2: 'Ring 2', boots: 'Boots'
    };
    return displayNames[slotKey];
  };

  const slotOrder = ['head', 'amulet', 'body', 'mainHand', 'offHand', 'ring1', 'ring2', 'boots'];

  const handleAllocate = async (statStr) => {
    if (unspentStats <= 0) return;
    try {
        const res = await fetch('/api/player/allocate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ statStr })
        });
        const data = await res.json();
        if (res.ok) {
            updateHero(data.updatedHero);
        } else {
            console.error('Allocation failed:', data.error);
        }
    } catch(err) {
        console.error(err);
    }
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Primary Hero Plaque */}
      <section className="lg:col-span-1 border border-neutral-900 bg-[#050505] p-8 shadow-[0_0_20px_rgba(0,0,0,0.8)] flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-red-950/20 border border-red-900/50 flex flex-col items-center justify-center text-red-600 mb-6 shadow-inner">
          <span className="text-4xl font-serif leading-none mt-2">†</span>
          <span className="text-[10px] font-mono mt-1 opacity-50">SOUL</span>
        </div>
        
        <h2 className="text-3xl font-black uppercase tracking-widest text-stone-200 mb-2 font-serif">{hero?.name}</h2>
        <div className="w-full space-y-2 mb-8">
            <div className="flex justify-between items-center bg-purple-950/20 border border-purple-900/40 p-2">
                 <span className="font-mono text-[10px] text-purple-400 uppercase tracking-widest">Power Score</span>
                 <span className="font-serif text-lg font-bold text-stone-200">{(currentLevel * 10) + str + def + dex + int + vit + (currentHp/2)}</span>
            </div>
            <div className="text-red-700 font-mono text-xs uppercase tracking-widest bg-red-950/30 px-4 py-1 border border-red-900/30 text-center">
              Level {currentLevel}
            </div>
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
      <section className="lg:col-span-2 flex flex-col gap-6">

        {/* CORE ATTRIBUTES PANEL */}
        <div className="border border-neutral-900 bg-black/40 p-6 flex-1">
          <div className="flex justify-between items-end border-b border-red-900/30 pb-3 mb-6">
            <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400">Core Attributes</h3>
            <div className="text-xs font-mono uppercase tracking-[0.1em] text-stone-500">
               <span className={unspentStats > 0 ? "text-yellow-500 font-bold drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]" : ""}>
                 {unspentStats}
               </span> Points Available
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono">
            {[
              { id: 'str', label: 'Strength', val: str, math: '+1 DMG / pt' },
              { id: 'def', label: 'Defense', val: def, math: '+0.5 Damage Reduction / pt' },
              { id: 'dex', label: 'Dexterity', val: dex, math: '+1.5% Crit / pt' },
              { id: 'int', label: 'Intelligence', val: int, math: '+3 Mana, +1 Magic Power / pt' },
              { id: 'vit', label: 'Vitality', val: vit, math: '+5 Max HP / pt' }
            ].map(attr => (
              <div key={attr.id} className="flex justify-between items-center bg-[#030303] border border-neutral-800 p-3">
                <div>
                  <div className="text-stone-300 font-bold uppercase tracking-widest text-sm flex gap-3 items-center">
                    <span className="text-red-700">{attr.val}</span>
                    {attr.label}
                  </div>
                  <div className="text-[10px] text-stone-600 mt-1 uppercase tracking-widest">{attr.math}</div>
                </div>
                {unspentStats > 0 && (
                  <button 
                    onClick={() => handleAllocate(attr.id)}
                    className="w-8 h-8 flex items-center justify-center bg-black border border-red-900/50 text-red-500 hover:bg-neutral-900 hover:text-red-400 hover:border-red-600 transition-all shadow-[0_0_10px_rgba(153,27,27,0.2)]"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* COMBAT MATH PANEL */}
        <div className="border border-neutral-900 bg-black/40 p-6 flex-1">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-neutral-800 pb-3 mb-6">Combat Math</h3>
          
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs text-stone-500">
            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Attack Damage</div>
              <div className="text-lg text-stone-200">
                {c.attackDamage}
                <span className="text-stone-600 text-[10px] ml-2">TOTAL</span>
              </div>
            </div>
            
            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Magic Power</div>
              <div className="text-lg text-purple-400">{c.magicPower}</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Maximum Mana</div>
              <div className="text-lg text-blue-400">{c.maxMana}</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Critical Chance</div>
              <div className="text-lg text-yellow-600">{c.critChance}%</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Damage Reduction</div>
              <div className="text-lg text-stone-400">{c.damageReduction}</div>
            </div>

            <div>
              <div className="uppercase text-[10px] text-stone-700 mb-1">Lifesteal</div>
              <div className="text-lg text-red-400">{c.lifesteal} HP/HIT</div>
            </div>
          </div>
        </div>

        {/* EQUIPPED INSTRUMENTS */}
        <div className="border border-neutral-900 bg-black/40 p-6 flex-1">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-neutral-800 pb-3 mb-6">Equipped Instruments</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slotOrder.map(slot => {
              const item = hero?.equipped?.[slot];
              return (
                <div key={slot} className={`border p-4 flex items-center justify-between transition-colors ${item ? `bg-[#050505] border-neutral-800` : 'bg-black/50 border-neutral-900 border-dashed'}`}>
                  <div>
                    <div className="text-[10px] font-mono text-stone-600 uppercase tracking-widest">{getSlotDisplay(slot)}</div>
                    {item ? (
                      <div className={`font-bold tracking-widest uppercase text-sm mt-1 ${getTierColor(item.rarity)}`}>
                        {item.name}
                      </div>
                    ) : (
                      <div className="text-stone-700 italic text-[10px] uppercase mt-2">Empty</div>
                    )}
                  </div>
                  {item && (
                    <div className="flex gap-2">
                       {item.stats?.dmg && <span className="text-[10px] text-red-500 font-mono">+{item.stats.dmg} DMG</span>}
                       {item.stats?.def && <span className="text-[10px] text-stone-400 font-mono">+{item.stats.def} DEF</span>}
                       {item.stats?.hp && <span className="text-[10px] text-stone-300 font-mono">+{item.stats.hp} HP</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </section>
    </div>
  );
}
