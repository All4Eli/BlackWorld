'use client';
import { useState, useEffect } from 'react';
import { calculateCurrentResource, calculateMaxResource } from '@/lib/resources';

export default function ResourceBars({ hero, onRefillClick }) {
    const [now, setNow] = useState(Date.now());
    
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const res = { ...hero, ...(hero.player_resources || {}) };
    
    const vitaeMax = calculateMaxResource('vitae', hero);
    const vStat = calculateCurrentResource(res, 'vitae', vitaeMax);
    
    const resolveMax = calculateMaxResource('resolve', hero);
    const rStat = calculateCurrentResource(res, 'resolve', resolveMax);
    
    const essenceMax = calculateMaxResource('essence', hero);
    const eStat = calculateCurrentResource(res, 'essence', essenceMax);

    const bars = [
        { name: 'Vitae', obj: vStat, color: 'bg-red-700', border: 'border-red-900', text: 'text-red-500' },
        { name: 'Resolve', obj: rStat, color: 'bg-blue-700', border: 'border-blue-900', text: 'text-blue-500' },
        { name: 'Essence', obj: eStat, color: 'bg-purple-700', border: 'border-purple-900', text: 'text-purple-500' }
    ];

    const formatTime = (secs) => {
        if (secs <= 0) return 'FULL';
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col gap-3 p-4 bg-black border border-neutral-900 rounded-sm">
            {bars.map(b => {
                const pct = Math.min(100, Math.max(0, (b.obj.current / b.obj.max) * 100));
                const isCrit = pct <= 20 && b.obj.current > 0;
                return (
                    <div key={b.name} className="relative group cursor-pointer" onClick={() => onRefillClick && onRefillClick(b.name.toLowerCase())}>
                        <div className="flex justify-between text-[10px] font-mono tracking-widest uppercase mb-1">
                            <span className={b.text}>{b.name}</span>
                            <span className="text-neutral-500">{b.obj.current} / {b.obj.max}</span>
                        </div>
                        <div className={`h-2 border ${b.border} bg-neutral-950 overflow-hidden relative ${isCrit ? 'animate-pulse' : ''} ${pct === 100 ? 'shadow-[0_0_10px_rgba(255,255,255,0.1)]' : ''}`}>
                            <div className={`h-full ${b.color} transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                        </div>
                        <div className="flex justify-end mt-[2px]">
                            <span className="text-[8px] font-mono text-neutral-600 uppercase">
                                {b.obj.next_tick > 0 ? `+1 IN ${formatTime(b.obj.next_tick)}` : 'Regen Paused (Full)'}
                            </span>
                        </div>
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[10px] uppercase font-mono tracking-widest text-white shadow-black drop-shadow-md">+ Refill</span>
                        </div>
                    </div>
                );
            })}
            
            <div className={`border bg-[#050505] border-red-900 shadow-lg relative overflow-hidden group`}>
                <div className="px-3 py-[6px] relative z-10 flex justify-between items-center text-[10px] font-mono tracking-widest uppercase mb-[2px]">
                    <span className="text-red-500 font-bold pointer-events-none drop-shadow-md">Blood Stones</span>
                    <div className="flex items-center gap-1 font-bold text-stone-300">
                        <span className="text-[#cf2a2a] text-[9px] mb-px">✧</span>
                        {hero?.blood_stones?.toLocaleString() || 0}
                    </div>
                </div>
            </div>
        </div>
    );
}
