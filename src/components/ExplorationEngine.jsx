'use client';
import { useState, useEffect, useRef } from 'react';
import { ZONES } from '@/lib/gameData';
import { supabase } from '@/lib/supabaseClient';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';
import { validateAndConsume } from '@/lib/resources';
import DungeonGrid from './DungeonGrid';
import WorldMap from './WorldMap';
import { useSounds } from './SoundEngine';

export default function ExplorationEngine({ hero, updateHero, onFindCombat }) {
  const [log, setLog] = useState(["[ENTRY]: You descend into the dark. Choose your ground."]);
  const [activeZone, setActiveZone] = useState(hero?.activeZone || null);
  const [activeBounties, setActiveBounties] = useState([]);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const logEndRef = useRef(null);
  const combatLogEndRef = useRef(null);
  const sound = useSounds();

  useEffect(() => {
    fetch('/api/bounties/active')
      .then(res => res.json())
      .then(data => data.activeBounties && setActiveBounties(data.activeBounties))
      .catch(console.error);
  }, []);

  // Combat State
  const [combatActive, setCombatActive] = useState(false);
  const [currentEnemy, setCurrentEnemy] = useState(null);
  const [combatLog, setCombatLog] = useState([]);
  const [playerHP, setPlayerHP] = useState(0);
  const [enemyHP, setEnemyHP] = useState(0);
  const [combatLoading, setCombatLoading] = useState(false);
  const [combatEnded, setCombatEnded] = useState(false);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  useEffect(() => {
    combatLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [combatLog]);

  const addLog = (msg) => setLog(prev => [...prev, msg]);
  const addCombatLog = (msg) => setCombatLog(prev => [...prev, msg]);

  const currentEssence = hero?.player_resources?.essence_current ?? hero.essence ?? 100;
  const availableZones = ZONES.filter(z => hero.level >= z.levelReq);
  const lockedZones = ZONES.filter(z => hero.level < z.levelReq);

  const handleEnterZone = async (zone) => {
    try {
        const res = await fetch('/api/explore/zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zoneId: zone.id })
        });
        const data = await res.json();
        if (res.ok) {
            setActiveZone(zone);
            setLog([`[ENTRY]: You cross into the ${zone.name}.`]);
            updateHero(data.updatedHero);
        } else {
            addLog(`✖ [ERROR] ${data.error}`);
        }
    } catch(err) {
        addLog(`✖ [SYSTEM] Cannot connect to server.`);
    }
  };

  const [exploreCooldown, setExploreCooldown] = useState(false);

  const handleAction = async (actionType) => {
    if (!activeZone || exploreCooldown) return;
    setExploreCooldown(true);
    addLog(`>> Searching...`);
    
    try {
      const response = await fetch('/api/explore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoneId: activeZone.id, type: actionType })
      });
      const data = await response.json();
      
      if (!response.ok) {
         addLog(`✖ [ERROR] ${data.error}`);
         setExploreCooldown(false);
         return;
      }
      
      setTimeout(() => {
          addLog(`>> ${data.narrative}`);
          if (data.loot) {
             addLog(`▲ [LOOT] Acquired ${data.loot.name}!`);
          }
          
          updateHero(data.updatedHero);
          
          if (data.encounter === 'enemy') {
             setTimeout(() => {
                 initCombat(activeZone);
                 setExploreCooldown(false); // Unlock upon descending
             }, 1000);
          } else {
             // Unlock after narrative drops
             setExploreCooldown(false);
          }
      }, 1500); // Artificial exploration delay for ambiance and pacing constraint
      
    } catch(err) {
      addLog(`✖ [SYSTEM] Cannot connect to server.`);
      setExploreCooldown(false);
    }
  };


  const initCombat = async (zone) => {
    setCombatActive(true);
    setCombatEnded(false);
    setCombatLoading(true);
    setCurrentEnemy(null);
    setCombatLog(["[COMBAT INITIATED]: The shadows twist and deform..."]);
    
    // Attempt to fetch from Supabase. Default to generic if failed (for resilience)
    let fetchedBoss = null;
    try {
       const { data, error } = await supabase.from('boss_monsters').select('*').eq('zone_id', zone.id);
       if (!error && data && data.length > 0) {
          fetchedBoss = data[Math.floor(Math.random() * data.length)];
       }
    } catch(err) { console.error(err); }

    // Fallback if no matching zone id found
    if (!fetchedBoss) {
       const { generateEnemy } = require('@/lib/gameData');
       fetchedBoss = generateEnemy(zone.levelReq || 1);
    }

    const pStats = calcPlayerStats(hero);
    const mStats = calcMonsterStats(fetchedBoss);

    setPlayerHP(hero.hp || pStats.maxHp);
    setEnemyHP(mStats.hp);
    setCurrentEnemy({ ...fetchedBoss, ...mStats });
    addCombatLog(`⚠️ Encountered: ${fetchedBoss.name} [${fetchedBoss.tier}]`);
    setCombatLoading(false);
  };

  const handleCombatAction = async (action) => {
     if (combatEnded || !currentEnemy) return;
     setCombatLoading(true);
     try {
         const response = await fetch('/api/explore/combat', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ enemyId: currentEnemy.id || 'void_stalker', action, enemyState: { ...currentEnemy, hp: enemyHP } })
         });
         const data = await response.json();
         if (!response.ok) {
            addCombatLog(`✖ [ERROR]: ${data.error}`);
            setCombatLoading(false);
            return;
         }

         // Phase 1: Player Strike
         data.initialLogs?.forEach(msg => addCombatLog(msg));
         setEnemyHP(data.newEnemyHp);
         if (data.newEnemyState) {
            setCurrentEnemy(prev => ({ ...prev, ...data.newEnemyState }));
         }
         // Play hit sound
         if (data.initialLogs?.some(l => l.includes('CRITICAL'))) sound?.play('crit');
         else sound?.play('hit');

         // Phase 2: Enemy Sequential Retaliation (Delayed for UI fluidity)
         setTimeout(() => {
             data.delayedLogs?.forEach(msg => addCombatLog(msg));
             setPlayerHP(data.newPlayerHp);

             if (data.combatEnded) {
                 setCombatEnded(true);
                 if (data.win) {
                     addCombatLog(`>> [VICTORY] You defeated the enemy! Gained ${data.expGained} EXP and ${data.goldGained} Gold.`);
                     sound?.play('victory');
                     setTimeout(() => {
                         setCombatActive(false);
                         updateHero(data.updatedHero); // Finalize rewards globally
                     }, 2000);
                 } else if (data.updatedHero.hp <= 0) {
                     addCombatLog(`>> [DEFEAT] You were struck down...`);
                     sound?.play('death');
                     setTimeout(() => {
                         setCombatActive(false);
                         setActiveZone(null);
                         updateHero(data.updatedHero); // Handle death natively
                     }, 3500);
                 } else { // Flee success
                     setTimeout(() => {
                         setCombatActive(false);
                         updateHero(data.updatedHero);
                     }, 1500);
                 }
             } else {
                 updateHero(data.updatedHero);
             }
             setCombatLoading(false); // Unlock UI for next round natively
         }, 1200);

     } catch(err) {
         console.error(err);
         addCombatLog(`✖ [SYSTEM ERROR]: Failed to contact server.`);
         setCombatLoading(false);
     }
  };

  const handleAttack = () => handleCombatAction('ATTACK');
  const handleUseItem = () => handleCombatAction('FLASK');
  const handleFlee = () => handleCombatAction('FLEE');

  const getTierColor = (tier) => {
    switch(tier) {
      case 'COMMON': return 'text-stone-400 border-stone-800';
      case 'UNCOMMON': return 'text-green-500 border-green-900/50';
      case 'RARE': return 'text-blue-500 border-blue-900/50';
      case 'EPIC': return 'text-purple-500 border-purple-900/50';
      case 'LEGENDARY': return 'text-yellow-500 border-yellow-600/50';
      case 'CELESTIAL': return 'text-cyan-400 border-cyan-800/50';
      default: return 'text-stone-400 border-stone-800';
    }
  };

  if (combatActive) {
      const pStats = calcPlayerStats(hero);
      const playerHpPercent = Math.max(0, Math.min(100, (playerHP / pStats.maxHp) * 100));
      const enemyHpPercent = currentEnemy ? Math.max(0, Math.min(100, (enemyHP / currentEnemy.maxHp) * 100)) : 100;

      return (
        <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-4xl mx-auto pt-6 pb-10">
          <div className="bg-[#050505] border border-red-900 shadow-[0_0_50px_rgba(153,27,27,0.15)] flex flex-col h-[600px]">
             
             {/* Combat Header */}
             <div className="border-b border-red-900/50 p-4 flex justify-between items-center bg-black">
                 <h2 className="text-xl font-serif tracking-[0.2em] font-black uppercase text-red-700">Mortal Combat</h2>
                 {combatEnded && (
                    <button onClick={() => setCombatActive(false)} className="text-stone-400 hover:text-white uppercase font-mono text-xs tracking-widest border border-neutral-700 px-4 py-1">
                       Return to Overworld
                    </button>
                 )}
             </div>

             {/* Animated HP Bars */}
             <div className="grid grid-cols-2 gap-8 p-8 border-b border-neutral-900 bg-[#020202]">
                <div className="flex flex-col gap-2">
                   <div className="flex justify-between font-mono uppercase tracking-widest text-xs font-bold text-stone-300">
                      <span>{hero.name}</span>
                      <span className="text-emerald-500">{playerHP} / {pStats.maxHp} HP</span>
                   </div>
                   <div className="h-3 w-full bg-black border border-neutral-800 overflow-hidden relative">
                      <div className="h-full bg-emerald-700 transition-all duration-300 ease-out" style={{ width: `${playerHpPercent}%` }} />
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   {currentEnemy ? (
                       <>
                         <div className="flex justify-between font-mono uppercase tracking-widest text-xs font-bold">
                            <span className={getTierColor(currentEnemy.tier?.toUpperCase()).split(' ')[0]}>{currentEnemy.name}</span>
                            <span className="text-red-500">{enemyHP} / {currentEnemy.maxHp} HP</span>
                         </div>
                         <div className="h-3 w-full bg-black border border-neutral-800 overflow-hidden relative font-mono">
                            <div className="h-full bg-red-800 transition-all duration-300 ease-out" style={{ width: `${enemyHpPercent}%` }} />
                         </div>
                       </>
                   ) : (
                       <div className="text-stone-600 font-mono text-xs uppercase tracking-widest animate-pulse">Summoning Entity...</div>
                   )}
                </div>
             </div>

             {/* Combat Log */}
             <div className="flex-1 overflow-y-auto p-6 font-serif text-sm leading-loose space-y-2 bg-[#050505]">
                {combatLog.map((entry, i) => {
                   let color = 'text-stone-400';
                   if (entry.includes('STRIKE')) color = 'text-stone-200';
                   if (entry.includes('WOUNDED')) color = 'text-red-500';
                   if (entry.includes('MISS') || entry.includes('EVADE')) color = 'text-stone-500 italic';
                   if (entry.includes('VICTORY')) color = 'text-yellow-600 font-black tracking-wider';
                   if (entry.includes('DEATH')) color = 'text-red-700 font-black tracking-wider';
                   if (entry.includes('REWARD') || entry.includes('LOOT')) color = 'text-yellow-500';
                   if (entry.includes('HEAL')) color = 'text-emerald-500';
                   
                   return (
                     <div key={i} className={`${color}`}>{entry}</div>
                   );
                })}
                <div ref={combatLogEndRef} />
             </div>

             {/* Action Bar */}
             {!combatEnded && !combatLoading && (
              <div className="p-8 pb-10 mt-auto">
                 <div className="grid grid-cols-3 gap-4 mb-4">
                     <button onClick={handleAttack} disabled={combatLoading} className="bg-red-950/20 hover:bg-red-950/40 border border-red-900/50 py-4 font-mono uppercase tracking-widest text-sm text-red-500 disabled:opacity-30 disabled:cursor-not-allowed">
                        Attack (Melee)
                     </button>
                     <button onClick={handleUseItem} disabled={combatLoading || (hero.flasks || 0) <= 0} className="bg-stone-900/40 hover:bg-stone-800 border border-stone-800 py-4 font-mono uppercase tracking-widest text-sm text-stone-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        <span>Flask</span>
                        <span className="text-red-800 text-xs">x{hero.flasks || 0}</span>
                     </button>
                     <button onClick={handleFlee} disabled={combatLoading} className="bg-stone-950 hover:bg-stone-900 border border-neutral-900 py-4 font-mono uppercase tracking-widest text-sm text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed">
                        Flee
                     </button>
                 </div>
                 
                 {/* The Combat Grimoire (Arcana Hotbar) */}
                 <div className="border border-purple-900/30 bg-[#050505] p-4 flex items-center gap-4">
                     <div className="text-xs font-mono uppercase tracking-widest text-purple-600 pr-4 border-r border-purple-900/30">
                        Arcana <br/><span className="text-cyan-600">{hero.energy || 100} MP</span>
                     </div>
                     <div className="flex gap-3">
                         <button onClick={() => handleCombatAction('SKILL', { skillId: 'blood_surge' })} disabled={combatLoading || (hero.energy||100) < 10} className="w-12 h-12 border-2 border-red-900 bg-red-950/20 hover:bg-red-900/50 text-red-500 font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl shadow-[0_0_10px_rgba(255,0,0,0.2)]">
                            🩸
                         </button>
                         <button onClick={() => handleCombatAction('SKILL', { skillId: 'shadow_step' })} disabled={combatLoading || (hero.energy||100) < 15} className="w-12 h-12 border-2 border-stone-800 bg-stone-950 text-stone-500 hover:bg-stone-800 hover:text-stone-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl">
                            🕸
                         </button>
                         <button onClick={() => handleCombatAction('SKILL', { skillId: 'holy_cross' })} disabled={combatLoading || (hero.energy||100) < 20} className="w-12 h-12 border-2 border-yellow-700 bg-yellow-950/30 hover:bg-yellow-700/50 text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl shadow-[0_0_15px_rgba(255,200,0,0.3)]">
                            ✟
                         </button>
                     </div>
                 </div>
              </div>
             )}
          </div>
        </div>
      );
  }

  // ==== DEFAULT EXPLORATION VIEW ====
  return (
    <div className="animate-in fade-in duration-700 w-full max-w-4xl mx-auto pt-6 pb-10">
      <div className="flex flex-col gap-6">
        {/* Zone Selection */}
          {!activeZone && (
            <div className="bg-[#020202] border border-neutral-800 p-2 sm:p-6 animate-in fade-in">
              <div className="text-xs text-stone-600 font-mono uppercase tracking-widest mb-5">
                 Select Your Ground <span className="text-red-500 float-right">☠ Bounty Active</span>
              </div>
              <WorldMap 
                  availableZones={availableZones}
                  lockedZones={lockedZones}
                  activeBounties={activeBounties}
                  onSelectZone={handleEnterZone}
              />
            </div>
          )}

          {/* Procedural Grid mapping */}
          {activeZone && (
              <div ref={logEndRef}>
                  <DungeonGrid 
                      activeZone={activeZone}
                      onTriggerCombat={() => handleAction('DARK')}
                      onTriggerLoot={() => handleAction('SAFE')}
                  />
                  <div className="text-center mt-4">
                      <button onClick={() => setActiveZone(null)} className="text-stone-500 hover:text-stone-300 transition-colors uppercase font-mono tracking-widest text-xs border border-neutral-800 bg-black px-6 py-2">
                        ← Exit Depth
                      </button>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
