'use client';
import { useState, useEffect } from 'react';

export default function WorldEventBanner() {
    const [activeEvent, setActiveEvent] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const fetchEvent = async () => {
            try {
                const res = await fetch('/api/world-event');
                if (!res.ok) return;
                const data = await res.json();
                if (data.event) setActiveEvent(data.event);
            } catch (err) {
                // Silent — no banner if fetch fails
            }
        };
        fetchEvent();
    }, []);

    if (!activeEvent || dismissed) return null;

    return (
        <div className="w-full bg-red-950/80 border-b-2 border-red-700 p-2 flex items-center justify-center gap-4 animate-in slide-in-from-top duration-500 z-50 relative">
             <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_red]"></span>
             <div className="text-stone-200 font-mono text-[10px] uppercase tracking-widest flex items-center gap-2">
                 <span className="font-bold text-red-400">WORLD EVENT:</span>
                 <span className="font-serif italic tracking-[0.2em]">{activeEvent.title}</span>
             </div>
             <span className="text-stone-400 font-mono text-[9px] hidden sm:inline">
                 {activeEvent.description}
             </span>
             <button
                 onClick={() => setDismissed(true)}
                 className="ml-2 text-stone-500 hover:text-stone-300 text-xs font-mono transition-colors"
                 title="Dismiss"
             >
                 [X]
             </button>
        </div>
    );
}
