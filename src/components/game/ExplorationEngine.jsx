'use client';

import { useState, useRef, useEffect } from 'react';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({ subsets: ['latin'] });

export default function ExplorationEngine({ initialDungeons, playerHp, maxHp, playerLevel }) {
  const [view, setView] = useState('SELECTION'); // 'SELECTION' | 'COMBAT' | 'DEATH' | 'VICTORY'
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Combat State
  const [log, setLog] = useState([]);
  const [currentHp, setCurrentHp] = useState(playerHp);
  const [monsterHp, setMonsterHp] = useState(0);
  const [dungeonState, setDungeonState] = useState(null); // tracking floor
  const [deathMessage, setDeathMessage] = useState(null);
  const [rewards, setRewards] = useState(null);

  const logEndRef = useRef(null);

  // Auto-scroll the combat log
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [log]);

  const handleStartDungeon = async (dungeonId) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch('/api/dungeons/start', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-idempotency-key': crypto.randomUUID()
        },
        body: JSON.stringify({ dungeonId })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      // Automatically advance to the first floor
      await advanceFloor(true);

    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  const advanceFloor = async (cleared) => {
    try {
      const res = await fetch('/api/dungeons/advance', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-idempotency-key': crypto.randomUUID()
        },
        body: JSON.stringify({ floorCleared: cleared })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      if (data.status === 'VICTORY') {
        setRewards(data.rewards);
        setView('VICTORY');
        setIsProcessing(false);
        return;
      }

      if (data.status === 'DEFEAT') {
        setView('DEATH');
        setIsProcessing(false);
        return;
      }

      // IN_PROGRESS: We got a new combat session
      setDungeonState({
        floor: data.floor,
        totalFloors: data.totalFloors,
        encounterType: data.encounterType
      });
      
      setMonsterHp(data.combatState.monsterHp);
      setCurrentHp(data.combatState.playerHp);
      setLog([{ actor: 'system', message: `You entered Floor ${data.floor}. A ${data.encounterType} encounter begins!` }]);
      setView('COMBAT');
      setIsProcessing(false);

    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  const handleCombatAction = async (action) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch('/api/combat/turn', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-idempotency-key': crypto.randomUUID()
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      // Hydrate local state from server truth
      setCurrentHp(data.state.playerHp);
      setMonsterHp(data.state.monsterHp);
      
      // Append logs
      setLog(prev => [...prev, ...data.log]);

      if (data.isOver) {
        setTimeout(() => {
            if (data.result === 'VICTORY') {
                // If monster died, advance the floor
                advanceFloor(true);
            } else if (data.result === 'FLED') {
                advanceFloor(false);
                setDeathMessage("You cowardly fled the dungeon.");
            } else {
                setDeathMessage("You have been slain.");
                advanceFloor(false);
            }
        }, 1500); // Small pause for player to read the killing blow text
      } else {
        setIsProcessing(false);
      }

    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  // -------------------------------------------------------------
  // RENDERING HELPERS
  // -------------------------------------------------------------

  if (view === 'SELECTION') {
    return (
      <div className="space-y-6">
        <header className="border-b border-[#333] pb-4">
          <h1 className={`${playfair.className} text-4xl text-white tracking-widest uppercase`}>Exploration</h1>
          <p className="text-gray-500 uppercase tracking-widest text-sm mt-2">Select your descent.</p>
        </header>

        {error && <div className="p-4 bg-red-900/40 border border-[#8b0000] text-red-200">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initialDungeons.map(d => (
            <div key={d.id} className="bg-[#1a1a1a] border border-[#333] p-6 hover:border-[#555] transition-colors flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-bold text-white tracking-widest uppercase">{d.name}</h2>
                <span className="text-xs text-[#8b0000] tracking-widest uppercase border border-[#8b0000] px-2 py-1">Lvl {d.min_level}</span>
              </div>
              <p className="text-sm text-gray-400 mb-6 flex-1">{d.description}</p>
              
              {d.onCooldown ? (
                <button disabled className="w-full bg-[#050505] border border-[#333] text-gray-600 p-3 uppercase tracking-widest text-sm cursor-not-allowed">
                  Locked (Cooldown)
                </button>
              ) : d.levelLocked ? (
                <button disabled className="w-full bg-[#050505] border border-[#333] text-gray-600 p-3 uppercase tracking-widest text-sm cursor-not-allowed">
                  Level Req Not Met
                </button>
              ) : (
                <button 
                  onClick={() => handleStartDungeon(d.id)}
                  disabled={isProcessing}
                  className="w-full bg-[#8b0000] hover:bg-red-800 text-white p-3 uppercase tracking-widest text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Validating...' : 'Enter Dungeon'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'DEATH' || view === 'VICTORY') {
    const isVictory = view === 'VICTORY';
    return (
       <div className="flex flex-col items-center justify-center min-h-[60dvh] md:min-h-[60vh] space-y-6">
         <h1 className={`${playfair.className} text-5xl ${isVictory ? 'text-yellow-600' : 'text-[#8b0000]'} tracking-widest uppercase`}>
            {isVictory ? 'Dungeon Cleared' : 'Defeat'}
         </h1>
         <p className="text-gray-400 tracking-widest uppercase">
            {isVictory ? 'You survived the abyss.' : (deathMessage || 'You succumbed to the darkness.')}
         </p>
         
         {isVictory && rewards && (
             <div className="flex space-x-6 text-sm uppercase tracking-widest border border-[#333] bg-[#1a1a1a] p-4">
                <span className="text-yellow-600">+{rewards.gold} Gold</span>
                <span className="text-blue-400">+{rewards.xp} XP</span>
             </div>
         )}

         <button 
            onClick={() => window.location.reload()}
            className="mt-8 px-8 py-3 border border-white text-white hover:bg-white hover:text-black transition-colors uppercase tracking-widest text-sm"
         >
            Return to Camp
         </button>
       </div>
    );
  }

  // ACTIVE COMBAT VIEW
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-[80dvh] md:min-h-[80vh]">
      
      {/* Left side: Action Controls & Status */}
      <div className="col-span-1 flex flex-col space-y-6">
        <div className="bg-[#1a1a1a] border border-[#333] p-4 text-center">
            <h2 className="text-[#8b0000] tracking-widest uppercase text-sm mb-2 font-bold">Your Entity</h2>
            <div className="text-2xl font-bold text-white mb-1">{currentHp}</div>
            <div className="w-full bg-[#050505] h-2 border border-[#333] mt-2">
                <div className="bg-[#8b0000] h-full transition-all duration-300" style={{ width: `${Math.max(0, (currentHp / maxHp) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-1 block">Health Points</span>
        </div>

        <div className="flex-1 flex flex-col space-y-3 justify-end">
            <h3 className="text-gray-500 text-xs tracking-widest uppercase border-b border-[#333] pb-2 mb-2">Combat Actions</h3>
            {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
            
            <button 
              disabled={isProcessing}
              onClick={() => handleCombatAction('ATTACK')}
              className="w-full bg-white text-black p-4 font-bold uppercase tracking-widest hover:bg-gray-200 disabled:opacity-30 transition-all font-serif"
            >
              ⚔ Attack
            </button>
            <button 
              disabled={isProcessing}
              onClick={() => handleCombatAction('USE_FLASK')}
              className="w-full bg-[#1a1a1a] border border-[#333] text-[#8b0000] p-4 font-bold uppercase tracking-widest hover:bg-[#333] disabled:opacity-30 transition-all"
            >
              Drink Flask
            </button>
            <button 
              disabled={isProcessing}
              onClick={() => handleCombatAction('FLEE')}
              className="w-full bg-[#050505] border border-[#333] text-gray-500 p-4 font-bold uppercase tracking-widest hover:bg-[#1a1a1a] disabled:opacity-30 transition-all"
            >
              Flee
            </button>
        </div>
      </div>

      {/* Right side: The Log Area */}
      <div className="col-span-3 bg-[#050505] border border-[#333] flex flex-col relative">
        <div className="absolute top-0 w-full flex justify-between px-6 py-3 border-b border-[#333] bg-[#0a0a0a] z-10 shadow-md">
            <span className="text-gray-400 text-xs tracking-widest uppercase">
              Floor {dungeonState?.floor} / {dungeonState?.totalFloors}
            </span>
            <div className="flex items-center gap-4">
                <span className="text-[#8b0000] text-xs font-bold tracking-widest uppercase">Target Unknown</span>
                <div className="w-32 bg-black h-1.5 border border-[#333]">
                    <div className="bg-[#8b0000] h-full transition-all duration-300" style={{ width: `${Math.max(0, monsterHp > 500 ? 100 : (monsterHp / 100) * 100)}%` }} />
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-16 pb-6 space-y-2 font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-black">
            {log.length === 0 && (
                <div className="text-gray-600 text-center mt-12 animate-pulse">Awaiting engagement...</div>
            )}
            {log.map((entry, idx) => {
                // Color Logic based on GDD requirements
                let textColor = 'text-gray-400';
                
                if (entry.actor === 'player') {
                    if (entry.type === 'attack') textColor = entry.isCrit ? 'text-yellow-600' : 'text-gray-200';
                    if (entry.type === 'heal') textColor = 'text-green-600';
                    if (entry.type === 'flee_fail') textColor = 'text-red-500';
                } else if (entry.actor === 'monster') {
                    if (entry.type === 'attack' || entry.type === 'special') textColor = 'text-[#8b0000]';
                    if (entry.type === 'status_damage') textColor = 'text-purple-600';
                } else {
                    // System text
                    textColor = 'text-blue-500';
                }

                return (
                    <div key={idx} className={`${textColor} bg-opacity-10 px-2 py-1`}>
                        <span className="opacity-50 mr-2 border-r border-[#333] pr-2 text-xs">{(idx + 1).toString().padStart(3, '0')}</span>
                        {entry.message}
                    </div>
                );
            })}
            <div ref={logEndRef} />
        </div>
      </div>

    </div>
  );
}
