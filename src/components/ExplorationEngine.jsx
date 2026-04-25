'use client';
import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import { ZONES } from '@/lib/gameData';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';
import WorldMap from './WorldMap';
import { useSounds } from './SoundEngine';
import { GameIcon, IconSword, IconSkull, IconBlood, IconSpider, IconCross, IconShield, IconFlask } from './icons/GameIcons';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  ARCHITECTURAL NOTE — GOD COMPONENT TRIAGE                   ║
// ║                                                               ║
// ║  This component is ~487 lines and manages 4 distinct          ║
// ║  functional areas that should be split into separate           ║
// ║  components in a future refactor:                             ║
// ║                                                               ║
// ║  1. ZONE SELECTION (lines ~44-64, render ~368-399)            ║
// ║     → Extract to: <ZoneSelector />                            ║
// ║     → Owns: availableZones, lockedZones, handleEnterZone      ║
// ║     → Renders: WorldMap, zone header, stats bar               ║
// ║                                                               ║
// ║  2. EXPLORATION EVENTS (lines ~66-120, render ~438-480)       ║
// ║     → Extract to: <ExplorationLoop />                         ║
// ║     → Owns: exploreCooldown, handleExplore, log               ║
// ║     → Renders: Explore button, log feed, exit button          ║
// ║                                                               ║
// ║  3. COMBAT SYSTEM (lines ~123-250, render ~258-338)           ║
// ║     → Extract to: <InlineCombat />                            ║
// ║     → Owns: combatActive, currentEnemy, playerHP, enemyHP,    ║
// ║       combatLog, handleAttack, handleFlee, handleUseItem      ║
// ║     → Renders: Enemy HUD, HP bars, action buttons, arcana     ║
// ║     → NOTE: This is essentially a SECOND CombatEngine. It     ║
// ║       duplicates logic from the top-level CombatEngine.jsx.   ║
// ║       Consider unifying into a shared combat hook.            ║
// ║                                                               ║
// ║  4. EXPLORATION LOG UI (lines ~342-366)                       ║
// ║     → Extract to: <ExplorationLog entries={log} />            ║
// ║     → Pure presentation component — no state needed           ║
// ║     → Could be a Server Component if log was SSR-fetched      ║
// ║                                                               ║
// ║  SPLITTING STRATEGY:                                          ║
// ║  Start from the LEAVES inward:                                ║
// ║    1. Extract ExplorationLog (stateless render)               ║
// ║    2. Extract InlineCombat (self-contained state)             ║
// ║    3. Extract ZoneSelector (depends on hero.level only)       ║
// ║    4. ExplorationEngine becomes a thin orchestrator           ║
// ╚═══════════════════════════════════════════════════════════════╝

