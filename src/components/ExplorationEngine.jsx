'use client';
import { useState, useEffect, useRef } from 'react';
import { ZONES } from '@/lib/gameData';
import { supabase } from '@/lib/supabaseClient';
import { calcPlayerStats, rollDamage, calcMonsterStats, isHitDodged } from '@/lib/combat';
import { validateAndConsume } from '@/lib/resources';

export default function ExplorationEngine({ hero, updateHero, onFindCombat }) {
  const [log, setLog] = useState(["[ENTRY]: You descend into the dark. Choose your ground."]);
  const [activeZone, setActiveZone] = useState(hero?.activeZone || null);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const logEndRef = useRef(null);
  const combatLogEndRef = useRef(null);

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

  const handleEnterZone = (zone) => {
    setActiveZone(zone);
    setLog([`[ENTRY]: You cross into the ${zone.name}.`]);
    updateHero({ ...hero, activeZone: zone });
  };

  const handleAction = async (actionType) => {
    if (!activeZone) return;
    try {
      const response = await fetch('/api/explore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoneId: activeZone.id, type: actionType })
      });
      const data = await response.json();
      
      if (!response.ok) {
         addLog(`❌ [ERROR] ${data.error}`);
         return;
      }
      
      addLog(`>> ${data.narrative}`);
      if (data.loot) {
         addLog(`✨ [LOOT] Acquired ${data.loot.name}!`);
      }
      
      const updatedHero = { ...hero };
      if (updatedHero.player_resources) {
          updatedHero.player_resources.essence_current = data.energyRemaining;
      } else {
          updatedHero.essence = data.energyRemaining;
      }
      
      if (data.loot) {
          if (!updatedHero.artifacts) updatedHero.artifacts = [];
          updatedHero.artifacts.push(data.loot);
      }
      updateHero(updatedHero);
      
      if (data.encounter === 'enemy') {
         setTimeout(() => initCombat(activeZone), 1500);
      }
      
    } catch(err) {
      addLog(`❌ [SYSTEM] Cannot connect to server.`);
    }
  };


  const initCombat = async (zone) => {
    // Phase 14: Resource Check
    const cost = 10; // Base cost for PvE
    const check = validateAndConsume(hero, hero?.player_resources, cost, 'vitae');
    if (!check.success) {
        return alert(`Insufficient Vitae. You lack ${check.deficit}.`);
    }
    
    // Process payment immediately
    updateHero({
        ...hero,
        player_resources: {
            ...hero.player_resources,
            vitae_current: check.new_current
        }
    });

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
       fetchedBoss = { name: "Void Stalker", tier: "Uncommon", base_hp: 80, base_damage_min: 8, base_damage_max: 18, dodge_chance: 0.1 };
    }

    const pStats = calcPlayerStats(hero);
    const mStats = calcMonsterStats(fetchedBoss);

    setPlayerHP(hero.hp || pStats.maxHp);
    setEnemyHP(mStats.hp);
    setCurrentEnemy({ ...fetchedBoss, ...mStats });
    addCombatLog(`⚠️ Encountered: ${fetchedBoss.name} [${fetchedBoss.tier}]`);
    setCombatLoading(false);
  };

  const handleAttack = async () => {
     if (combatEnded || !currentEnemy) return;
     const response = await fetch('/api/combat/resolve', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ enemyId: currentEnemy.id || 'void_stalker' })
     });
     const data = await response.json();
     if (!response.ok) {
        addCombatLog(`❌ [ERROR]: ${data.error}`);
        return;
     }

     if (data.win) {
        addCombatLog(`>> [VICTORY] You defeated the enemy! Gained ${data.expGained} EXP and ${data.goldGained} Gold.`);
        setEnemyHP(0);
        handleVictoryServer(data);
     } else {
        addCombatLog(`>> [DEFEAT] You were struck down...`);
        setPlayerHP(0);
        handleDefeatServer();
     }
  };

  const handleVictoryServer = (data) => {
      setCombatEnded(true);
      setTimeout(() => {
          setCombatActive(false);
          updateHero(data.updatedHero);
      }, 2000);
  };

  const handleDefeatServer = () => {
      setCombatEnded(true);
      setTimeout(() => {
          setCombatActive(false);
          updateHero({ ...hero, hp: 0 });
      }, 2000);
  };

  const handleUseItem = () => {
      if (combatEnded || !currentEnemy) return;
      if (!hero.flasks || hero.flasks <= 0) {
          addCombatLog(`❌ [EMPTY]: No Crimson Flasks remaining!`);
          return;
      }
      
      const pStats = calcPlayerStats(hero);
      const newPlayerHp = Math.min(pStats.maxHp, playerHP + 60);
      setPlayerHP(newPlayerHp);
      updateHero({ ...hero, flasks: hero.flasks - 1, hp: newPlayerHp });
      addCombatLog(`🩸 [HEAL]: You consume a flask. +60 HP (Current: ${newPlayerHp})`);
      
      if (isHitDodged(pStats.dodgeChance)) {
          addCombatLog(`💨 [EVADE]: You dodged ${currentEnemy.name}'s counter-attack!`);
      } else {
          const mDamage = rollDamage(currentEnemy.damageMin, currentEnemy.damageMax);
          const postHealDamageHp = Math.max(0, newPlayerHp - mDamage);
          setPlayerHP(postHealDamageHp);
          addCombatLog(`🩸 [WOUNDED]: ${currentEnemy.name} hits you while drinking for ${mDamage}!`);
          if (postHealDamageHp <= 0) handleDefeatServer();
      }
  };

  const handleFlee = () => {
      if (combatEnded || !currentEnemy) return;
      const success = Math.random() < 0.4;
      
      if (success) {
          addCombatLog(`💨 [ESCAPE]: You successfully fled the battle!`);
          updateHero({ ...hero, hp: playerHP });
          setCombatEnded(true);
      } else {
          addCombatLog(`❌ [TRAPPED]: You failed to escape! ${currentEnemy.name} strikes!`);
          const pStats = calcPlayerStats(hero);
          if (isHitDodged(pStats.dodgeChance)) {
              addCombatLog(`💨 [EVADE]: You dodged the pursuit!`);
          } else {
              const mDamage = rollDamage(currentEnemy.damageMin, currentEnemy.damageMax);
              const postFleeHp = Math.max(0, playerHP - mDamage);
              setPlayerHP(postFleeHp);
              addCombatLog(`🩸 [WOUNDED]: Hit for ${mDamage} damage!`);
              if (postFleeHp <= 0) handleDefeatServer();
          }
      }
  };

  const handleVictory = () => {
     setCombatEnded(true);
     addCombatLog(`💀 [VICTORY]: ${currentEnemy.name} has been destroyed.`);
     
     const xpGained = currentEnemy.baseXp || Math.floor((Math.random() * 20) + 10);
     addCombatLog(`✨ [REWARD]: Gained ${xpGained} XP.`);
     
     // Resolve Loot
     let lootedGold = 0;
     if (currentEnemy.loot_table) {
        const table = currentEnemy.loot_table;
        if (table.gold_min && table.gold_max) {
           lootedGold = rollDamage(table.gold_min, table.gold_max);
           addCombatLog(`💰 [LOOT]: Found ${lootedGold} gold!`);
        }
     }

     updateHero({
        ...hero,
        hp: playerHP,
        xp: (hero.xp || 0) + xpGained,
        gold: (hero.gold || 0) + lootedGold
     });
  };

  const handleDefeat = () => {
     setCombatEnded(true);
     addCombatLog(`☠️ [DEATH]: You have fallen to ${currentEnemy.name}.`);
     const goldLoss = Math.floor((hero.gold || 0) * 0.1);
     
     addCombatLog(`🔻 Lost ${goldLoss} gold. Banished to Sanctuary.`);
     
     updateHero({
        ...hero,
        hp: 1,
        gold: Math.max(0, (hero.gold || 0) - goldLoss)
     });

     setTimeout(() => {
        // We can either redirect to Hub or just end combat
        setCombatActive(false);
        setActiveZone(null); // Boot them to directory
     }, 3500);
  };

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
                <div className="grid grid-cols-3 gap-1 border-t border-neutral-900 bg-black p-2 font-mono text-xs uppercase tracking-widest font-bold">
                   <button onClick={handleAttack} className="bg-[#020202] hover:bg-neutral-900 border border-neutral-800 py-6 text-stone-300 hover:text-white transition-colors border-r-0">
                      [Attack]
                   </button>
                   <button onClick={handleUseItem} className="bg-[#020202] hover:bg-neutral-900 border border-neutral-800 py-6 text-emerald-600 hover:text-emerald-400 transition-colors border-r-0 flex flex-col items-center gap-1">
                      [Use Item]
                      <span className="text-[9px] text-stone-600 font-normal">Flasks: {hero.flasks || 0}</span>
                   </button>
                   <button onClick={handleFlee} className="bg-[#020202] hover:bg-neutral-900 border border-neutral-800 py-6 text-stone-500 hover:text-stone-300 transition-colors">
                      [Flee]
                   </button>
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
            <div className="bg-[#020202] border border-neutral-800 p-6 animate-in fade-in">
              <div className="text-xs text-stone-600 font-mono uppercase tracking-widest mb-5">Select Your Ground</div>
              <div className="space-y-3">
                {availableZones.map(zone => (
                  <button key={zone.id} onClick={() => handleEnterZone(zone)} className="w-full flex items-center justify-between bg-black border border-neutral-800 hover:border-red-900/50 p-4 transition-all group text-left">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{zone.icon}</span>
                      <div>
                        <div className="font-bold text-sm text-stone-200 uppercase tracking-widest group-hover:text-red-400 transition-colors">{zone.name}</div>
                        <div className="text-xs text-stone-600 mt-0.5">Level {zone.levelReq}+ · Costs {zone.essenceCost} Essence</div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs text-stone-600">
                      <div className="text-yellow-700">{zone.goldMultiplier}x Gold</div>
                      <div>{zone.xpMultiplier}x XP</div>
                    </div>
                  </button>
                ))}
                {lockedZones.map(zone => (
                  <div key={zone.id} className="w-full flex items-center justify-between bg-black/20 border border-neutral-900 p-4 opacity-40 cursor-not-allowed text-left">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl grayscale">{zone.icon}</span>
                      <div>
                        <div className="font-bold text-sm text-stone-500 uppercase tracking-widest">{zone.name}</div>
                        <div className="text-xs text-stone-700 mt-0.5">Requires Level {zone.levelReq}</div>
                      </div>
                    </div>
                    <span className="text-xs text-stone-700 font-mono">🔒 Locked</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Narrative Terminal */}
          <div className="bg-[#020202] border border-neutral-800 flex flex-col" style={{ height: activeZone ? '500px' : '200px' }}>
            <div className="bg-[#050505] border-b border-neutral-900 p-3 font-mono text-[10px] uppercase tracking-widest text-stone-700 flex justify-between">
              <span>Chronicle</span>
              {activeZone && (
                <button onClick={() => setActiveZone(null)} className="text-stone-700 hover:text-stone-500 transition-colors">
                  ← Change Zone
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6 font-serif text-sm leading-loose space-y-3">
              {log.map((entry, i) => {
                let color = 'text-stone-500';
                if (entry.includes('AMBUSH') || entry.includes('ENCOUNTER')) color = 'text-red-500 font-bold';
                else if (entry.includes('PLUNDER') || entry.includes('Gold')) color = 'text-yellow-600 font-bold';
                else if (entry.includes('SANCTUARY')) color = 'text-emerald-700 font-bold italic';
                else if (entry.includes('MERCHANT')) color = 'text-yellow-500 italic';
                else if (entry.includes('EXHAUSTED')) color = 'text-red-800 font-bold';
                else if (entry.includes('ZONE')) color = 'text-stone-300 italic';
                return (
                  <p key={i} className={`${color}`}>
                    {entry}
                  </p>
                );
              })}
              <div ref={logEndRef} />
            </div>
            {activeZone && (
              <div className="grid grid-cols-2 gap-3 p-4 border-t border-neutral-900 bg-[#050505]">
                <button
                  onClick={() => handleAction('SAFE')}
                  disabled={currentEssence < activeZone.essenceCost}
                  className="bg-neutral-900/50 hover:bg-neutral-800 border border-neutral-800 py-4 text-xs tracking-widest uppercase text-stone-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-mono"
                >
                  Tread Carefully
                  <span className="block text-[10px] text-stone-600 mt-1">{activeZone.essenceCost} Essence</span>
                </button>
                <button
                  onClick={() => handleAction('DARK')}
                  disabled={currentEssence < activeZone.essenceCost}
                  className="bg-red-950/10 hover:bg-red-900/25 border border-red-900/30 py-4 text-xs tracking-widest uppercase text-red-500 font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all font-mono"
                >
                  Plunge into Darkness
                  <span className="block text-[10px] text-red-900 mt-1">{activeZone.essenceCost} Essence</span>
                </button>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
