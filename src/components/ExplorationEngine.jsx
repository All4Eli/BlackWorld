'use client';
import { useState, useEffect, useRef } from 'react';

export default function ExplorationEngine({ hero, updateHero, onFindCombat }) {
  const [log, setLog] = useState(["[ENTRY]: You step into the Abyss. The path diverges."]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const handleChoice = (pathType) => {
    const roll = Math.random();
    
    // Path 1: High Loot, High Combat Risk
    if (pathType === 'DARK') {
       if (roll > 0.4) {
         addLog("⚠️ [AMBUSH!]: You trigger a ward. Demons rip through the fog!");
         setTimeout(() => onFindCombat({ isBoss: false, ambush: true }), 1500);
       } else {
         const goldAmount = Math.floor(Math.random() * 50) + 40; // Buffed Gold
         addLog(`💰 [PLUNDER]: You pry open a rusted chest. Found ${goldAmount} Gold.`);
         updateHero({ ...hero, gold: hero.gold + goldAmount });
       }
    } 
    // Path 2: Safe, Merchant Chance, Healing
    else {
       if (roll > 0.8) {
         addLog("🩸 [ENCOUNTER]: An entity blocks the pale archway.");
         setTimeout(() => onFindCombat({ isBoss: false }), 1500);
       } else if (roll > 0.6) {
         addLog("🔥 [SANCTUARY]: You find a blood shrine. HP restored.");
         updateHero({ ...hero, hp: hero.maxHp });
       } else if (roll > 0.3) {
         addLog("⚖️ [MERCHANT]: The Void Broker beckons from the shadows...");
         setMerchantOpen(true);
       } else {
         addLog("👣 [EMPTY]: The corridor echoes with nothingness.");
       }
    }
  };

  const equipArtifact = (artifact) => {
    if (artifact.type === 'WEAPON') {
      updateHero({ ...hero, equippedWeapon: artifact });
      addLog(`⚔️ Equipped Weapon: ${artifact.name} (+${artifact.stat} DMG)`);
    } else if (artifact.type === 'ARMOR') {
       // Note: To truly grant Max HP, we need to artificially adjust the cap, but for now we grant Base HP
      updateHero({ ...hero, equippedArmor: artifact });
      addLog(`🛡️ Equipped Armor: ${artifact.name}`);
    }
  };

  const buyItem = (cost, type) => {
    if (hero.gold < cost) {
       addLog(`❌ [DENIED]: Not enough gold.`);
       return;
    }
    
    let newHero = { ...hero, gold: hero.gold - cost };
    
    if (type === 'FLASK') {
       newHero.flasks += 1;
       addLog(`⚖️ Purchased Crimson Flask for ${cost}g.`);
    } else if (type === 'HP') {
       newHero.maxHp += 20;
       newHero.hp += 20;
       addLog(`⚖️ Purchased Vitality (+20 Max HP) for ${cost}g.`);
    } else if (type === 'WEAPON') {
       const wpn = { id: Math.random().toString(), name: "Broker's Falchion", type: 'WEAPON', stat: 12 };
       newHero.artifacts = [...newHero.artifacts, wpn];
       addLog(`⚖️ Purchased ${wpn.name} for ${cost}g.`);
    }
    updateHero(newHero);
  };

  return (
    <div className="animate-in fade-in duration-1000 max-w-5xl mx-auto relative z-10 pt-10 w-full px-6">
      
      {/* Exploration Header */}
      <header className="flex justify-between items-center bg-black/40 border-b-2 border-neutral-900 p-6 shadow-2xl mb-8">
        <div>
           <h2 className="text-2xl font-black text-stone-300 font-serif tracking-[0.2em] uppercase">The Catacombs</h2>
           <p className="text-xs text-stone-500 font-mono tracking-widest mt-1">Sector: Undefined</p>
        </div>
        <div className="flex gap-6 font-mono items-center">
           <div className="text-right">
             <div className="text-[10px] text-stone-500 uppercase tracking-widest">Wealth</div>
             <div className="text-yellow-600 font-bold tracking-widest">{hero.gold} g</div>
           </div>
           <button 
             onClick={() => setInventoryOpen(!inventoryOpen)}
             className={`px-6 py-3 uppercase tracking-widest text-xs font-bold transition-all border ${inventoryOpen ? 'bg-red-900/30 border-red-900 text-red-400' : 'bg-neutral-900 border-neutral-800 text-stone-300 hover:bg-neutral-800'}`}
           >
             Inventory
           </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Section */}
        <section className="lg:col-span-2 flex flex-col gap-4">
           {merchantOpen ? (
             <div className="bg-[#050505] border border-yellow-900/50 shadow-[0_0_30px_rgba(202,138,4,0.1)] h-[600px] flex flex-col animate-in zoom-in-95">
                <div className="p-6 border-b border-yellow-900/30 flex justify-between items-center">
                  <h3 className="text-yellow-600 font-serif font-black text-2xl uppercase tracking-[0.2em]">The Void Broker</h3>
                  <button onClick={() => setMerchantOpen(false)} className="text-stone-500 hover:text-white uppercase tracking-widest text-xs font-mono font-bold">Leave</button>
                </div>
                <div className="p-8 flex-1 font-mono flex flex-col gap-6">
                   <p className="text-stone-400 italic text-sm mb-4">"Your mortality is failing. Purchase survival."</p>
                   
                   <button onClick={() => buyItem(50, 'FLASK')} className="flex justify-between items-center bg-black border border-neutral-800 p-4 hover:border-yellow-900/50 hover:bg-yellow-900/10 transition-all text-left">
                     <div>
                       <div className="text-red-500 font-bold uppercase tracking-widest">Crimson Flask (+1)</div>
                       <div className="text-xs text-stone-500 mt-1">Restores 60 HP in combat</div>
                     </div>
                     <div className="text-yellow-600 font-bold tracking-widest">50g</div>
                   </button>

                   <button onClick={() => buyItem(150, 'HP')} className="flex justify-between items-center bg-black border border-neutral-800 p-4 hover:border-yellow-900/50 hover:bg-yellow-900/10 transition-all text-left">
                     <div>
                       <div className="text-stone-300 font-bold uppercase tracking-widest">Permanent Vitality</div>
                       <div className="text-xs text-stone-500 mt-1">Permanently adds +20 Max HP</div>
                     </div>
                     <div className="text-yellow-600 font-bold tracking-widest">150g</div>
                   </button>

                   <button onClick={() => buyItem(200, 'WEAPON')} className="flex justify-between items-center bg-black border border-neutral-800 p-4 hover:border-yellow-900/50 hover:bg-yellow-900/10 transition-all text-left">
                     <div>
                       <div className="text-purple-400 font-bold uppercase tracking-widest">Broker's Falchion</div>
                       <div className="text-xs text-stone-500 mt-1">Physical Weapon (+12 Base DMG)</div>
                     </div>
                     <div className="text-yellow-600 font-bold tracking-widest">200g</div>
                   </button>
                </div>
             </div>
           ) : (
             <div className="bg-[#020202] border border-neutral-800 shadow-inner h-[600px] flex flex-col">
               <div className="bg-[#050505] border-b border-neutral-900 p-4 font-mono text-xs uppercase tracking-widest text-stone-600">
                 Chronological Feed
               </div>
               
               <div className="flex-1 overflow-y-auto p-8 font-serif text-base leading-loose space-y-4 shadow-[inset_0_0_50px_rgba(0,0,0,1)]">
                 {log.map((entry, i) => {
                    let color = "text-stone-400";
                    if (entry.includes("AMBUSH") || entry.includes("ENCOUNTER")) color = "text-red-500 font-bold";
                    else if (entry.includes("PLUNDER")) color = "text-yellow-500 font-bold";
                    else if (entry.includes("SANCTUARY")) color = "text-emerald-700 font-bold italic";
                    else if (entry.includes("MERCHANT")) color = "text-yellow-600 font-bold italic shadow-black drop-shadow-md";
                    return (
                      <p key={i} className={`${color} opacity-0 animate-[fadeIn_0.5s_forwards]`} style={{ animationDelay: '0.1s' }}>{entry}</p>
                    )
                 })}
                 <div ref={logEndRef} />
               </div>

               <div className="grid grid-cols-2 gap-4 p-6 border-t border-neutral-900 bg-[#050505] font-mono">
                  <button 
                    onClick={() => handleChoice('SAFE')}
                    className="bg-neutral-900/50 hover:bg-stone-800 border border-neutral-800 py-4 text-xs tracking-widest uppercase text-stone-400 transition-all"
                  >
                    Tread Carefully
                  </button>
                  <button 
                    onClick={() => handleChoice('DARK')}
                    className="bg-red-950/10 hover:bg-red-900/30 border border-red-900/30 py-4 text-xs tracking-widest uppercase text-red-500 font-bold transition-all"
                  >
                    Plunge into Darkness
                  </button>
               </div>
             </div>
           )}
        </section>

        {/* Inventory Modal / Sidebar */}
        <section className={`lg:col-span-1 ${inventoryOpen ? 'block' : 'hidden lg:block'} animate-in slide-in-from-right duration-500`}>
           <div className="bg-[#050505] border border-neutral-800 p-6 shadow-xl h-full font-mono flex flex-col">
             <h3 className="text-stone-300 font-bold tracking-widest uppercase mb-6 text-sm border-b border-neutral-800 pb-4">Personal Arsenal</h3>
             
             {/* EQUIPPED GEAR */}
             <div className="mb-6 space-y-3 border-b border-neutral-900 pb-6">
                <div className="text-[10px] text-stone-500 uppercase tracking-widest mb-2">Equipped Loadout</div>
                <div className="bg-black border border-neutral-800 p-3 flex justify-between items-center text-xs">
                   <span className="text-stone-600">Weapon</span>
                   {hero.equippedWeapon ? (
                     <span className="text-purple-400 font-bold">{hero.equippedWeapon.name} (+{hero.equippedWeapon.stat})</span>
                   ) : (
                     <span className="text-stone-700 italic">None</span>
                   )}
                </div>
             </div>

             <div className="flex justify-between items-center mb-4 p-4 bg-black border border-neutral-900">
               <span className="text-xs text-stone-500 uppercase tracking-widest">Crimson Flasks</span>
               <span className="text-red-600 font-bold">{hero.flasks} / 5</span>
             </div>

             <div className="flex-1 bg-black border border-neutral-900 p-4 overflow-y-auto">
               <span className="text-xs text-stone-500 uppercase tracking-widest block mb-4">Relics & Artifacts</span>
               {hero.artifacts?.length === 0 ? (
                 <div className="text-stone-700 text-xs text-center mt-10 italic">Empty Pockets</div>
               ) : (
                 <ul className="space-y-3">
                   {hero.artifacts?.map((art, i) => (
                     <li key={i} className="flex flex-col gap-2 border border-purple-900/30 bg-purple-950/10 p-3 shadow-[0_0_10px_rgba(168,85,247,0.05)]">
                       <div className="flex justify-between items-start">
                         <span className="text-purple-400 text-xs font-bold leading-tight uppercase tracking-wide">{art.name}</span>
                         <span className="text-stone-500 text-[10px]">+{art.stat} {art.type === 'WEAPON' ? 'DMG' : 'HP'}</span>
                       </div>
                       
                       {hero.equippedWeapon?.id !== art.id && (
                         <button 
                           onClick={() => equipArtifact(art)}
                           className="text-[10px] uppercase tracking-widest bg-black border border-purple-900/50 text-stone-400 hover:bg-purple-900/30 hover:text-white py-1 transition-all mt-2"
                         >
                           Equip {art.type}
                         </button>
                       )}
                       {hero.equippedWeapon?.id === art.id && (
                         <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold text-center mt-2 border border-emerald-900/30 bg-emerald-950/20 py-1">Equipped</span>
                       )}
                     </li>
                   ))}
                 </ul>
               )}
             </div>
           </div>
        </section>

      </div>
    </div>
  );
}
