import React, { useState, useEffect } from 'react';
import { calcCombatStats } from '@/lib/gameData';
import { calculateSkillBonuses } from '@/lib/skillTree';
import { calculateCurrentResource, calculateMaxResource } from '@/lib/resources';
import { IconBloodStone } from './icons/GameIcons';

export default function BlackWorldSidebar({ hero, onNavigate }) {
  if (!hero) return null;

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const sb = calculateSkillBonuses(hero.skillPoints || {});
  const stats = calcCombatStats(hero, sb);
  
  const hp = hero.hp || stats.maxHp;
  const maxHp = stats.maxHp;
  const mana = hero.mana ?? 0;
  const maxMana = stats.maxMana;

  // Essence regen (uses the existing resource system)
  const res = { ...hero, ...(hero.player_resources || {}) };
  const essenceMax = calculateMaxResource('essence', hero);
  const eStat = calculateCurrentResource(res, 'essence', essenceMax);

  const formatTime = (secs) => {
    if (secs <= 0) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full flex-shrink-0 select-none hidden lg:flex flex-col z-20 mb-8 border border-neutral-900 bg-[#050505]">
       <div className="bg-[#0a0a0a] border-b border-neutral-900 p-3 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
          <span className="text-red-700 font-bold mr-2">{hero.name}</span> <span className="text-stone-600">Lvl {hero.level}</span>
       </div>
       <div className="p-4 flex flex-col gap-3 font-mono text-[10px] uppercase tracking-[0.2em]">
          
          {/* Health */}
          <div>
             <div className="flex justify-between items-center">
                <span className="text-stone-600">Health</span>
                <span className="text-red-600 font-bold">{hp} / {maxHp}</span>
             </div>
             {hp < maxHp && (
               <div className="text-[8px] text-stone-700 text-right mt-[2px]">Healer / Flask</div>
             )}
          </div>

          {/* Mana */}
          <div>
             <div className="flex justify-between items-center">
                <span className="text-stone-600">Mana</span>
                <span className="text-cyan-600 font-bold">{mana} / {maxMana}</span>
             </div>
             {mana < maxMana && (
               <div className="text-[8px] text-stone-700 text-right mt-[2px]">Rest / Meditate</div>
             )}
          </div>

          {/* Essence */}
          <div>
             <div className="flex justify-between items-center">
                <span className="text-stone-600">Essence</span>
                <span className="text-orange-600 font-bold">{eStat.current} / {eStat.max}</span>
             </div>
             {eStat.next_tick > 0 && (
               <div className="text-[8px] text-stone-700 text-right mt-[2px]">+1 in {formatTime(eStat.next_tick)}</div>
             )}
          </div>

          <div className="flex justify-between items-center">
             <span className="text-stone-600">Blood Stones</span>
             <span className="text-red-500 font-bold inline-flex items-center gap-1"><IconBloodStone size={10} /> {(hero.blood_stones || 0).toLocaleString()}</span>
          </div>

          <div className="flex justify-between items-center">
             <span className="text-stone-600">Wealth</span>
             <span className="text-yellow-600 font-bold">{(hero.gold || 0).toLocaleString()} G</span>
          </div>

          {/* Points Box */}
          <div className="mt-2 pt-4 border-t border-neutral-900 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                 <span className="text-stone-600">Stat Pts</span>
                 <div className="flex items-center gap-2">
                   <span className="text-stone-300 font-bold">{hero.unspent_points || hero.unspentStatPoints || 0}</span>
                   {((hero.unspent_points || hero.unspentStatPoints) > 0) && (
                      <span onClick={() => onNavigate('DASHBOARD')} className="text-red-600 cursor-pointer hover:text-red-400 transition-colors">[USE]</span>
                   )}
                 </div>
              </div>
              
              <div className="flex justify-between items-center">
                 <span className="text-stone-600">Skill Pts</span>
                 <div className="flex items-center gap-2">
                   <span className="text-stone-300 font-bold">{hero.skill_points_unspent || hero.skillPointsUnspent || 0}</span>
                   {((hero.skill_points_unspent || hero.skillPointsUnspent) > 0) && (
                      <span onClick={() => onNavigate('SKILLS')} className="text-red-600 cursor-pointer hover:text-red-400 transition-colors">[USE]</span>
                   )}
                 </div>
              </div>
          </div>
       </div>
    </div>
  );
}

