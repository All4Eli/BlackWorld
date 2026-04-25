'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import { validateAndConsume } from '@/lib/resources';

const RANK_COLORS = {
  Bronze: 'text-amber-700', Silver: 'text-stone-400', Gold: 'text-yellow-500',
  Platinum: 'text-cyan-400', Diamond: 'text-purple-400', Champion: 'text-red-500',
  Sovereign: 'text-white',
};

function SeasonRankings() {
  const [season, setSeason] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pvp/season')
      .then(r => r.json())
      .then(data => {
        setSeason(data.season);
        setRankings(data.rankings || []);
        setMyStats(data.myStats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-stone-600 font-mono text-xs text-center py-10 uppercase tracking-widest animate-pulse">Loading season data...</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* Season Banner */}
      {season && (
        <div className="bg-red-950/20 border border-red-900/30 p-4 flex justify-between items-center rounded">
          <div>
            <div className="text-red-500 font-serif text-lg uppercase tracking-widest">{season.name}</div>
            <div className="text-stone-600 text-[10px] font-mono uppercase tracking-widest mt-1">
              Season {season.season_number} • {season.daysRemaining} days remaining
            </div>
          </div>
          {myStats && (
            <div className="text-right">
              <div className={`font-bold text-lg ${RANK_COLORS[myStats.rank_tier] || 'text-stone-400'}`}>{myStats.rank_tier}</div>
              <div className="text-stone-500 text-[10px] font-mono">{myStats.elo} ELO • {myStats.wins}W / {myStats.losses}L</div>
            </div>
          )}
        </div>
      )}

      {/* Rankings */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-12 gap-4 pb-2 border-b border-neutral-800 text-[10px] text-stone-600 font-mono uppercase tracking-widest">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Player</div>
          <div className="col-span-2 text-center">Rank</div>
          <div className="col-span-2 text-center">Record</div>
          <div className="col-span-3 text-right">ELO</div>
        </div>
        {rankings.length === 0 ? (
          <div className="text-center text-stone-600 font-mono text-xs py-8 italic">No combatants this season.</div>
        ) : (
          rankings.map((r, i) => (
            <div key={r.player_id} className={`grid grid-cols-12 gap-4 py-3 px-2 font-mono items-center text-sm transition-colors ${
              i === 0 ? 'bg-red-950/20 border border-red-900/30' : 'bg-[#020202] border border-neutral-900 hover:border-neutral-700'
            }`}>
              <div className="col-span-1 text-stone-500 font-bold">{i + 1}</div>
              <div className="col-span-4">
                <span className={`font-bold uppercase tracking-wider ${i === 0 ? 'text-red-400' : 'text-stone-300'}`}>{r.username}</span>
                <span className="text-stone-600 text-[10px] ml-2">Lv.{r.level}</span>
              </div>
              <div className={`col-span-2 text-center text-xs font-bold ${RANK_COLORS[r.rank_tier] || 'text-stone-400'}`}>
                {r.rank_tier}
              </div>
              <div className="col-span-2 text-center text-stone-500 text-xs">
                <span className="text-green-500">{r.wins}</span>-<span className="text-red-500">{r.losses}</span>
              </div>
              <div className="col-span-3 text-right">
                <span className={`text-lg font-black ${i === 0 ? 'text-red-500' : 'text-stone-300'}`}>{r.elo}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// CONTEXT MIGRATED: hero/updateHero now from usePlayer(), onBack stays as prop.
export default function ArenaHub({ onBack }) {
    const { hero, updateHero } = usePlayer();
    const [tab, setTab] = useState('CHALLENGE');
    const [players, setPlayers] = useState([]);
    const [pvpStats, setPvpStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const [wager, setWager] = useState(0);

    const togglePvpFlag = async () => {
        const newFlag = !hero.pvp_flag;
        try {
            const res = await fetch('/api/pvp/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flag: newFlag })
            });
            const data = await res.json();
            if (res.ok) {
                updateHero(data.updatedHero);
            }
        } catch (err) {
            console.error("Failed to toggle PVP flag:", err);
        }
    };

    useEffect(() => {
        const fetchArenaData = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/pvp/stats');
                if (res.ok) {
                    const data = await res.json();
                    setPvpStats(data.stats);
                    setPlayers(data.players);
                }
            } catch (err) {
                console.error("Failed to load Arena data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchArenaData();
    }, [hero.pvp_flag]);

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
                                            <div className="text-xs text-stone-600 font-mono mt-1">Level {p.level} • {p.pvp_stats?.rank_tier || 'Unranked'} ({p.pvp_stats?.elo_rating || 1000} ELO)</div>
                                            <div className="text-[9px] text-red-900 uppercase tracking-widest mt-2">{p.pvp_flag ? 'PVP Flagged' : 'Protected'}</div>
                                        </div>
                                        <button 
                                            onClick={async () => {
                                                const check = validateAndConsume(hero, hero?.player_resources, 10, 'essence');
                                                if (!check.success) return alert(`Not enough Essence. Short ${check.deficit}.`);
                                                
                                                try {
                                                    const res = await fetch('/api/pvp/challenge', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ targetPlayerId: p.id })
                                                    });
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data.error);

                                                    updateHero(data.updatedHero);
                                                    
                                                    const logStr = data.combatLogs.join('\n');
                                                    alert(data.win 
                                                        ? `VICTORY!\n\n${logStr}\n\nYou won ${data.goldGained}g and ${data.xpGained} XP!`
                                                        : `DEFEAT!\n\n${logStr}\n\nYou were struck down.`);
                                                } catch(err) {
                                                    alert(`[ERROR] ${err.message}`);
                                                }
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
                                <div className="text-stone-500 text-[10px] uppercase tracking-widest mb-2">Win Streak</div>
                                <div className="text-2xl font-bold text-yellow-500">{pvpStats?.win_streak || 0}</div>
                            </div>
                            <div className="border border-neutral-800 p-6 bg-[#020202]">
                                <div className="text-stone-500 text-[10px] uppercase tracking-widest mb-2">Best Streak</div>
                                <div className="text-2xl font-bold text-red-800">{pvpStats?.best_streak || 0}</div>
                            </div>
                        </div>
                    )}

                    {tab === 'LEADERBOARD' && (
                        <SeasonRankings />
                    )}
                </div>
            </div>
        </div>
    );
}
