'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function QuestLog({ hero, updateHero, onBack }) {
    const [quests, setQuests] = useState([]);
    const [tab, setTab] = useState('ALL');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchQuests = async () => {
            setLoading(true);
            const { data } = await supabase.from('quests').select('*').limit(30);
            if (data) setQuests(data);
            setLoading(false);
        };
        fetchQuests();
    }, []);

    const filteredQuests = tab === 'ALL' ? quests : quests.filter(q => q.quest_type.toUpperCase() === tab);

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="flex justify-between items-center mb-2">
                <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest">
                    ← Back to Sanctuary
                </button>
            </div>

            <div className="border border-stone-800 bg-[#050505] shadow-[0_0_50px_rgba(255,255,255,0.02)]">
                <div className="flex border-b border-stone-800 font-mono text-xs text-stone-500 tracking-widest uppercase">
                    {['ALL', 'MAIN', 'SIDE', 'DAILY', 'LEGENDARY'].map(t => (
                        <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 ${tab === t ? 'bg-stone-900 text-stone-200 border-b-2 border-stone-500' : 'bg-black hover:bg-neutral-900'}`}>
                            {t}
                        </button>
                    ))}
                </div>

                <div className="p-8 min-h-[400px]">
                    {loading ? (
                        <div className="text-stone-600 font-mono text-xs uppercase text-center py-10">Reading Tomes...</div>
                    ) : filteredQuests.length === 0 ? (
                         <div className="text-stone-600 font-mono text-xs uppercase text-center py-10">No contracts available in this category.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredQuests.map(q => (
                                <div key={q.id} className="border border-neutral-800 bg-black p-5 hover:border-neutral-700 transition-colors flex justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <h3 className="font-bold font-serif uppercase tracking-widest text-stone-300">{q.name}</h3>
                                            <span className={`text-[9px] px-2 py-[1px] font-mono tracking-widest uppercase border ${q.quest_type === 'legendary' ? 'border-yellow-600 text-yellow-500' : 'border-stone-800 text-stone-500'}`}>{q.quest_type}</span>
                                        </div>
                                        <p className="font-serif text-sm text-stone-500 mb-4">{q.description}</p>
                                        <div className="font-mono text-[10px] text-stone-600 uppercase tracking-widest flex items-center gap-4 border-t border-neutral-900 pt-3">
                                            <span>Rewards:</span>
                                            {q.rewards?.xp && <span className="text-blue-500">+{q.rewards.xp} XP</span>}
                                            {q.rewards?.gold && <span className="text-yellow-600">+{q.rewards.gold} Gold</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <button className="px-6 py-2 border border-stone-800 hover:border-stone-500 text-stone-400 font-mono text-xs uppercase tracking-widest transition-all hover:bg-stone-900">
                                            Accept
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
