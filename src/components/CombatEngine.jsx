'use client';
import { useState, useRef, useEffect } from 'react';
import { calculateSkillBonuses } from '@/lib/skillTree';
import { calcCombatStats } from '@/lib/gameData';
import DeathScreen from './DeathScreen';
import { IconSkull, IconSword, IconCross } from './icons/GameIcons';

export default function CombatEngine({ heroDef, zone, onVictory, onHeroDeath }) {
  // We use internal state for combat logic, but initialize strictly from the unified heroDef
  const [hero, setHero] = useState(heroDef);
  const [enemy, setEnemy] = useState(null);
  const [combatLog, setCombatLog] = useState(["[LORE]: The shadows shift around you..."]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false); // Disable buttons until state loads
  const [sessionData, setSessionData] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [combatLog]);

  const addLog = (message) => {
    if (Array.isArray(message)) {
        setCombatLog(prev => [...prev, ...message]);
    } else {
        setCombatLog(prev => [...prev, message]);
    }
  }

  const fetchCombatState = async () => {
      try {
          const res = await fetch('/api/combat/state');
          const data = await res.json();
          if (data.active) {
              setEnemy({ ...data.monster, hp: data.session.monster_hp, maxHp: data.monster.base_hp });
              setHero(prev => ({ ...prev, hp: data.session.player_hp }));
              setSessionData(data.session);
              setIsPlayerTurn(true);
              addLog(`[ENCOUNTER]: A ${data.monster.name} stands before you.`);

              // Calculate time remaining based on session created_at
              const sessionTime = new Date(data.session.created_at).getTime();
              const elapsed = Math.floor((Date.now() - sessionTime) / 1000);
              const remaining = Math.max(0, 300 - elapsed);
              setTimeRemaining(remaining);
          } else {
              // Should not happen if they are legitimately in COMBAT stage, but just in case
              addLog("[ERROR]: The area is empty. You shouldn't be here.");
          }
      } catch (e) {
          addLog(`[SYSTEM ERROR]: Could not connect to combat servers.`);
      }
  };

  useEffect(() => {
      fetchCombatState();
  }, []);

  // 5-minute visual countdown timer
  useEffect(() => {
      if (!isPlayerTurn || timeRemaining <= 0 || !enemy || enemy.hp <= 0) return;
      const interval = setInterval(() => {
          setTimeRemaining(prev => {
              if (prev <= 1) {
                  clearInterval(interval);
                  handleCombatAction('FLEE'); // Auto-timeout fallback just to trigger the end visually
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);
      return () => clearInterval(interval);
  }, [isPlayerTurn, timeRemaining, enemy]);

  const formatTime = (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const sb = calculateSkillBonuses(hero.skillPoints || {});
  const c = calcCombatStats(hero, sb);

  const handleCombatAction = async (action) => {
      if (hero.hp <= 0 || (enemy && enemy.hp <= 0) || !isPlayerTurn) return;
      setIsPlayerTurn(false);

      try {
          const response = await fetch('/api/combat/turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action })
          });
          const data = await response.json();

          if (!response.ok) {
              addLog(`[X] [ERROR]: ${data.message || 'Action failed'}`);
              setIsPlayerTurn(true);
              return;
          }

          if (data.log) {
              addLog(data.log);
          }

          if (data.state) {
              setHero(prev => ({ ...prev, hp: data.state.playerHp }));
              if (enemy) setEnemy(prev => ({ ...prev, hp: data.state.monsterHp }));
          }

          if (data.isOver) {
              if (data.result === 'VICTORY') {
                  addLog(`+ ${data.rewards?.xp || 0} EXP | + ${data.rewards?.gold || 0} Gold`);
                  setTimeout(() => {
                      onVictory({ ...hero, hp: data.state.playerHp });
                  }, 3000);
              } else if (data.result === 'DEFEAT') {
                  addLog("🛑 [PERISHED]: The dark consumes you...");
                  setTimeout(() => {
                      if (typeof window !== 'undefined') localStorage.removeItem('bw_active_zone');
                      onHeroDeath({ ...hero, hp: 0, activeZone: null });
                  }, 2500);
              } else if (data.result === 'STALEMATE' || data.result === 'FLED') {
                  setTimeout(() => {
                      onVictory({ ...hero, hp: data.state.playerHp }); // Treat stalemate/fled as returning to town
                  }, 3000);
              }
          } else {
              setIsPlayerTurn(true);
          }

      } catch (err) {
          addLog(`✖ [SYSTEM ERROR]: ${err.message}`);
          setIsPlayerTurn(true);
      }
  };

  const handleAttack = () => handleCombatAction('ATTACK');
  const handleFlask = () => handleCombatAction('USE_FLASK');

  // Death is now handled directly within action handlers (handleAttack, handleFlask).


  const renderBar = (current, max, colorClass, bgClass) => {
    const percent = Math.max(0, Math.min(100, (current / max) * 100));
    return (
      <div className={`w-full h-3 rounded-none border border-neutral-800 overflow-hidden ${bgClass} shadow-inner`}>
        <div className={`h-full ${colorClass} transition-all duration-700 ease-out`} style={{ width: `${percent}%` }}></div>
      </div>
    );
  };

  return (
    <div className="animate-in fade-in duration-1000 max-w-7xl mx-auto relative z-10 pt-10">
      
      {/* HEADER BAR */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 bg-black/40 border-b-2 border-red-900/40 p-6 shadow-2xl">
        <div>
          <h1 className="text-4xl font-black text-red-700 uppercase tracking-[0.2em] font-serif drop-shadow-[0_0_10px_rgba(185,28,28,0.8)]">
            BlackWorld
          </h1>
          <p className="text-sm text-stone-500 uppercase tracking-[0.3em] mt-2 font-mono">Dark Combat</p>
        </div>
        <div className="flex gap-8 text-right font-mono">
           <div>
              <div className="text-xs text-stone-600 uppercase">Kills</div>
             <div className="text-xl text-neutral-300 font-bold tracking-widest">{hero.kills}</div>
           </div>
           <div>
              <div className="text-xs text-stone-600 uppercase">Level</div>
             <div className="text-xl text-red-700 font-bold">Lvl. {hero.level}</div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 flex-col-reverse">
        
        {/* LEFT TRAY: HERO HUD */}
        <section className="lg:col-span-1 flex flex-col gap-6 order-2 lg:order-1">
          <div className="bg-[#050505] border border-red-900/20 p-6 shadow-[0_0_15px_rgba(153,27,27,0.1)]">
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-red-900/20">
              <div className="w-12 h-12 bg-red-950/40 border border-red-800/50 flex items-center justify-center text-red-500">
                 <IconCross size={24} className="text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold uppercase tracking-wider text-stone-200">{hero.name}</h2>
                <p className="text-red-700 text-xs uppercase tracking-widest">Level {hero.level}</p>
              </div>
            </div>

            <div className="space-y-6 font-mono">
              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2 text-stone-500">
                  <span>Vitality</span>
                  <span className="text-red-500">{hero.hp} / {c.maxHp}</span>
                </div>
                {renderBar(hero.hp, c.maxHp, "bg-red-700", "bg-black")}
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2 text-stone-500">
                  <span>Blood Magic</span>
                  <span className="text-purple-900">{hero.mana} / {c.maxMana}</span>
                </div>
                {renderBar(hero.mana, c.maxMana, "bg-purple-900", "bg-black")}
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2 text-stone-500">
                  <span>Experience</span>
                  <span className="text-stone-400">{hero.xp} / 100</span>
                </div>
                {renderBar(hero.xp, 100, "bg-stone-600", "bg-black")}
              </div>
            </div>
          </div>
          
          {/* ACTION DECK */}
          <div className="bg-[#050505] border border-red-900/20 p-4 shadow-xl flex flex-col gap-3 font-mono">
            <div className="text-xs text-red-900 uppercase tracking-widest text-center mb-2">Actions</div>
            
            <button 
              onClick={handleAttack}
              disabled={hero.hp <= 0 || !enemy || enemy.hp <= 0 || !isPlayerTurn}
              className="w-full bg-red-950/20 hover:bg-red-900/40 border border-red-800/30 text-red-400 font-bold py-4 text-xs uppercase tracking-widest transition-all disabled:opacity-20 disabled:grayscale"
            >
              Strike (Melee)
            </button>
            
            <button 
              onClick={handleFlask}
              disabled={hero.hp <= 0 || !enemy || enemy.hp <= 0 || !isPlayerTurn}
              className="w-full bg-black hover:bg-neutral-900 border border-neutral-800 text-stone-400 font-bold py-4 text-xs uppercase tracking-widest transition-all disabled:opacity-20 flex justify-between px-4 items-center"
            >
              <span>Crimson Flask</span>
              <span className="text-red-700">[{hero.flasks}]</span>
            </button>
          </div>
        </section>

        {/* CENTER: COMBAT TERMINAL */}
        <section className="lg:col-span-2 flex flex-col h-[350px] lg:h-[700px] order-3 lg:order-2">
          <div className="flex-1 bg-[#020202] border border-red-900/20 flex flex-col shadow-inner overflow-hidden relative">
            
            <div className="flex justify-between items-center px-6 py-4 border-b border-red-900/20 bg-[#050505] font-mono text-xs uppercase tracking-widest text-stone-600">
              <span>Combat Log</span>
              <span className="flex items-center gap-2 text-red-900">
                <div className={`w-2 h-2 ${isPlayerTurn ? 'bg-stone-500 animate-[pulse_2s_infinite]' : 'bg-red-700'}`}></div>
                {isPlayerTurn ? 'Your Turn' : 'Enemy Turn'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 lg:p-8 font-serif text-base leading-loose space-y-4 shadow-[inset_0_0_50px_rgba(0,0,0,1)]">
              {combatLog.map((log, index) => {
                 const text = typeof log === 'string' ? log : log.message;
                 
                 let colorClass = "text-stone-500";
                 if (text.includes('ERROR')) colorClass = "text-red-500 font-bold";
                 else if (text.includes('VICTORY')) colorClass = "text-yellow-600 font-black tracking-wider";
                 else if (text.includes('DEFEAT') || text.includes('PERISHED')) colorClass = "text-red-800 font-black tracking-widest";
                 else if (typeof log === 'object') {
                     if (log.actor === 'player') {
                         if (log.type === 'attack') colorClass = log.isCrit ? "text-yellow-500 font-bold" : "text-stone-300";
                         else if (log.type === 'heal') colorClass = "text-emerald-500";
                         else if (log.type === 'buff' || log.type === 'thorns') colorClass = "text-blue-400";
                         else if (log.type.includes('flee')) colorClass = "text-stone-400 italic";
                     } else if (log.actor === 'monster') {
                         if (log.type === 'attack') colorClass = "text-red-500";
                         else if (log.type === 'special') colorClass = "text-red-600 font-bold";
                         else if (log.type === 'status_damage' || log.type === 'status_apply') colorClass = "text-purple-500 italic";
                     }
                 } else {
                     // Fallback for strings
                     if (text.includes('ENCOUNTER')) colorClass = "text-yellow-600 font-black italic uppercase font-serif drop-shadow-[0_0_5px_rgba(202,138,4,0.4)]";
                     else if (text.includes('EXP') || text.includes('Gold')) colorClass = "text-yellow-500 font-bold";
                 }
                 
                 return (
                   <p key={index} className={`${colorClass} border-l-2 border-transparent pl-4 hover:border-red-900/30 transition-all`}>
                     {text}
                   </p>
                 );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </section>

        {/* RIGHT TRAY: TARGET HUD */}
        <section className="lg:col-span-1 order-1 lg:order-3">
          {enemy && enemy.hp > 0 ? (
            <div className={`bg-[#050505] border p-6 shadow-2xl relative overflow-hidden transition-all duration-300 ${enemy.is_boss ? "border-yellow-600/50 shadow-[0_0_30px_rgba(202,138,4,0.1)]" : "border-red-900/30"}`}>
              
              <h3 className={`text-xs font-bold tracking-widest uppercase mb-2 font-mono flex justify-between ${enemy.is_boss ? 'text-yellow-600 animate-pulse' : 'text-red-900'}`}>
                <span>{enemy.is_boss ? "BOSS" : "Enemy"}</span>
                {timeRemaining > 0 && <span className="text-red-500 tabular-nums">{formatTime(timeRemaining)}</span>}
              </h3>
              <h2 className="text-3xl font-black text-stone-200 uppercase tracking-widest mb-6 font-serif">{enemy.name}</h2>
              
              <div className="font-mono">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2 text-stone-500">
                  <span>Health</span>
                  <span className="text-red-600">{enemy.hp} / {enemy.maxHp}</span>
                </div>
                {renderBar(enemy.hp, enemy.maxHp, "bg-red-800", "bg-black")}
              </div>

              <div className="mt-8 pt-6 font-mono border-t border-neutral-900">
                <div className="text-xs text-stone-600 uppercase tracking-widest mb-2">Damage</div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-red-500">Max Dmg: {(enemy.base_dmg || 5) + (enemy.is_boss ? 4 : 2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full border border-neutral-900 border-dashed flex flex-col items-center justify-center p-6 text-center bg-black">
               <IconSkull size={36} className="mb-4 text-red-900" />
               <p className="text-stone-700 font-mono text-xs uppercase tracking-widest">The area is silent...</p>
            </div>
          )}
          
        </section>

      </div>
    </div>
  );
}
