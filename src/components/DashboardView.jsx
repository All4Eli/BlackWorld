'use client';
import { calculateSkillBonuses } from '@/lib/skillTree';
import { calcCombatStats, calculateXPRequirement } from '@/lib/gameData';
import DailyLoginCalendar from './DailyLoginCalendar';

export default function DashboardView({ hero, updateHero }) {
  const sb = calculateSkillBonuses(hero?.skillPoints || {});
  const c = calcCombatStats(hero, sb);
  
  const currentHp = hero?.hp ?? 0;
  const maxHp = c.maxHp;
  const currentLevel = hero?.level ?? 1;
  const currentXp = hero?.xp ?? 0;
  const requiredXp = calculateXPRequirement(currentLevel);
  
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

  const [modalSlot, setModalSlot] = useState(null);

  const isCorrectSlotType = (artifact, slotId) => {
       // Convert generalized types to specific slot IDs
       const typeMap = {
           'WEAPON': ['mainHand', 'offHand'],
           'ARMOR': ['body', 'head', 'boots'],
           'ACCESSORY': ['amulet', 'ring1', 'ring2']
       };
       const targetTypes = typeMap[artifact?.type] || [];
       return targetTypes.includes(slotId);
  };

  const handleEquip = async (artifactId) => {
      try {
          const res = await fetch('/api/equipment/equip', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ artifactId, slotId: modalSlot })
          });
          const data = await res.json();
          if (res.ok) {
              updateHero(data.updatedHero);
              setModalSlot(null);
          } else {
              alert(data.error);
          }
      } catch(err) {
          console.error(err);
      }
  };

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
               <span>Prowess</span><span>{currentXp} / {requiredXp} XP</span>
             </div>
             <div className="h-1 bg-neutral-900 w-full">
               <div className="h-full bg-stone-400" style={{ width: `${Math.min(100, (currentXp / requiredXp) * 100)}%` }} />
             </div>
          </div>
          <div>
             <div className="flex justify-between text-[10px] font-mono uppercase text-stone-500 mb-1">
               <span>HP</span><span className="text-red-500">{currentHp} / {maxHp}</span>
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
           <h3 className="font-serif text-center text-sm tracking-widest text-stone-500 uppercase mb-4 border-b border-neutral-900 pb-2">Equipment</h3>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
             {slotOrder.map(slot => {
                const item = hero?.equipment?.[slot];
                return (
                  <button key={slot} onClick={() => setModalSlot(slot)} className="w-full aspect-square border border-neutral-900 bg-neutral-950 flex flex-col items-center justify-center p-2 group hover:border-[#cf2a2a] transition-all">
                      <div className="text-[10px] font-mono text-stone-600 uppercase tracking-widest mb-1 group-hover:text-[#cf2a2a]">{getSlotDisplay(slot)}</div>
                      {item ? (
                         <div className="text-center">
                            <div className={`font-serif text-xs ${getTierColor(item.tier)}`}>+{item.level || 0}</div>
                            <div className={`font-serif text-xs truncate w-full ${getTierColor(item.tier)}`}>{item.name.slice(0, 10)}..</div>
                         </div>
                      ) : (
                         <div className="text-stone-800 text-2xl font-serif">†</div>
                      )}
                  </button>
                )
             })}
           </div>
        </div>
      </section>

      {/* Equipment Modal UI Override */}
      {modalSlot && (
         <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#050505] border border-red-900/50 p-6 w-full max-w-xl max-h-[80vh] overflow-y-auto relative animate-in zoom-in-95 duration-200 shadow-[0_0_50px_rgba(255,0,0,0.1)] text-center">
                <button onClick={() => setModalSlot(null)} className="absolute top-4 right-4 text-stone-500 hover:text-white uppercase font-mono text-xs">X Close</button>
                
                <h3 className="text-2xl font-serif text-[#cf2a2a] mb-2 uppercase tracking-widest">{getSlotDisplay(modalSlot)} Armory</h3>
                <p className="text-xs font-mono text-stone-500 uppercase tracking-widest mb-6">Select an artifact to imbue your power.</p>

                {hero?.equipment?.[modalSlot] && (
                   <button 
                     onClick={() => handleEquip(null)}
                     className="w-full border border-stone-800 bg-stone-950 p-4 hover:border-red-500 text-stone-400 hover:text-red-500 font-mono text-xs uppercase tracking-widest mb-4 transition-colors"
                   >
                       Unequip Current Item
                   </button>
                )}

                <div className="space-y-2">
                    {hero?.artifacts?.filter(a => isCorrectSlotType(a, modalSlot)).length === 0 ? (
                        <div className="text-stone-700 font-mono text-xs uppercase py-8">No compatible artifacts found in inventory.</div>
                    ) : (
                        hero?.artifacts?.filter(a => isCorrectSlotType(a, modalSlot)).map(artifact => (
                            <div key={artifact.id} className="flex justify-between items-center border border-neutral-900 bg-black p-4 group hover:border-[#cf2a2a]/50">
                                <div className="text-left">
                                   <div className={`font-serif text-sm tracking-widest ${getTierColor(artifact.tier)}`}>+{artifact.level || 0} {artifact.name}</div>
                                   <div className="text-[10px] text-stone-500 font-mono uppercase mt-1">Base Power: {artifact.stat || 0}</div>
                                </div>
                                <button 
                                   onClick={() => handleEquip(artifact.id)}
                                   className="px-6 py-2 border border-[#cf2a2a]/50 bg-red-950/20 text-[#cf2a2a] font-mono text-xs uppercase hover:bg-[#cf2a2a] hover:text-white transition-colors"
                                >
                                   Equip
                                </button>
                            </div>
                        ))
                    )}
              );
            })}
          </div>
        </div>

      </section>
    </div>
  );
}
