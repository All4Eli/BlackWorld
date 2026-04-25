import React from 'react';
import { calcCombatStats } from '@/lib/gameData';
import { calculateSkillBonuses } from '@/lib/skillTree';
import { IconBloodStone } from './icons/GameIcons';

export default function BlackWorldSidebar({ hero, onNavigate }) {
  if (!hero) return null;

  const stats = calcCombatStats(hero, calculateSkillBonuses(hero.skillPoints || {}));
  
  const hp = hero.hp || stats.maxHp;
  const maxHp = stats.maxHp;
  const hpPercent = Math.min(100, Math.max(0, (hp / maxHp) * 100));

  const maxEnergy = hero.max_essence || 100;
  const energy = hero.essence ?? maxEnergy;
  const energyPercent = Math.min(100, Math.max(0, (energy / maxEnergy) * 100));
  
  return (
    <div className="w-full flex-shrink-0 select-none hidden lg:flex flex-col z-20 mb-8 border border-neutral-900 bg-[#050505]">
       <div className="bg-[#0a0a0a] border-b border-neutral-900 p-3 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
          <span className="text-red-700 font-bold mr-2">{hero.name}</span> <span className="text-stone-600">Lvl {hero.level}</span>
       </div>
       <div className="p-4 flex flex-col gap-4 font-mono text-[10px] uppercase tracking-[0.2em]">
          
          <div className="flex justify-between items-center">
             <span className="text-stone-600">Health</span>
             <span className="text-red-600 font-bold">{hp} / {maxHp}</span>
          </div>

          <div className="flex justify-between items-center">
             <span className="text-stone-600">Essence</span>
             <span className="text-orange-600 font-bold">{energy} / {maxEnergy}</span>
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
