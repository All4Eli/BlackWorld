'use client';
import { useState, useEffect } from 'react';

export default function QuestLog({ hero, updateHero, onBack }) {
    const [tab, setTab] = useState('DAILY');
    const [quests, setQuests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [acceptedQuests, setAcceptedQuests] = useState(hero?.accepted_quests || []);

    // Load quests — use hero.daily_quests for DAILY tab, fetch from DB for others
    useEffect(() => {
        const loadQuests = async () => {
            setLoading(true);
            if (tab === 'DAILY') {
                // Use daily quests from hero data
                setQuests(hero?.daily_quests || []);
                setLoading(false);
            } else {
                // Fetch from the quests API
                try {
                    const res = await fetch(`/api/social/search?q=quests&type=${tab.toLowerCase()}`);
                    // Fallback: show empty for non-daily tabs until DB quests exist
                    setQuests([]);
                } catch (err) {
                    setQuests([]);
                } finally {
                    setLoading(false);
                }
            }
        };
        loadQuests();
    }, [tab, hero?.daily_quests]);

    const handleAcceptQuest = async (quest) => {
        if (acceptedQuests.find(q => q.id === quest.id)) return; // Already accepted
        
        try {
            const res = await fetch('/api/quests/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quest })
            });
            const data = await res.json();
            if (res.ok) {
                setAcceptedQuests(data.updatedHero.accepted_quests || []);
                updateHero(data.updatedHero);
            }
        } catch(err) {
            console.error('Failed to accept quest', err);
        }
    };

    const isAccepted = (questId) => acceptedQuests.some(q => q.id === questId);

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="flex justify-between items-center mb-2">
                <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest">
                    ← Back to Sanctuary
                </button>
            </div>

            <div className="border border-stone-800 bg-[#050505] shadow-[0_0_50px_rgba(255,255,255,0.02)]">
                <div className="flex border-b border-stone-800 font-mono text-xs text-stone-500 tracking-widest uppercase">
                    {['DAILY', 'ALL'].map(t => (
                        <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 transition-colors ${tab === t ? 'bg-stone-900 text-stone-200 border-b-2 border-stone-500' : 'bg-black hover:bg-neutral-900'}`}>
                            {t}
                        </button>
                    ))}
                </div>

                <div className="p-8 min-h-[400px]">
                    {loading ? (
                        <div className="text-stone-600 font-mono text-xs uppercase text-center py-10">Loading contracts...</div>
                    ) : quests.length === 0 ? (
                         <div className="text-stone-600 font-mono text-xs uppercase text-center py-10">No contracts available in this category.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {quests.map(q => {
                                const accepted = isAccepted(q.id);
                                const completed = q.progress >= q.target;
                                return (
                                    <div key={q.id} className={`border bg-black p-5 transition-colors flex justify-between ${completed ? 'border-green-900/50' : accepted ? 'border-yellow-900/50' : 'border-neutral-800 hover:border-neutral-700'}`}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-lg">{q.icon || '⚔️'}</span>
                                                <h3 className="font-bold font-serif uppercase tracking-widest text-stone-300">{q.title || q.name}</h3>
                                                {completed && <span className="text-[9px] px-2 py-[1px] font-mono tracking-widest uppercase border border-green-800 text-green-500 bg-green-950/20">Complete</span>}
                                                {accepted && !completed && <span className="text-[9px] px-2 py-[1px] font-mono tracking-widest uppercase border border-yellow-800 text-yellow-500">Active</span>}
                                            </div>
                                            <p className="font-serif text-sm text-stone-500 mb-4">{q.description}</p>
                                            
                                            {/* Progress bar */}
                                            {accepted && (
                                                <div className="mb-3">
                                                    <div className="flex justify-between text-[10px] font-mono text-stone-600 mb-1">
                                                        <span>Progress</span>
                                                        <span>{q.progress || 0} / {q.target}</span>
                                                    </div>
                                                    <div className="h-1 bg-neutral-900 w-full">
                                                        <div className={`h-full transition-all duration-500 ${completed ? 'bg-green-600' : 'bg-yellow-700'}`} style={{ width: `${Math.min(100, ((q.progress || 0) / q.target) * 100)}%` }} />
                                                    </div>
                                                </div>
                                            )}
                                            
                                            <div className="font-mono text-[10px] text-stone-600 uppercase tracking-widest flex items-center gap-4 border-t border-neutral-900 pt-3">
                                                <span>Rewards:</span>
                                                {q.reward?.xp && <span className="text-blue-500">+{q.reward.xp} XP</span>}
                                                {q.reward?.gold && <span className="text-yellow-600">+{q.reward.gold} Gold</span>}
                                                {q.reward?.flasks && <span className="text-red-500">+{q.reward.flasks} Flasks</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col justify-center ml-4">
                                            {completed ? (
                                                <button 
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch('/api/quests/claim', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ questId: q.id })
                                                            });
                                                            const data = await res.json();
                                                            if (!res.ok) throw new Error(data.error);

                                                            // Overwrite UI with verified backend representation
                                                            setAcceptedQuests(data.updatedHero.accepted_quests || []);
                                                            updateHero(data.updatedHero);
                                                        } catch(err) {
                                                            alert(`Claim Failed: ${err.message}`);
                                                        }
                                                    }}
                                                    className="px-6 py-2 border border-green-800 hover:border-green-500 text-green-500 font-mono text-xs uppercase tracking-widest transition-all hover:bg-green-950/30"
                                                >
                                                    Claim
                                                </button>
                                            ) : accepted ? (
                                                <div className="px-6 py-2 border border-neutral-800 text-stone-600 font-mono text-xs uppercase tracking-widest">
                                                    Tracking
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleAcceptQuest(q)}
                                                    className="px-6 py-2 border border-stone-800 hover:border-stone-500 text-stone-400 font-mono text-xs uppercase tracking-widest transition-all hover:bg-stone-900"
                                                >
                                                    Accept
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
