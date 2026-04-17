'use client';
import { useState, useRef, useEffect } from 'react';
import DeathScreen from './DeathScreen';

export default function CombatEngine({ heroDef, zone, onVictory, onHeroDeath }) {
  // We use internal state for combat logic, but initialize strictly from the unified heroDef
  const [hero, setHero] = useState(heroDef);
  const activeZone = zone || null;
  
  const [enemy, setEnemy] = useState({ name: 'Feral Ghoul', hp: 40, maxHp: 40, attackDamage: 8, isBoss: false });
  const [combatLog, setCombatLog] = useState(["[LORE]: You enter the Bloodied Cathedral."]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [combatLog]);

  const addLog = (message) => {
    setCombatLog(prev => [...prev, message]);
  }

  const mountEnemy = () => {
    const levelMulti = 1 + (hero.level * 0.3);
    const isBossRoll = hero.kills > 0 && hero.kills % 3 === 0;

    // Pull from zone data if available, otherwise use fallback
    const bossPool = activeZone?.bosses || [
      { name: 'The Nameless Sovereign', baseHp: 200, baseDmg: 20, isBoss: true },
      { name: 'Warden of the Abyss', baseHp: 250, baseDmg: 15, isBoss: true }
    ];
    const enemyPool = activeZone?.enemies || [
      { name: 'Gargoyle', baseHp: 60, baseDmg: 10, isBoss: false },
      { name: 'Wraith', baseHp: 45, baseDmg: 18, isBoss: false },
      { name: 'Flesh Golem', baseHp: 110, baseDmg: 8, isBoss: false }
    ];

    const pool = isBossRoll ? bossPool : enemyPool;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const scaled = {
      ...chosen,
      maxHp: Math.floor(chosen.baseHp * levelMulti),
      hp: Math.floor(chosen.baseHp * levelMulti),
      attackDamage: Math.floor(chosen.baseDmg * levelMulti)
    };
    setEnemy(scaled);
    if (scaled.isBoss) {
      addLog(`[BOSS]: ${scaled.name} blocks your path.`);
    } else {
      addLog(`[ENCOUNTER]: A ${scaled.name} emerges from the shadows.`);
    }
  };

  useEffect(() => {
    mountEnemy();
  }, []);

  const handleLevelUp = (currentHero) => {
    if (currentHero.xp >= 100) {
      addLog(`[ASCENSION]: You reached Level ${currentHero.level + 1}! Vitality increased.`);
      return {
        ...currentHero,
        level: currentHero.level + 1,
        xp: currentHero.xp - 100,
        maxHp: currentHero.maxHp + 25,
        hp: currentHero.maxHp + 25,
        maxMana: currentHero.maxMana + 15,
        flasks: currentHero.flasks + 1 // Bonus flask on level up
      };
    }
    return currentHero;
  }

  const handleAttack = () => {
    if (hero.hp <= 0 || enemy.hp <= 0 || !isPlayerTurn) return;
    setIsPlayerTurn(false);

    // Calculate Hero Damage with Equipped Gear Math
    const weaponMod = hero.equippedWeapon ? hero.equippedWeapon.stat : 0;
    const heroDamage = Math.floor(Math.random() * 8) + hero.baseDmg + weaponMod; 
    
    const newEnemyHp = Math.max(0, enemy.hp - heroDamage);
    setEnemy(prev => ({ ...prev, hp: newEnemyHp }));
    addLog(`⚔️ [STRIKE]: Your weapon cuts ${enemy.name} for ${heroDamage} damage.`);

    if (newEnemyHp === 0) {
      const xpDrop = enemy.isBoss ? 100 : 40;
      const goldDrop = enemy.isBoss ? (Math.floor(Math.random() * 200) + 100) : (Math.floor(Math.random() * 20) + 10);
      
      const flaskDropProbability = Math.random();
      let droppedFlask = false;
      if (flaskDropProbability > 0.6) droppedFlask = true;

      // Bosses drop physical Weapon Artifacts
      let droppedArtifact = null;
      if (enemy.isBoss) {
        const artifacts = [
          { name: "Executioner's Greatsword", type: 'WEAPON', stat: 15 },
          { name: "Abyssal Dagger", type: 'WEAPON', stat: 8 },
          { name: "Blood-Soaked Battleaxe", type: 'WEAPON', stat: 22 },
          { name: "Sovereign's Crown (Armor)", type: 'ARMOR', stat: 50 }
        ];
        // Unique ID generation for inventory assignment
        const generated = artifacts[Math.floor(Math.random() * artifacts.length)];
        droppedArtifact = { ...generated, id: Math.random().toString(36).substr(2, 9) };
      }

      addLog(`🏆 [SLAUGHTER]: The ${enemy.name} was eradicated.`);
      addLog(`+ ${xpDrop} EXP | + ${goldDrop} Gold`);
      if (droppedFlask) addLog(`🩸 Found 1x Crimson Flask amongst the ash.`);
      if (droppedArtifact) addLog(`🔮 [ARTIFACT FOUND!]: Captured ${droppedArtifact.name} (+${droppedArtifact.stat} Stat)`);
      
      const newKills = hero.kills + 1;
      
      setHero(prev => {
        let updated = { 
          ...prev, 
          kills: newKills, 
          xp: prev.xp + xpDrop,
          gold: prev.gold + goldDrop,
          flasks: droppedFlask ? prev.flasks + 1 : prev.flasks,
          artifacts: droppedArtifact ? [...prev.artifacts, droppedArtifact] : prev.artifacts
        };
        const levelUpHero = handleLevelUp(updated);
        
        // Signal victory to parent to exit combat loop after delay
        setTimeout(() => {
          onVictory(levelUpHero);
        }, 3000);
        
        return levelUpHero;
      });
      
      return;
    }

    // ENEMY PHASE
    setTimeout(() => {
      const enemyDmg = Math.floor(Math.random() * (enemy.isBoss ? 10 : 5)) + enemy.attackDamage;
      setHero(prev => ({ ...prev, hp: Math.max(0, prev.hp - enemyDmg) }));
      addLog(`⚠️ [AGONY]: ${enemy.name} strikes for ${enemyDmg} damage!`);

      if (hero.hp - enemyDmg <= 0) {
        addLog("🛑 [PERISHED]: The dark consumes you...");
      } else {
        setIsPlayerTurn(true);
      }
    }, 1200);
  };

  const handleFlask = () => {
     if (hero.hp <= 0 || enemy.hp <= 0 || !isPlayerTurn) return;
     if (hero.flasks <= 0) {
        addLog("🚫 [EMPTY]: You reach for a Flask, but have none left.");
        return;
     }

     setIsPlayerTurn(false);
     setHero(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + 60), flasks: prev.flasks - 1 }));
     addLog("🩸 [CRIMSON FLASK]: You crush a glass vial and restore 60 HP.");

    setTimeout(() => {
      const enemyDmg = Math.floor(Math.random() * 5) + enemy.attackDamage;
      setHero(prev => ({ ...prev, hp: Math.max(0, prev.hp - enemyDmg) }));
      addLog(`⚠️ [AGONY]: ${enemy.name} punishes your healing phase for ${enemyDmg} damage!`);
      if (hero.hp - enemyDmg <= 0) {
        addLog("🛑 [PERISHED]: The dark consumes you...");
      } else {
        setIsPlayerTurn(true);
      }
    }, 1200);
  }

  // Check Death Trigger to bubble up to Game State manager
  useEffect(() => {
    if (hero.hp <= 0) {
       setTimeout(() => {
         onHeroDeath();
       }, 2500); // Wait 2.5s before showing Death Screen overlay
    }
  }, [hero.hp, onHeroDeath]);


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
          <p className="text-sm text-stone-500 uppercase tracking-[0.3em] mt-2 font-mono">Endless Protocol</p>
        </div>
        <div className="flex gap-8 text-right font-mono">
           <div>
             <div className="text-xs text-stone-600 uppercase">Entities Slain</div>
             <div className="text-xl text-neutral-300 font-bold tracking-widest">{hero.kills}</div>
           </div>
           <div>
             <div className="text-xs text-stone-600 uppercase">Ascension</div>
             <div className="text-xl text-red-700 font-bold">Lvl. {hero.level}</div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* LEFT TRAY: HERO HUD */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-[#050505] border border-red-900/20 p-6 shadow-[0_0_15px_rgba(153,27,27,0.1)]">
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-red-900/20">
              <div className="w-12 h-12 bg-red-950/40 border border-red-800/50 flex items-center justify-center text-red-500">
                 <span className="text-2xl font-serif">†</span>
              </div>
              <div>
                <h2 className="text-xl font-bold uppercase tracking-wider text-stone-200">{hero.name}</h2>
                <p className="text-red-700 text-xs uppercase tracking-widest break-words overflow-hidden">{hero.class}</p>
              </div>
            </div>

            <div className="space-y-6 font-mono">
              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2 text-stone-500">
                  <span>Vitality</span>
                  <span className="text-red-500">{hero.hp} / {hero.maxHp}</span>
                </div>
                {renderBar(hero.hp, hero.maxHp, "bg-red-700", "bg-black")}
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2 text-stone-500">
                  <span>Blood Magic</span>
                  <span className="text-purple-900">{hero.mana} / {hero.maxMana}</span>
                </div>
                {renderBar(hero.mana, hero.maxMana, "bg-purple-900", "bg-black")}
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
              disabled={hero.hp <= 0 || enemy.hp <= 0 || !isPlayerTurn}
              className="w-full bg-red-950/20 hover:bg-red-900/40 border border-red-800/30 text-red-400 font-bold py-4 text-xs uppercase tracking-widest transition-all disabled:opacity-20 disabled:grayscale"
            >
              Strike (Melee)
            </button>
            
            <button 
              onClick={handleFlask}
              disabled={hero.hp <= 0 || enemy.hp <= 0 || !isPlayerTurn}
              className="w-full bg-black hover:bg-neutral-900 border border-neutral-800 text-stone-400 font-bold py-4 text-xs uppercase tracking-widest transition-all disabled:opacity-20 flex justify-between px-4 items-center"
            >
              <span>Crimson Flask</span>
              <span className="text-red-700">[{hero.flasks}]</span>
            </button>
          </div>
        </section>

        {/* CENTER: COMBAT TERMINAL */}
        <section className="lg:col-span-2 flex flex-col h-[700px]">
          <div className="flex-1 bg-[#020202] border border-red-900/20 flex flex-col shadow-inner overflow-hidden relative">
            
            <div className="flex justify-between items-center px-6 py-4 border-b border-red-900/20 bg-[#050505] font-mono text-xs uppercase tracking-widest text-stone-600">
              <span>The Tome of Records</span>
              <span className="flex items-center gap-2 text-red-900">
                <div className={`w-2 h-2 ${isPlayerTurn ? 'bg-stone-500 animate-[pulse_2s_infinite]' : 'bg-red-700'}`}></div>
                {isPlayerTurn ? 'Awaiting Judgment' : 'The Shadows Move'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-8 font-serif text-base leading-loose space-y-4 shadow-[inset_0_0_50px_rgba(0,0,0,1)]">
              {combatLog.map((log, index) => {
                 let colorClass = "text-stone-500";
                 if (log.includes('AGONY')) colorClass = "text-red-600 font-bold";
                 else if (log.includes('STRIKE')) colorClass = "text-stone-300";
                 else if (log.includes('SLAUGHTER') || log.includes('ASCENSION')) colorClass = "text-red-400 font-serif text-lg tracking-wide shadow-black drop-shadow-md";
                 else if (log.includes('CRIMSON')) colorClass = "text-red-500 font-bold";
                 else if (log.includes('PERISHED') || log.includes('DENIED') || log.includes('EMPTY')) colorClass = "text-red-800 font-black tracking-widest";
                 else if (log.includes('LORE') || log.includes('SHADOWS')) colorClass = "text-neutral-700 italic";
                 else if (log.includes('BOSS')) colorClass = "text-yellow-600 font-black text-xl italic uppercase font-serif drop-shadow-[0_0_5px_rgba(202,138,4,0.4)]";
                 
                 return (
                   <p key={index} className={`${colorClass} opacity-0 animate-[fadeIn_0.5s_forwards] border-l-2 border-transparent pl-4 hover:border-red-900/30 transition-all`} style={{ animationDelay: '0.1s' }}>
                     {log}
                   </p>
                 );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </section>

        {/* RIGHT TRAY: TARGET HUD */}
        <section className="lg:col-span-1">
          {enemy.hp > 0 ? (
            <div className={`bg-[#050505] border p-6 shadow-2xl relative overflow-hidden transition-all duration-300 ${enemy.isBoss ? "border-yellow-600/50 shadow-[0_0_30px_rgba(202,138,4,0.1)]" : "border-red-900/30"}`}>
              
              <h3 className={`text-xs font-bold tracking-widest uppercase mb-2 font-mono ${enemy.isBoss ? 'text-yellow-600 animate-pulse' : 'text-red-900'}`}>
                {enemy.isBoss ? "CRITICAL THREAT" : "Current Prey"}
              </h3>
              <h2 className="text-3xl font-black text-stone-200 uppercase tracking-widest mb-6 font-serif">{enemy.name}</h2>
              
              <div className="font-mono">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2 text-stone-500">
                  <span>Integrity (HP)</span>
                  <span className="text-red-600">{enemy.hp} / {enemy.maxHp}</span>
                </div>
                {renderBar(enemy.hp, enemy.maxHp, "bg-red-800", "bg-black")}
              </div>

              <div className="mt-8 pt-6 font-mono border-t border-neutral-900">
                <div className="text-xs text-stone-600 uppercase tracking-widest mb-2">Threat Assessment</div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-red-500">Max Dmg: {enemy.attackDamage + (enemy.isBoss ? 4 : 2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full border border-neutral-900 border-dashed flex flex-col items-center justify-center p-6 text-center bg-black">
               <span className="text-4xl mb-4 text-red-900 font-serif">☠</span>
               <p className="text-stone-700 font-mono text-xs uppercase tracking-widest">The area is silent...</p>
            </div>
          )}
          
        </section>

      </div>
    </div>
  );
}
