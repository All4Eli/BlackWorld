'use client';

export default function ArsenalView({ hero, updateHero }) {
  const equipArtifact = (artifact) => {
    if (artifact.type === 'WEAPON') {
      updateHero({ ...hero, equippedWeapon: artifact });
    } else {
      updateHero({ ...hero, equippedArmor: artifact });
    }
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
                   const isEquipped = hero.equippedWeapon?.id === art.id || hero.equippedArmor?.id === art.id;
                   return (
                     <div key={i} className={`border p-4 transition-all ${isEquipped ? 'border-emerald-900/40 bg-emerald-950/10' : 'border-purple-900/30 bg-purple-950/5'}`}>
                       <div className="flex justify-between items-start mb-3">
                         <span className="text-purple-400 text-sm font-bold uppercase tracking-wide">{art.name}</span>
                         <span className="text-stone-500 font-mono text-[10px]">+{art.stat} {art.type === 'WEAPON' ? 'DMG' : 'HP'}</span>
                       </div>
                       {isEquipped ? (
                         <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 font-bold bg-emerald-950/20 py-2 text-center border border-emerald-900/30">Equipped</div>
                       ) : (
                         <button onClick={() => equipArtifact(art)} className="text-[10px] font-mono uppercase tracking-widest bg-black border border-purple-900/50 text-stone-400 hover:text-white hover:bg-purple-900/30 w-full py-2 transition-all">
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
