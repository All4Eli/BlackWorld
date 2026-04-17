'use client';
import { useState, useEffect } from 'react';

export default function LeaderboardHub({ onBack }) {
    const [tab, setTab] = useState('ANCIENTS');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ ancients: [], barons: [], champions: [] });

    useEffect(() => {
        const fetchRankings = async () => {
            try {
                const res = await fetch('/api/leaderboard');
                const json = await res.json();
                if (res.ok) setData(json);
            } catch (err) {
                console.error("Failed to load rankings:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchRankings();
    }, []);

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="flex justify-between items-center mb-2">
                <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest">
                    ← Back to City Directory
                </button>
            </div>

            <div className="border border-neutral-900 bg-[#050505] shadow-[0_4px_40px_rgba(0,0,0,0.8)]">
                {/* Header Tabs */}
                <div className="flex border-b border-neutral-800">
                    <button 
                        onClick={() => setTab('ANCIENTS')}
                        className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg transition-colors ${tab === 'ANCIENTS' ? 'bg-stone-900 text-stone-200 border-b-2 border-stone-400' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}
                    >
                        ☗ The Ancients
                    </button>
                    <button 
                        onClick={() => setTab('BARONS')}
                        className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg transition-colors ${tab === 'BARONS' ? 'bg-stone-900 text-yellow-500 border-b-2 border-yellow-600' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}
                    >
                        ¤ Wealth Barons
                    </button>
                    <button 
                        onClick={() => setTab('CHAMPIONS')}
                        className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg transition-colors ${tab === 'CHAMPIONS' ? 'bg-red-950/20 text-red-500 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}
                    >
                        ⚔ Blood Champions
                    </button>
                </div>

                <div className="p-8 min-h-[500px]">
                    {loading ? (
                        <div className="text-center font-mono text-stone-600 py-20 uppercase tracking-widest text-xs animate-pulse">
                            Querying the Hall of Legends...
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {/* ANCIENTS TAB */}
                            {tab === 'ANCIENTS' && (
                                <>
                                    <h3 className="text-stone-400 font-mono text-xs uppercase tracking-widest mb-4 border-b border-neutral-800 pb-2 text-center">Highest Level Players Across All Regimes</h3>
                                    {data.ancients.map((player, idx) => (
                                        <div key={player.clerk_user_id} className={`grid grid-cols-12 gap-4 py-3 px-4 font-mono items-center transition-colors ${idx === 0 ? 'bg-stone-900 border border-stone-700 shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'bg-[#020202] border border-neutral-900 hover:border-neutral-700'}`}>
                                            <div className="col-span-1 text-stone-500 font-bold">{idx + 1}</div>
                                            <div className={`col-span-8 font-bold uppercase tracking-widest ${idx === 0 ? 'text-stone-200' : 'text-stone-400'}`}>
                                                {player.username}
                                                {idx === 0 && <span className="ml-3 text-[9px] border border-stone-500 px-2 py-0.5 text-stone-300">Apex</span>}
                                            </div>
                                            <div className="col-span-3 text-right">
                                                <span className="text-[10px] text-stone-600 mr-2 uppercase">Level</span> 
                                                <span className="text-lg text-stone-300 font-black">{player.level}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {data.ancients.length === 0 && <div className="text-center text-stone-600 font-mono text-xs py-10 italic">No legends recorded.</div>}
                                </>
                            )}

                            {/* BARONS TAB */}
                            {tab === 'BARONS' && (
                                <>
                                    <h3 className="text-stone-400 font-mono text-xs uppercase tracking-widest mb-4 border-b border-neutral-800 pb-2 text-center">Most Banked Wealth Deposited in the Citadel</h3>
                                    {data.barons.map((player, idx) => (
                                        <div key={player.clerk_user_id} className={`grid grid-cols-12 gap-4 py-3 px-4 font-mono items-center transition-colors ${idx === 0 ? 'bg-yellow-950/20 border border-yellow-900/50 shadow-[0_0_15px_rgba(202,138,4,0.1)]' : 'bg-[#020202] border border-neutral-900 hover:border-neutral-700'}`}>
                                            <div className="col-span-1 text-stone-500 font-bold">{idx + 1}</div>
                                            <div className={`col-span-6 font-bold uppercase tracking-widest ${idx === 0 ? 'text-yellow-500' : 'text-stone-400'}`}>
                                                {player.username}
                                            </div>
                                            <div className="col-span-5 text-right font-black text-yellow-600 text-lg">
                                                {player.bank_balance?.toLocaleString() || 0}g
                                            </div>
                                        </div>
                                    ))}
                                    {data.barons.length === 0 && <div className="text-center text-stone-600 font-mono text-xs py-10 italic">No wealth recorded.</div>}
                                </>
                            )}

                            {/* CHAMPIONS TAB */}
                            {tab === 'CHAMPIONS' && (
                                <>
                                    <h3 className="text-stone-400 font-mono text-xs uppercase tracking-widest mb-4 border-b border-neutral-800 pb-2 text-center">Highest ELO Rated Arena Fighters</h3>
                                    {data.champions.map((stat, idx) => (
                                        <div key={stat.player_id} className={`grid grid-cols-12 gap-4 py-3 px-4 font-mono items-center transition-colors ${idx === 0 ? 'bg-red-950/20 border border-red-900/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : 'bg-[#020202] border border-neutral-900 hover:border-neutral-700'}`}>
                                            <div className="col-span-1 text-stone-500 font-bold">{idx + 1}</div>
                                            <div className={`col-span-5 font-bold uppercase tracking-widest ${idx === 0 ? 'text-red-500' : 'text-stone-400'}`}>
                                                {stat.players?.username || 'Unknown'}
                                            </div>
                                            <div className="col-span-3 text-center text-[10px] text-stone-500 uppercase tracking-widest">
                                                Streak: <span className="text-red-400">{stat.win_streak || 0}</span>
                                            </div>
                                            <div className="col-span-3 text-right">
                                                <div className={`text-lg font-black ${idx === 0 ? 'text-red-600' : 'text-stone-300'}`}>{stat.elo_rating || 1000}</div>
                                                <div className="text-[9px] text-stone-600 uppercase tracking-widest">{stat.rank_tier || 'Unranked'}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {data.champions.length === 0 && <div className="text-center text-stone-600 font-mono text-xs py-10 italic">No blood spilled.</div>}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
