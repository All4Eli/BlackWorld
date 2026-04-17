'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AchievementPanel({ hero, updateHero }) {
    const [achievements, setAchievements] = useState([]);
    const [tab, setTab] = useState('achievements');
    const [loading, setLoading] = useState(true);
    const [justUnlocked, setJustUnlocked] = useState([]);

    useEffect(() => {
        const syncAchvs = async () => {
            setLoading(true);
            try {
                // Trigger backend evaluation logic
                const res = await fetch('/api/achievements/sync', { method: 'POST' });
                const json = await res.json();
                
                if (res.ok) {
                    if (json.newlyUnlocked && json.newlyUnlocked.length > 0) {
                        setJustUnlocked(json.newlyUnlocked);
                        if (json.updatedHero) updateHero(json.updatedHero);
                    }
                }
                
                // Fetch dictionary and player's specific unlocks
                const [{ data: dict }, { data: pAchvs }] = await Promise.all([
                    supabase.from('achievements').select('*'),
                    supabase.from('player_achievements').select('achievement_id, unlocked_at')
                ]);

                if (dict && pAchvs) {
                    const unlockedIds = pAchvs.map(p => p.achievement_id);
                    // Add hardcoded logical dictionary for our custom backend triggers if they aren't in DB yet
                    const fullDict = [
                        ...dict,
                        { id: 'lvl_5', name: 'Apprentice', description: 'Reach Level 5.', points: 10 },
                        { id: 'lvl_10', name: 'Adept', description: 'Reach Level 10.', points: 20 },
                        { id: 'lvl_25', name: 'Master', description: 'Reach Level 25.', points: 50 },
                        { id: 'gold_1k', name: 'Hoarder', description: 'Accumulate 1,000 Gold in the vault.', points: 10 },
                        { id: 'gold_10k', name: 'Baron', description: 'Accumulate 10,000 Gold in the vault.', points: 50 },
                        { id: 'kills_10', name: 'First Blood', description: 'Slay 10 enemies.', points: 10 },
                        { id: 'kills_100', name: 'Slayer', description: 'Slay 100 enemies.', points: 50 }
                    ];

                    // Merge uniqueness
                    const uniqueDict = Array.from(new Map(fullDict.map(item => [item.id, item])).values());
                    
                    const processed = uniqueDict.map(a => ({
                        ...a,
                        isUnlocked: unlockedIds.includes(a.id),
                        unlockedAt: pAchvs.find(p => p.achievement_id === a.id)?.unlocked_at
                    }));
                    setAchievements(processed);
                }
            } catch (err) {
                console.error("Failed to sync achievements", err);
            } finally {
                setLoading(false);
            }
        };
        syncAchvs();
    }, []);

    const totalPts = hero.achievement_points || 0;
    const progressCount = achievements.filter(a => a.isUnlocked).length;

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            {justUnlocked.length > 0 && (
                <div className="bg-yellow-950/40 border border-yellow-900 shadow-[0_0_20px_rgba(202,138,4,0.2)] p-4 text-center font-mono animate-pulse">
                    <span className="text-yellow-500 font-bold uppercase tracking-widest text-sm">Monument Established</span>
                    <div className="text-xs text-stone-400 mt-1">You have unlocked {justUnlocked.length} new achievements.</div>
                </div>
            )}
            
            <div className="border border-stone-800 bg-[#050505] shadow-[0_0_50px_rgba(255,255,255,0.02)]">
                <div className="flex border-b border-stone-800 font-mono text-xs text-stone-500 tracking-widest uppercase">
                    <button onClick={() => setTab('achievements')} className={`flex-1 py-4 ${tab === 'achievements' ? 'bg-stone-900 border-b-2 border-stone-400 text-stone-200' : 'bg-black hover:bg-neutral-900'}`}>Achievements</button>
                    <button onClick={() => setTab('titles')} className={`flex-1 py-4 ${tab === 'titles' ? 'bg-stone-900 border-b-2 border-stone-400 text-stone-200' : 'bg-black hover:bg-neutral-900'}`}>Titles</button>
                </div>

                <div className="p-8 min-h-[400px]">
                    {loading ? (
                        <div className="text-center font-mono text-stone-600 py-20 uppercase tracking-widest text-xs animate-pulse">Reading the stones...</div>
                    ) : tab === 'achievements' ? (
                        <div className="flex flex-col gap-8">
                            <div className="flex justify-between items-end border-b border-neutral-900 pb-4">
                                <div>
                                     <div className="text-stone-500 font-mono text-xs uppercase tracking-widest mb-1">Total Score</div>
                                     <div className="text-4xl font-black font-serif text-yellow-600">{totalPts} <span className="text-sm font-mono text-stone-600">PTS</span></div>
                                </div>
                                <div className="text-right">
                                    <div className="text-stone-500 text-xs font-mono uppercase">Completion</div>
                                    <div className="text-[10px] text-stone-600 font-mono mt-1">{progressCount} / {achievements.length} Unlocked</div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {achievements.map(a => (
                                    <div key={a.id} className={`border p-4 flex flex-col justify-between transition-colors ${a.isUnlocked ? 'border-yellow-900/30 bg-yellow-950/10 shadow-[0_0_15px_rgba(202,138,4,0.02)]' : 'border-neutral-900 bg-black opacity-60 grayscale'}`}>
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h3 className={`font-bold font-serif uppercase tracking-widest ${a.isUnlocked ? 'text-yellow-500' : 'text-stone-500'}`}>{a.name}</h3>
                                                <span className={`text-[9px] font-mono px-2 uppercase ${a.isUnlocked ? 'text-yellow-400 border border-yellow-900/50' : 'text-stone-600 border border-stone-800'}`}>{a.points} PTS</span>
                                            </div>
                                            <p className="text-stone-500 text-xs mt-2 font-mono h-8">{a.description}</p>
                                        </div>
                                        {a.isUnlocked && (
                                            <div className="text-[9px] font-mono text-stone-400 mt-4 border-t border-neutral-800/50 pt-2 text-right uppercase tracking-widest">
                                                Unlocked: {new Date(a.unlockedAt).toLocaleDateString()}
                                            </div>
                                        )}
                                        {!a.isUnlocked && (
                                            <div className="text-[9px] font-mono text-stone-600 mt-4 border-t border-neutral-900 pt-2 text-right uppercase tracking-widest">
                                                Locked
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
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
