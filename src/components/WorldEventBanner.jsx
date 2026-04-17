'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WorldEventBanner() {
    const [activeEvent, setActiveEvent] = useState(null);

    useEffect(() => {
        // Fetch the most active world event
        const fetchEvent = async () => {
            try {
                const now = new Date().toISOString();
                const { data, error } = await supabase.from('world_events')
                    .select('*')
                    .eq('is_active', true)
                    .not('starts_at', 'is', null)
                    .lte('starts_at', now)
                    .gte('ends_at', now)
                    .order('starts_at', { ascending: false })
                    .limit(1)
                    .single();
                if (!error && data) setActiveEvent(data);
            } catch (err) {
                console.warn('Silent failure on World Event check.');
            }
        };
        fetchEvent();

        // Real-time listener for events triggering across the frontend
        const sub = supabase.channel('public:world_events')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'world_events' }, payload => {
                const nowMs = Date.now();
                const isValidEvent = payload.new?.is_active && 
                                     payload.new?.starts_at && 
                                     payload.new?.ends_at && 
                                     new Date(payload.new.starts_at).getTime() <= nowMs &&
                                     new Date(payload.new.ends_at).getTime() >= nowMs;

                if (isValidEvent) {
                    setActiveEvent(payload.new);
                } else {
                    // If the event was deactivated, clear it only if it's the one we're showing
                    setActiveEvent(prev => prev?.id === payload.old?.id ? null : prev);
                }
            })
            .subscribe();

        return () => supabase.removeChannel(sub);
    }, []); // Run once on mount — no dependency on activeEvent

    if (!activeEvent) return null;

    return (
        <div className="w-full bg-red-950/80 border-b-2 border-red-700 p-2 flex items-center justify-center gap-4 animate-in slide-in-from-top duration-500 z-50 relative">
             <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_red]"></span>
             <div className="text-stone-200 font-mono text-[10px] uppercase tracking-widest flex items-center gap-2">
                 <span className="font-bold text-red-400">WORLD EVENT:</span>
                 <span className="font-serif italic tracking-[0.2em]">{activeEvent.name}</span>
             </div>
             <button onClick={() => alert(`World Event: ${activeEvent.name}\n\nExplore the world to participate!`)} className="px-4 py-1 border border-stone-400/50 hover:bg-white/10 text-stone-300 font-mono text-[9px] uppercase tracking-widest ml-4 transition-colors">
                 Join Fray
             </button>
        </div>
    );
}
