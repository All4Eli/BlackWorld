'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { calcPlayerStats } from '@/lib/combat';
import { validateAndConsume } from '@/lib/resources';

export default function ArenaHub({ hero, updateHero, onBack }) {
    const [tab, setTab] = useState('CHALLENGE');
    const [players, setPlayers] = useState([]);
    const [pvpStats, setPvpStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const [wager, setWager] = useState(0);

    const togglePvpFlag = async () => {
        const newFlag = !hero.pvp_flag;
        updateHero({ ...hero, pvp_flag: newFlag });
        await supabase.from('pvp_stats').upsert({
            player_id: hero.id, // Assuming hero has actual db id
            pvp_flag: newFlag
        });
    };

    useEffect(() => {
        const fetchArenaData = async () => {
            setLoading(true);
            const { data: stats } = await supabase.from('pvp_stats').select('*').eq('player_id', hero?.id).single();
            if (stats) setPvpStats(stats);
            
            const { data: allPlayers } = await supabase.from('players').select('id, username, level, pvp_flag, pvp_stats(elo_rating, rank_tier)').neq('id', hero?.id).limit(20);
            if (allPlayers) setPlayers(allPlayers);
            setLoading(false);
        };
        fetchArenaData();
    }, [hero]);

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="flex justify-between items-center mb-2">
                <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest">
                    ← Back to Sanctuary
                </button>
                <div className="flex items-center gap-4 font-mono text-xs text-stone-500 uppercase tracking-widest">
                   <div className="flex items-center gap-2">
                       <span>World PVP Flag:</span>
                       <button 
                         onClick={togglePvpFlag} 
                         className={`px-3 py-1 border ${hero.pvp_flag ? 'border-red-600 text-red-500 bg-red-950/30' : 'border-stone-700 text-stone-500'}`}
                       >
                           {hero.pvp_flag ? 'ENABLED' : 'DISABLED'}
                       </button>
                   </div>
                   Pouch: <span className="text-yellow-600 font-bold">{hero.gold?.toLocaleString()}g</span>
                </div>
            </div>

            <div className="border border-red-950/50 bg-[#050505] shadow-[0_0_50px_rgba(153,27,27,0.1)]">
                <div className="flex border-b border-red-900/30">
                    <button onClick={() => setTab('CHALLENGE')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg ${tab === 'CHALLENGE' ? 'bg-red-950/20 text-stone-200 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Challenge</button>
                    <button onClick={() => setTab('LEADERBOARD')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg ${tab === 'LEADERBOARD' ? 'bg-red-950/20 text-stone-200 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Rankings</button>
                    <button onClick={() => setTab('STATS')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg ${tab === 'STATS' ? 'bg-red-950/20 text-stone-200 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>My Record</button>
                </div>

                <div className="p-8 min-h-[400px]">
                    {tab === 'CHALLENGE' && (
                        <div className="flex flex-col gap-6">
                            <h3 className="font-serif text-red-700 font-bold text-xl uppercase tracking-widest text-center">Open Challenges</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {players.map(p => (
                                    <div key={p.id} className="border border-neutral-800 bg-[#020202] p-4 flex justify-between items-center group hover:border-red-900/50 transition-colors">
                                        <div>
                                            <div className="font-bold text-stone-300 uppercase tracking-widest font-mono text-sm">{p.username}</div>
                                            <div className="text-xs text-stone-600 font-mono mt-1">Level {p.level} • {p.pvp_stats?.[0]?.rank_tier || 'Unranked'} ({p.pvp_stats?.[0]?.elo_rating || 1000} ELO)</div>
                                            <div className="text-[9px] text-red-900 uppercase tracking-widest mt-2">{p.pvp_flag ? 'PVP Flagged' : 'Protected'}</div>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const check = validateAndConsume(hero, hero?.player_resources, 5, 'resolve');
                                                if (!check.success) return alert(`Not enough Resolve. Short ${check.deficit}.`);
                                                updateHero({
                                                    ...hero,
                                                    player_resources: { ...hero.player_resources, resolve_current: check.new_current }
                                                });
                                                alert("Duel starting (simulated)...");
                                            }}
                                            className="bg-black hover:bg-red-950/40 text-red-500 border border-red-900/40 py-2 px-4 font-mono text-xs uppercase tracking-widest transition-colors">
                                            Duel
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'STATS' && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-center">
                            <div className="border border-neutral-800 p-6 bg-[#020202]">
                                <div className="text-stone-500 text-[10px] uppercase tracking-widest mb-2">Arena Record</div>
                                <div className="text-2xl font-bold text-stone-200"><span className="text-emerald-500">{pvpStats?.arena_wins || 0}</span> - <span className="text-red-500">{pvpStats?.arena_losses || 0}</span></div>
                            </div>
                            <div className="border border-neutral-800 p-6 bg-[#020202]">
                                <div className="text-stone-500 text-[10px] uppercase tracking-widest mb-2">Current Rating</div>
                                <div className="text-2xl font-bold text-yellow-600">{pvpStats?.elo_rating || 1000}</div>
                                <div className="text-xs text-stone-600 mt-1">{pvpStats?.rank_tier || 'Unranked'}</div>
                            </div>
                            <div className="border border-neutral-800 p-6 bg-[#020202]">
                                <div className="text-stone-500 text-[10px] uppercase tracking-widest mb-2">Infamy Level</div>
                                <div className="text-2xl font-bold text-red-800">{pvpStats?.infamy || 0}</div>
                            </div>
                            <div className="border border-neutral-800 p-6 bg-[#020202]">
                                <div className="text-stone-500 text-[10px] uppercase tracking-widest mb-2">Gold Swept</div>
                                <div className="text-2xl font-bold text-yellow-500">{pvpStats?.total_gold_won || 0}g</div>
                            </div>
                        </div>
                    )}

                    {tab === 'LEADERBOARD' && (
                        <div className="flex flex-col gap-2">
                             <div className="text-center font-mono text-stone-600 py-10 uppercase tracking-widest text-xs">Ladder is recalibrating...</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
