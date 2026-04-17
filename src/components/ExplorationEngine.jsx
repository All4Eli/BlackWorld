'use client';
import { useState, useEffect, useRef } from 'react';
import { ZONES, getDailyQuests, calculateEssence } from '@/lib/gameData';

export default function ExplorationEngine({ hero, updateHero, onFindCombat }) {
  const [log, setLog] = useState(["[ENTRY]: You descend into the dark. Choose your ground."]);
  const [activeZone, setActiveZone] = useState(null);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const currentEssence = hero.essence ?? 100;
  const availableZones = ZONES.filter(z => hero.level >= z.levelReq);
  const lockedZones = ZONES.filter(z => hero.level < z.levelReq);

  const updateQuestProgress = (heroState, type, amount) => {
    if (!heroState.daily_quests) return heroState;
    const updated = heroState.daily_quests.map(q => {
      if (q.type === type && q.progress < q.target) {
        const newProgress = Math.min(q.target, q.progress + amount);
        // Award rewards on completion
        if (newProgress >= q.target && q.progress < q.target) {
          addLog(`✅ [CONTRACT FULFILLED]: "${q.title}" — Reward granted!`);
          if (q.reward.gold) heroState = { ...heroState, gold: heroState.gold + q.reward.gold };
          if (q.reward.xp) heroState = { ...heroState, xp: heroState.xp + q.reward.xp };
          if (q.reward.flasks) heroState = { ...heroState, flasks: heroState.flasks + q.reward.flasks };
        }
        return { ...q, progress: newProgress };
      }
      return q;
    });
    return { ...heroState, daily_quests: updated };
  };

  const handleEnterZone = (zone) => {
    if (currentEssence < zone.essenceCost) {
      addLog(`🩸 [EXHAUSTED]: Not enough Blood Essence. Need ${zone.essenceCost}, have ${currentEssence}.`);
      return;
    }
    setActiveZone(zone);
    addLog(`⚠️ [ZONE]: You enter ${zone.name}.`);
  };

  const handleAction = (pathType) => {
    if (!activeZone) return;
    if (currentEssence < activeZone.essenceCost) {
      addLog(`🩸 [EXHAUSTED]: Blood Essence depleted. Rest or wait for it to recover.`);
      return;
    }

    const roll = Math.random();
    let newHero = {
      ...hero,
      essence: currentEssence - activeZone.essenceCost,
      essence_last_regen: new Date().toISOString()
    };

    // Track essence spent for quests
    newHero = updateQuestProgress(newHero, 'ESSENCE_SPENT', activeZone.essenceCost);

    if (pathType === 'DARK') {
      if (roll > 0.35) {
        addLog(`⚠️ [AMBUSH!]: A shadow tears through the dark. Steel yourself!`);
        updateHero(newHero);
        setTimeout(() => onFindCombat({ zone: activeZone }), 1500);
      } else {
        const goldAmount = Math.floor((Math.random() * 60 + 30) * activeZone.goldMultiplier);
        addLog(`💰 [PLUNDER]: You pry open a rusted chest. Found ${goldAmount} Gold.`);
        newHero = { ...newHero, gold: newHero.gold + goldAmount };
        newHero = updateQuestProgress(newHero, 'GOLD_LOOTED', goldAmount);
        updateHero(newHero);
      }
    } else {
      if (roll > 0.75) {
        addLog(`🩸 [ENCOUNTER]: Something stirs in the passage ahead.`);
        updateHero(newHero);
        setTimeout(() => onFindCombat({ zone: activeZone }), 1500);
      } else if (roll > 0.55) {
        addLog(`🔥 [SANCTUARY]: A blood shrine pulses in the darkness. HP restored.`);
        newHero = { ...newHero, hp: newHero.maxHp };
        updateHero(newHero);
      } else if (roll > 0.3) {
        addLog(`⚖️ [MERCHANT]: The Void Broker materializes from the fog...`);
        updateHero(newHero);
        setMerchantOpen(true);
      } else {
        addLog(`👣 [EMPTY]: The corridor echoes with nothingness.`);
        updateHero(newHero);
      }
    }
  };

  const buyItem = (cost, type) => {
    if (hero.gold < cost) { addLog(`❌ [DENIED]: Not enough gold.`); return; }
    let newHero = { ...hero, gold: hero.gold - cost };
    if (type === 'FLASK') { newHero.flasks += 1; addLog(`⚖️ Purchased Crimson Flask for ${cost}g.`); }
    else if (type === 'HP') { newHero.maxHp += 20; newHero.hp = Math.min(newHero.maxHp, newHero.hp + 20); addLog(`⚖️ Permanent Vitality granted (+20 Max HP) for ${cost}g.`); }
    else if (type === 'WEAPON') {
      const wpn = { id: Math.random().toString(36).substr(2,9), name: "Broker's Falchion", type: 'WEAPON', stat: 12 };
      newHero.artifacts = [...newHero.artifacts, wpn];
      addLog(`⚖️ Purchased ${wpn.name} for ${cost}g.`);
    } else if (type === 'ESSENCE') { newHero.essence = Math.min(100, (newHero.essence ?? 0) + 50); addLog(`⚖️ Purchased Blood Infusion (+50 Essence) for ${cost}g.`); }
    updateHero(newHero);
  };



  return (
    <div className="animate-in fade-in duration-700 w-full max-w-4xl mx-auto pt-6 pb-10">
      <div className="flex flex-col gap-6">
        {/* Zone Selection */}
          {!activeZone && (
            <div className="bg-[#020202] border border-neutral-800 p-6 animate-in fade-in">
              <div className="text-xs text-stone-600 font-mono uppercase tracking-widest mb-5">Select Your Ground</div>
              <div className="space-y-3">
                {availableZones.map(zone => (
                  <button
                    key={zone.id}
                    onClick={() => handleEnterZone(zone)}
                    className="w-full flex items-center justify-between bg-black border border-neutral-800 hover:border-red-900/50 p-4 transition-all group text-left"
                  >
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
                else if (entry.includes('CONTRACT')) color = 'text-emerald-500 font-bold';
                else if (entry.includes('EXHAUSTED')) color = 'text-red-800 font-bold';
                else if (entry.includes('ZONE')) color = 'text-stone-300 italic';
                return (
                  <p key={i} className={`${color} opacity-0 animate-[fadeIn_0.4s_forwards]`} style={{ animationDelay: '0.05s' }}>
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

          {/* Merchant Panel */}
          {merchantOpen && (
            <div className="bg-[#050505] border border-yellow-900/40 shadow-[0_0_30px_rgba(202,138,4,0.08)] animate-in slide-in-from-bottom duration-300">
              <div className="p-5 border-b border-yellow-900/30 flex justify-between items-center">
                <h3 className="text-yellow-600 font-serif font-black text-lg uppercase tracking-[0.2em]">The Void Broker</h3>
                <button onClick={() => setMerchantOpen(false)} className="text-stone-600 hover:text-white text-xs font-mono uppercase tracking-widest transition-colors">Dismiss</button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3 font-mono">
                {[
                  { label: 'Crimson Flask +1', sub: 'Restores 60 HP', cost: 50, type: 'FLASK', color: 'text-red-500' },
                  { label: 'Blood Infusion', sub: '+50 Blood Essence', cost: 80, type: 'ESSENCE', color: 'text-red-700' },
                  { label: 'Permanent Vitality', sub: '+20 Max HP forever', cost: 150, type: 'HP', color: 'text-stone-300' },
                  { label: "Broker's Falchion", sub: 'Weapon (+12 DMG)', cost: 200, type: 'WEAPON', color: 'text-purple-400' },
                ].map(item => (
                  <button key={item.type} onClick={() => buyItem(item.cost, item.type)} className="flex flex-col bg-black border border-neutral-800 p-3 hover:border-yellow-900/50 hover:bg-yellow-950/5 transition-all text-left">
                    <span className={`font-bold text-xs uppercase tracking-widest ${item.color}`}>{item.label}</span>
                    <span className="text-[10px] text-stone-600 mt-1">{item.sub}</span>
                    <span className="text-yellow-600 font-bold text-sm mt-3">{item.cost}g</span>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
