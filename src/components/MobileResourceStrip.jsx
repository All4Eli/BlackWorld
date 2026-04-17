'use client';
import { calculateCurrentResource, calculateMaxResource } from '@/lib/resources';

export default function MobileResourceStrip({ hero, onRefillClick }) {
    if (!hero?.player_resources) return null;

    const res = hero.player_resources;
    const vitaeMax = calculateMaxResource('vitae', hero);
    const vStat = calculateCurrentResource(res, 'vitae', vitaeMax);
    const resolveMax = calculateMaxResource('resolve', hero);
    const rStat = calculateCurrentResource(res, 'resolve', resolveMax);
    const essenceMax = calculateMaxResource('essence', hero);
    const eStat = calculateCurrentResource(res, 'essence', essenceMax);

    const bloodStones = hero.blood_stones || 0;

    return (
        <div className="lg:hidden w-full bg-[#050505] border-b border-neutral-900 px-4 py-2 flex flex-wrap items-center justify-between gap-4 z-40 relative">
            <div className="flex gap-4 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
               <div className="flex flex-col min-w-[80px]" onClick={() => onRefillClick && onRefillClick('vitae')}>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-red-500">Vitae</span>
                  <div className="text-xs font-bold text-stone-300">{vStat.current} <span className="text-stone-600">/ {vStat.max}</span></div>
               </div>
               <div className="flex flex-col min-w-[80px]" onClick={() => onRefillClick && onRefillClick('resolve')}>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-blue-500">Resolve</span>
                  <div className="text-xs font-bold text-stone-300">{rStat.current} <span className="text-stone-600">/ {rStat.max}</span></div>
               </div>
               <div className="flex flex-col min-w-[80px]" onClick={() => onRefillClick && onRefillClick('essence')}>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-purple-500">Essence</span>
                  <div className="text-xs font-bold text-stone-300">{eStat.current} <span className="text-stone-600">/ {eStat.max}</span></div>
               </div>
            </div>
            
            <div className="flex items-center gap-2 px-3 py-1 bg-black border border-red-900/30 rounded-sm whitespace-nowrap ml-auto">
                <span className="text-[#cf2a2a] text-sm leading-none">✧</span>
                <span className="text-stone-300 font-mono text-xs uppercase tracking-widest font-bold">{bloodStones.toLocaleString()}</span>
            </div>
        </div>
    );
}
