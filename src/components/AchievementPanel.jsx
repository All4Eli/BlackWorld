'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AchievementPanel({ hero, updateHero }) {
    const [achievements, setAchievements] = useState([]);
    const [tab, setTab] = useState('achievements');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAchvs = async () => {
            setLoading(true);
            const { data } = await supabase.from('achievements').select('*');
            if (data) setAchievements(data);
            setLoading(false);
        };
        fetchAchvs();
    }, []);

    // Placeholder data since we might not have seeded all perfectly in the mega script
    const sampleAchievements = [
        { id: 1, name: "First Blood", description: "Slay your first monstrosity.", is_repeatable: false },
        { id: 2, name: "Gold Hoarder", description: "Collect mountains of gold.", is_repeatable: true, times_completed: 4 },
        { id: 3, name: "Enhancement Master", description: "Push an item past its normal limits.", is_repeatable: true, times_completed: 1 }
    ];

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="border border-stone-800 bg-[#050505] shadow-[0_0_50px_rgba(255,255,255,0.02)]">
                <div className="flex border-b border-stone-800 font-mono text-xs text-stone-500 tracking-widest uppercase">
                    <button onClick={() => setTab('achievements')} className={`flex-1 py-4 ${tab === 'achievements' ? 'bg-stone-900 border-b-2 border-stone-400 text-stone-200' : 'bg-black hover:bg-neutral-900'}`}>Achievements</button>
                    <button onClick={() => setTab('titles')} className={`flex-1 py-4 ${tab === 'titles' ? 'bg-stone-900 border-b-2 border-stone-400 text-stone-200' : 'bg-black hover:bg-neutral-900'}`}>Titles</button>
                </div>

                <div className="p-8 min-h-[400px]">
                    {tab === 'achievements' && (
                        <div className="flex flex-col gap-8">
                            <div className="flex justify-between items-end border-b border-neutral-900 pb-4">
                                <div>
                                     <div className="text-stone-500 font-mono text-xs uppercase tracking-widest mb-1">Total Score</div>
                                     <div className="text-4xl font-black font-serif text-stone-300">{hero.achievement_points || 0}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-stone-500 text-xs font-mono uppercase">Infinite Progression Enabled</div>
                                    <div className="text-[10px] text-stone-600 font-mono mt-1 w-64">Certain achievements can be repeated infinitely with escalating requirements.</div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {sampleAchievements.map(a => (
                                    <div key={a.id} className="border border-neutral-800 p-4 bg-black flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-bold font-serif uppercase tracking-widest text-stone-300">{a.name}</h3>
                                                {a.is_repeatable && <span className="text-[9px] font-mono text-purple-500 border border-purple-900/50 px-2 uppercase shadow-[0_0_10px_purple]">Repeatable</span>}
                                            </div>
                                            <p className="text-stone-500 text-sm mt-2">{a.description}</p>
                                        </div>
                                        {a.is_repeatable && a.times_completed > 0 && (
                                            <div className="text-xs font-mono text-purple-400 mt-4 border-t border-neutral-900 pt-2 text-right">
                                                ★ Completed {a.times_completed}x
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'titles' && (
                        <div className="text-center py-10">
                            <h3 className="font-serif text-stone-300 text-xl tracking-widest uppercase">Eminent Domain</h3>
                            <p className="font-mono text-xs text-stone-500 mt-2">Titles earned through glory, suffering, and repetition.</p>
                            
                            <div className="mt-8 flex flex-col items-center gap-4">
                                <div className="px-6 py-3 border border-yellow-900/50 text-yellow-500 font-serif uppercase tracking-widest shadow-[0_0_20px_rgba(202,138,4,0.1)] bg-yellow-950/20">The Limitless</div>
                                <div className="px-6 py-3 border border-red-900/50 text-red-500 font-serif uppercase tracking-widest shadow-[0_0_20px_rgba(220,38,38,0.1)] bg-red-950/20">Blood Baron</div>
                                <div className="px-6 py-3 border border-neutral-800 text-stone-400 font-serif uppercase tracking-widest bg-black">Wanderer</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