// CONTEXT MIGRATED: hero/updateHero now from usePlayer().
// onFindCombat stays as a prop — it triggers a page-level stage
// transition (EXPLORATION → COMBAT), not player data.
export default function ExplorationEngine({ onFindCombat }) {
  const { hero, updateHero } = usePlayer();
  const [log, setLog] = useState([]);
  const [activeZone, setActiveZone] = useState(hero?.activeZone || null);
  const [activeBounties, setActiveBounties] = useState([]);
  const logEndRef = useRef(null);
  const combatLogEndRef = useRef(null);
  const sound = useSounds();

  useEffect(() => {
    fetch('/api/bounties/active')
      .then(res => res.json())
      .then(data => data.activeBounties && setActiveBounties(data.activeBounties))
      .catch(() => {});
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

  const addLog = (entry) => setLog(prev => [...prev.slice(-30), entry]);
  const addCombatLog = (msg) => setCombatLog(prev => [...prev, msg]);

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
            setLog([{ type: 'system', text: `You cross into the ${zone.name}.`, time: Date.now() }]);
        } else {
            addLog({ type: 'error', text: data.error, time: Date.now() });
        }
    } catch(err) {
        addLog({ type: 'error', text: 'Cannot connect to server.', time: Date.now() });
    }
  };

  const [exploreCooldown, setExploreCooldown] = useState(false);

  const handleExplore = async () => {
    if (!activeZone || exploreCooldown) return;
    setExploreCooldown(true);
    addLog({ type: 'action', text: 'Searching the shadows...', time: Date.now() });

    try {
      const response = await fetch('/api/explore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoneId: activeZone.id })
      });
      const data = await response.json();

      if (!response.ok) {
         addLog({ type: 'error', text: data.error, time: Date.now() });
         setExploreCooldown(false);
         return;
      }

      setTimeout(() => {
          // Narrative result
          addLog({ type: 'narrative', text: data.narrative, time: Date.now() });

          // Loot found
          if (data.loot) {
             addLog({ type: 'loot', text: `Found: ${data.loot.name} [${data.loot.tier}]`, tier: data.loot.tier, time: Date.now() });
             sound?.play('loot');
          }

          // Gold found
          if (data.goldFound > 0) {
             addLog({ type: 'gold', text: `+${data.goldFound} Gold`, time: Date.now() });
             sound?.play('coin');
          }

          // Enemy encounter — start combat
          if (data.encounter === 'enemy') {
             addLog({ type: 'danger', text: 'Prepare for combat!', time: Date.now() });
             sound?.play('encounter');
             setTimeout(() => {
                 initCombat(activeZone);
                 setExploreCooldown(false);
             }, 1200);
          } else {
             setExploreCooldown(false);
          }
      }, 1200);

    } catch(err) {
      addLog({ type: 'error', text: 'Cannot connect to server.', time: Date.now() });
      setExploreCooldown(false);
    }
  };


  const initCombat = async (zone) => {
    setCombatActive(true);
    setCombatEnded(false);
    setCombatLoading(true);
    setCurrentEnemy(null);
    setCombatLog(["[COMBAT INITIATED]: The shadows twist and deform..."]);

    let fetchedBoss = null;
    try {
       // Use local enemy generation instead of direct Supabase client calls
       const { generateEnemy } = require('@/lib/gameData');
       fetchedBoss = generateEnemy(zone.levelReq || 1);
    } catch(err) { console.error(err); }

    if (!fetchedBoss) {
       const { generateEnemy } = require('@/lib/gameData');
       fetchedBoss = generateEnemy(zone.levelReq || 1);
    }

    const pStats = calcPlayerStats(hero);
    const mStats = calcMonsterStats(fetchedBoss);

    setPlayerHP(hero.hp || pStats.maxHp);
    setEnemyHP(mStats.hp);
    setCurrentEnemy({ ...fetchedBoss, ...mStats });
    addCombatLog(`[ENCOUNTER]: ${fetchedBoss.name} [${fetchedBoss.tier}]`);
    setCombatLoading(false);
  };

  const handleCombatAction = async (action, options = {}) => {
     if (combatEnded || !currentEnemy) return;
     setCombatLoading(true);
     try {
         const response = await fetch('/api/explore/combat', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             // Pass skillId via enemyState so the server can identify
             // which arcana spell was cast during a SKILL action.
             body: JSON.stringify({
               enemyId: currentEnemy.id || 'void_stalker',
               action,
               enemyState: { ...currentEnemy, hp: enemyHP, skillId: options.skillId }
             })
         });
         const data = await response.json();
         if (!response.ok) {
            addCombatLog(`[X] [ERROR]: ${data.error}`);
            setCombatLoading(false);
            return;
         }

         data.initialLogs?.forEach(msg => addCombatLog(msg));
         setEnemyHP(data.newEnemyHp);
         if (data.newEnemyState) {
            setCurrentEnemy(prev => ({ ...prev, ...data.newEnemyState }));
         }
         if (data.initialLogs?.some(l => l.includes('CRITICAL'))) sound?.play('crit');
         else sound?.play('hit');

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
                         updateHero(data.updatedHero);
                     }, 2000);
                 } else if (data.updatedHero.hp <= 0) {
                     addCombatLog(`>> [DEFEAT] You were struck down...`);
                     sound?.play('death');
                     setTimeout(() => {
                         setCombatActive(false);
                         setActiveZone(null);
                         updateHero(data.updatedHero);
                     }, 3500);
                 } else {
                     setTimeout(() => {
                         setCombatActive(false);
                         updateHero(data.updatedHero);
                     }, 1500);
                 }
             } else {
                 updateHero(data.updatedHero);
             }
             setCombatLoading(false);
         }, 1200);

     } catch(err) {
         console.error(err);
         addCombatLog(`[X] [SYSTEM ERROR]: Failed to contact server.`);
         setCombatLoading(false);
     }
  };

  const handleAttack = () => handleCombatAction('ATTACK');
  const handleUseItem = () => handleCombatAction('FLASK');
  const handleFlee = () => handleCombatAction('FLEE');

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

  // ==================== COMBAT VIEW ====================
  if (combatActive) {
      const pStats = calcPlayerStats(hero);
      const playerHpPercent = Math.max(0, Math.min(100, (playerHP / pStats.maxHp) * 100));
      const enemyHpPercent = currentEnemy ? Math.max(0, Math.min(100, (enemyHP / currentEnemy.maxHp) * 100)) : 100;

      return (
        <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-4xl mx-auto pt-6 pb-10">
          <div className="bg-[#050505] border border-red-900 shadow-[0_0_50px_rgba(153,27,27,0.15)] flex flex-col h-[80vh] sm:h-[600px]">

             {/* Combat Header */}
             <div className="border-b border-red-900/50 p-4 flex justify-between items-center bg-black">
                 <h2 className="text-xl font-serif tracking-[0.2em] font-black uppercase text-red-700">Mortal Combat</h2>
                 {combatEnded && (
                    <button onClick={() => setCombatActive(false)} className="text-stone-400 hover:text-white uppercase font-mono text-xs tracking-widest border border-neutral-700 px-4 py-1">
                       Return to Overworld
                    </button>
                 )}
             </div>

             {/* HP Bars */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-8 p-3 sm:p-8 border-b border-neutral-900 bg-[#020202]">
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
                            <span className={getTierColor(currentEnemy.tier?.toUpperCase())}>{currentEnemy.name}</span>
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
             <div className="flex-1 overflow-y-auto p-3 sm:p-6 font-serif text-xs sm:text-sm leading-relaxed sm:leading-loose space-y-1 sm:space-y-2 bg-[#050505]">
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
              <div className="p-3 sm:p-8 pb-4 sm:pb-10 mt-auto">
                  <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3 sm:mb-4">
                     <button onClick={handleAttack} disabled={combatLoading} className="bg-red-950/20 hover:bg-red-950/40 border border-red-900/50 py-3 sm:py-4 font-mono uppercase tracking-wider sm:tracking-widest text-xs sm:text-sm text-red-500 disabled:opacity-30 disabled:cursor-not-allowed">
                        Attack (Melee)
                     </button>
                     <button onClick={handleUseItem} disabled={combatLoading || (hero.flasks || 0) <= 0} className="bg-stone-900/40 hover:bg-stone-800 border border-stone-800 py-3 sm:py-4 font-mono uppercase tracking-wider sm:tracking-widest text-xs sm:text-sm text-stone-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1 sm:gap-2">
                        <span>Flask</span>
                        <span className="text-red-800 text-xs">x{hero.flasks || 0}</span>
                     </button>
                     <button onClick={handleFlee} disabled={combatLoading} className="bg-stone-950 hover:bg-stone-900 border border-neutral-900 py-3 sm:py-4 font-mono uppercase tracking-wider sm:tracking-widest text-xs sm:text-sm text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed">
                        Flee
                     </button>
                 </div>

                 {/* Arcana Hotbar */}
                 <div className="border border-purple-900/30 bg-[#050505] p-2 sm:p-4 flex items-center gap-2 sm:gap-4">
                     <div className="text-xs font-mono uppercase tracking-widest text-purple-600 pr-4 border-r border-purple-900/30">
                        Arcana <br/><span className="text-cyan-600">{hero.energy || 100} MP</span>
                     </div>
                     <div className="flex gap-3">
                         <button onClick={() => handleCombatAction('SKILL', { skillId: 'blood_surge' })} disabled={combatLoading || (hero.energy||100) < 10} className="w-12 h-12 border-2 border-red-900 bg-red-950/20 hover:bg-red-900/50 text-red-500 font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl shadow-[0_0_10px_rgba(255,0,0,0.2)]">
                            <IconBlood size={20} />
                         </button>
                         <button onClick={() => handleCombatAction('SKILL', { skillId: 'shadow_step' })} disabled={combatLoading || (hero.energy||100) < 15} className="w-12 h-12 border-2 border-stone-800 bg-stone-950 text-stone-500 hover:bg-stone-800 hover:text-stone-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl">
                            <IconSpider size={20} />
                         </button>
                         <button onClick={() => handleCombatAction('SKILL', { skillId: 'holy_cross' })} disabled={combatLoading || (hero.energy||100) < 20} className="w-12 h-12 border-2 border-yellow-700 bg-yellow-950/30 hover:bg-yellow-700/50 text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xl shadow-[0_0_15px_rgba(255,200,0,0.3)]">
                            <IconCross size={20} />
                         </button>
                     </div>
                 </div>
              </div>
             )}
          </div>
        </div>
      );
  }

  // ==================== EXPLORATION VIEW ====================

  const getLogStyle = (entry) => {
    switch(entry.type) {
      case 'system': return 'text-stone-500 italic';
      case 'action': return 'text-stone-600 animate-pulse';
      case 'narrative': return 'text-stone-300';
      case 'loot': return `${getTierColor(entry.tier)} font-bold`;
      case 'gold': return 'text-yellow-500 font-bold';
      case 'danger': return 'text-red-500 font-bold animate-pulse';
      case 'error': return 'text-red-700';
      default: return 'text-stone-400';
    }
  };

  const getLogIcon = (entry) => {
    switch(entry.type) {
      case 'system': return '⌁';
      case 'action': return '▸';
      case 'narrative': return '◆';
      case 'loot': return '▲';
      case 'gold': return '¤';
      case 'danger': return '\u2620';
      case 'error': return '[X]';
      default: return '·';
    }
  };

  return (
    <div className="animate-in fade-in duration-700 w-full max-w-4xl mx-auto pt-6 pb-10">
      <div className="flex flex-col gap-6">

        {/* Zone Selection — World Map */}
        {!activeZone && (
          <div className="bg-[#020202] border border-neutral-800 animate-in fade-in">
            <div className="border-b border-neutral-900 p-4 sm:p-6 flex justify-between items-center">
              <div>
                <h2 className="font-serif text-lg sm:text-xl tracking-[0.15em] font-black uppercase text-stone-200 mb-1">
                  Choose Your Ground
                </h2>
                <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600">
                  Select a zone to begin your expedition
                </p>
              </div>
              {activeBounties?.length > 0 && (
                <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-red-600 bg-red-950/20 border border-red-900/40 px-3 py-1.5">
                  <IconSkull size={12} /> {activeBounties.length} Active Bounties
                </span>
              )}
            </div>
            <div className="p-3 sm:p-6">
              <WorldMap
                availableZones={availableZones}
                lockedZones={lockedZones}
                activeBounties={activeBounties}
                onSelectZone={handleEnterZone}
              />
            </div>
          </div>
        )}

        {/* Active Zone — Exploration Interface */}
        {activeZone && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">

            {/* Zone Header */}
            <div className="bg-[#020202] border border-neutral-800 mb-4">
              <div className="p-4 sm:p-6 border-b border-neutral-900 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl opacity-70 text-red-700"><GameIcon name={activeZone.icon} size={24} /></span>
                    <h2 className="text-lg font-serif font-black uppercase tracking-[0.15em] text-stone-200">{activeZone.name}</h2>
                  </div>
                  <p className="text-xs text-stone-600 font-mono max-w-md">{activeZone.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right shrink-0">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600">Zone Level</span>
                  <span className="text-sm font-mono text-red-600 font-bold">{activeZone.levelReq}+</span>
                </div>
              </div>

              {/* Zone Stats Bar */}
              <div className="grid grid-cols-3 divide-x divide-neutral-900 text-center py-3 px-2">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1">Gold Rate</div>
                  <div className="text-xs font-mono text-yellow-600">{activeZone.goldMultiplier}x</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1">XP Rate</div>
                  <div className="text-xs font-mono text-cyan-600">{activeZone.xpMultiplier}x</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1">Enemies</div>
                  <div className="text-xs font-mono text-red-600">{activeZone.enemies?.length || '?'}</div>
                </div>
              </div>
            </div>

            {/* Exploration Log */}
            <div className="bg-[#050505] border border-neutral-800 mb-4">
              <div className="border-b border-neutral-900 px-4 py-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600">Exploration Log</span>
              </div>
              <div className="h-[300px] overflow-y-auto p-4 space-y-2 font-mono text-xs sm:text-sm">
                {log.length === 0 && (
                  <div className="text-stone-700 italic text-center py-8">The darkness awaits your command...</div>
                )}
                {log.map((entry, i) => (
                  <div key={i} className={`flex items-start gap-2 ${getLogStyle(entry)} animate-in fade-in slide-in-from-left-1 duration-300`}>
                    <span className="shrink-0 opacity-60 mt-0.5">{getLogIcon(entry)}</span>
                    <span>{entry.text}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleExplore}
                disabled={exploreCooldown}
                className="relative bg-[#080808] hover:bg-red-950/20 border border-red-900/40 hover:border-red-800/60 py-5 font-mono uppercase tracking-[0.2em] text-sm text-red-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 group"
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  <IconSword size={18} className="group-hover:animate-pulse" />
                  {exploreCooldown ? 'Exploring...' : 'Explore the Depths'}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-red-950/0 via-red-950/10 to-red-950/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={() => setActiveZone(null)}
                className="bg-[#050505] hover:bg-stone-950 border border-neutral-800 hover:border-neutral-700 py-5 font-mono uppercase tracking-[0.2em] text-sm text-stone-600 hover:text-stone-400 transition-all duration-300"
              >
                <span className="flex items-center justify-center gap-3">
                  <span>←</span>
                  Exit Zone
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
