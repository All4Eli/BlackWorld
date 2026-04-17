'use client';
import { useState } from 'react';
import { calcCombatStats } from '@/lib/gameData';
import { calculateSkillBonuses } from '@/lib/skillTree';

export default function HealerView({ hero, updateHero, onBack }) {
  const [healing, setHealing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const c = calcCombatStats(hero, calculateSkillBonuses(hero?.skillPoints || {}));
  const healCost = 20;
  const reviveCost = Math.floor((hero?.level || 1) * 10 * 0.1) + 10;
  const isAlive = hero.hp > 0;
  const currentCost = isAlive ? healCost : reviveCost;

  const handleHeal = async () => {
    setHealing(true);
    setErrorMsg('');
    
    try {
      const endpoint = isAlive ? '/api/healer/heal' : '/api/healer/revive';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        updateHero(data.updatedHero);
      } else {
        setErrorMsg(data.error);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setHealing(false);
    }
  };

  const handleBuyFlask = () => {
    if (hero.gold >= 50 && hero.flasks < 5) {
      updateHero({ ...hero, gold: hero.gold - 50, flasks: hero.flasks + 1 });
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left mb-4">
        ← Back to City Directory
      </button>

      <div className="border border-red-900/30 bg-[#050505] p-10 flex flex-col items-center text-center shadow-[0_0_50px_rgba(153,27,27,0.1)]">
        <div className="w-16 h-16 bg-red-950/40 text-red-500 flex items-center justify-center text-3xl mb-6 rounded-full border border-red-900/50 shadow-inner">
          ☥
        </div>
        <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2">The Hollow Healer</h2>
        <p className="text-stone-500 font-mono text-xs tracking-widest leading-relaxed max-w-md mb-10">
          "The flesh weaves back together, for a price. What blood have you brought me today?"
        </p>

        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
          <div className="border border-neutral-900 bg-black/40 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-red-700 uppercase tracking-widest mb-2">{isAlive ? 'Rejuvenation' : 'Resurrection'}</h3>
              <p className="text-[10px] text-stone-500 mb-4">{isAlive ? `Mend your wounds fully to ${c.maxHp} HP.` : 'Return from the dead.'}</p>
              <div className="text-xl font-bold text-yellow-600 mb-6 border-t border-neutral-900 pt-4">{currentCost}g</div>
            </div>
            <button 
              onClick={handleHeal}
              disabled={healing || hero.gold < currentCost || (isAlive && hero.hp >= c.maxHp)}
              className="w-full py-3 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-neutral-900 hover:text-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] text-xs"
            >
              {healing ? 'Channeling...' : 'Pay Tithe'}
            </button>
            {errorMsg && <p className="text-red-500 text-[10px] mt-2">{errorMsg}</p>}
          </div>

          <div className="border border-neutral-900 bg-black/40 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-red-700 uppercase tracking-widest mb-2">Crimson Flask</h3>
              <p className="text-[10px] text-stone-500 mb-4">Purchase a flask for your journeys. You currently carry {hero.flasks}/5.</p>
              <div className="text-xl font-bold text-yellow-600 mb-6 border-t border-neutral-900 pt-4">50g</div>
            </div>
            <button 
              onClick={handleBuyFlask}
              disabled={hero.gold < 50 || hero.flasks >= 5}
              className="w-full py-3 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-neutral-900 hover:text-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] text-xs"
            >
              Purchase
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
