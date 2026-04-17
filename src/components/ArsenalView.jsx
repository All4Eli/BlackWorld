'use client';
import { useState } from 'react';

export default function ArsenalView({ hero, updateHero }) {
  const equipArtifact = async (artifact) => {
    try {
      const res = await fetch('/api/arsenal/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId: artifact.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateHero(data.updatedHero);
    } catch(err) {
      alert(`Failed to equip: ${err.message}`);
    }
  };

  const getTierColor = (tier) => {
    switch(tier) {
      case 'COMMON': return 'text-stone-400 border-stone-800 bg-stone-950/10';
      case 'UNCOMMON': return 'text-green-500 border-green-900/50 bg-green-950/20';
      case 'RARE': return 'text-blue-500 border-blue-900/50 bg-blue-950/20';
      case 'EPIC': return 'text-purple-500 border-purple-900/50 bg-purple-950/20';
      case 'LEGENDARY': return 'text-yellow-500 border-yellow-600/50 bg-yellow-950/20';
      case 'CELESTIAL': return 'text-cyan-400 border-cyan-800/50 bg-cyan-950/20';
      default: return 'text-purple-400 border-purple-900/30 bg-purple-950/5'; // legacy
    }
  };

  const isEquipped = (art) => {
     if (!hero?.equipped) return hero?.equippedWeapon?.id === art.id || hero?.equippedArmor?.id === art.id;
     return Object.values(hero.equipped).some(item => item?.id === art.id);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      {/* Inventory & Flasks */}
      <section className="flex flex-col gap-6">
        <div className="bg-[#050505] border border-neutral-900 p-6 shadow-xl">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">Provisions</h3>
          <div className="flex justify-between font-mono text-xs items-center">
            <span className="text-stone-600 uppercase tracking-widest">Crimson Flasks</span>
            <span className="text-red-500 font-bold text-lg">{hero?.flasks || 0}</span>
          </div>
        </div>

        <div className="bg-[#050505] border border-neutral-900 p-6 shadow-xl flex-1 flex flex-col">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">Artifacts</h3>
          
          <div className="flex-1">
            {!hero?.artifacts?.length ? (
               <div className="text-stone-700 font-mono text-xs text-center py-12 italic border border-neutral-900">Your pack is empty</div>
            ) : (
               <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                 {hero.artifacts.map((art, i) => {
                   const equipped = isEquipped(art);
                   const colors = getTierColor(art.rarity);
                   
                   return (
                     <div key={i} className={`border p-4 transition-all ${equipped ? 'opacity-50' : ''} ${colors}`}>
                       <div className="flex justify-between items-start mb-2">
                         <div className="flex gap-2 items-center">
                           <span className="text-sm font-bold uppercase tracking-wide">{art.name}</span>
                           {art.rarity && <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-current">{art.rarity}</span>}
                         </div>
                       </div>
                       
                       <div className="flex flex-wrap gap-3 text-[10px] font-mono text-stone-300 uppercase tracking-widest mb-4">
                         <span className="text-stone-500">[{art.type}]</span>
                         {art.stats ? (
                            <>
                              {art.stats.dmg > 0 && <span className="text-red-500">+{art.stats.dmg} DMG</span>}
                              {art.stats.def > 0 && <span className="text-stone-400">+{art.stats.def} DEF</span>}
                              {art.stats.hp > 0 && <span className="text-stone-300">+{art.stats.hp} HP</span>}
                              {art.stats.crit > 0 && <span className="text-yellow-500">+{art.stats.crit}% CRIT</span>}
                              {art.stats.magicDmg > 0 && <span className="text-purple-400">+{art.stats.magicDmg} MAGIC</span>}
                              {art.stats.lifesteal > 0 && <span className="text-red-400">+{art.stats.lifesteal} LIFESTEAL</span>}
                            </>
                         ) : (
                            <span>+{art.stat} {art.type === 'WEAPON' ? 'DMG' : 'HP'}</span>
                         )}
                       </div>

                       {equipped ? (
                         <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 font-bold bg-emerald-950/20 py-2 text-center border border-emerald-900/30">Equipped</div>
                       ) : (
                         <button onClick={() => equipArtifact(art)} className={`text-[10px] font-mono uppercase tracking-widest bg-black border border-current hover:text-white w-full py-2 transition-all`}>
                           Equip
                         </button>
                       )}
                     </div>
                   );
                 })}
               </div>
            )}
          </div>
        </div>
      </section>

      {/* Discovered Tomes */}
      <section className="bg-[#050505] border border-neutral-900 p-6 shadow-xl flex flex-col">
         <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">Learned Tomes</h3>
         
         <div className="flex-1">
            <p className="text-[10px] font-mono text-stone-600 uppercase tracking-widest mb-6">
              Ancient knowledge cannot be unlearned. Passive benefits are always active.
            </p>

            {!hero?.learnedTomes?.length ? (
              <div className="text-stone-700 font-mono text-xs text-center py-12 italic border border-neutral-900">No tomes discovered</div>
            ) : (
              <div className="space-y-3">
                {hero.learnedTomes.map((tomeId) => {
                  const rarityStr = tomeId.includes('mythic') ? 'mythic' : tomeId.includes('legendary') ? 'legendary' : 'epic';
                  const rarityColors = {
                    mythic: 'text-fuchsia-400 border-fuchsia-900/40 bg-fuchsia-950/10',
                    legendary: 'text-yellow-500 border-yellow-900/40 bg-yellow-950/10',
                    epic: 'text-blue-400 border-blue-900/40 bg-blue-950/10'
                  };
                  
                  return (
                    <div key={tomeId} className={`border p-4 font-mono ${rarityColors[rarityStr]}`}>
                      <div className="text-sm font-bold uppercase tracking-widest mb-1">
                        {tomeId.replace('tome_', '').replace(/_/g, ' ')}
                      </div>
                      <div className="text-[10px] uppercase text-stone-500 tracking-wider">
                        {rarityStr} Tier Passive
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
         </div>
      </section>

    </div>
  );
}
