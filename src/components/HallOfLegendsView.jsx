'use client';
// ═══════════════════════════════════════════════════════════════════
// HallOfLegendsView.jsx — Sovereign Election Hall
// ═══════════════════════════════════════════════════════════════════
//
// DATA FLOW:
//   1. On mount → GET /api/politics/sovereign (standings + sovereign)
//      + GET /api/politics/vote (ballot count + my votes)
//   2. Player selects a candidate and clicks "Cast Ballot"
//      → POST /api/politics/vote { candidateId }
//      → API consumes 1 Obsidian Ballot, records the vote
//   3. Standings refresh after each vote
//
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import SovereignDashboard from './SovereignDashboard';

export default function HallOfLegendsView({ onBack }) {
  const { hero } = usePlayer();

  const [election, setElection]       = useState(null);
  const [standings, setStandings]     = useState([]);
  const [sovereign, setSovereign]     = useState(null);
  const [isSovereign, setIsSovereign] = useState(false);
  const [multipliers, setMultipliers] = useState({});
  const [controls, setControls]       = useState({});

  const [ballotsOwned, setBallotsOwned] = useState(0);
  const [myVotes, setMyVotes]           = useState([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [searchResults, setSearchResults]     = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const [loading, setLoading]   = useState(true);
  const [voting, setVoting]     = useState(false);
  const [voteResult, setVoteResult] = useState(null);
  const [error, setError]       = useState('');
  const [showDashboard, setShowDashboard] = useState(false);


  // ── Fetch sovereign data ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [sovRes, voteRes] = await Promise.all([
        fetch('/api/politics/sovereign'),
        fetch('/api/politics/vote'),
      ]);
      const sovData  = await sovRes.json();
      const voteData = await voteRes.json();

      setElection(sovData.election);
      setStandings(sovData.standings || []);
      setSovereign(sovData.sovereign);
      setIsSovereign(sovData.isSovereign || false);
      setMultipliers(sovData.multipliers || {});
      setControls(sovData.controls || {});

      setBallotsOwned(voteData.ballotsOwned || 0);
      setMyVotes(voteData.myVotes || []);
    } catch (err) {
      console.error('[POLITICS FETCH]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);


  // ── Search for candidates ─────────────────────────────────────
  const handleSearch = async () => {
    if (!candidateSearch.trim()) return;
    try {
      const res = await fetch(`/api/social/search?q=${encodeURIComponent(candidateSearch)}`);
      const data = await res.json();
      setSearchResults(data.players || data.results || []);
    } catch {
      setSearchResults([]);
    }
  };


  // ── Cast vote ─────────────────────────────────────────────────
  const handleVote = async () => {
    if (!selectedCandidate || voting) return;
    setVoting(true);
    setError('');
    setVoteResult(null);

    try {
      const res = await fetch('/api/politics/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': `vote-${election?.id}-${selectedCandidate.clerk_user_id}-${Date.now()}`,
        },
        body: JSON.stringify({ candidateId: selectedCandidate.clerk_user_id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Vote failed.');
        return;
      }

      setVoteResult(data);
      setBallotsOwned(data.ballotsRemaining ?? (ballotsOwned - 1));
      setSelectedCandidate(null);
      setCandidateSearch('');
      setSearchResults([]);

      // Refresh standings
      await fetchData();
    } catch (err) {
      setError('Network error.');
    } finally {
      setVoting(false);
    }
  };


  // ── Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-stone-600 font-mono text-xs text-center py-20 uppercase tracking-widest animate-pulse">
        Entering the Hall of Legends...
      </div>
    );
  }

  // ── Sovereign Dashboard (shown if user IS the Sovereign) ──────
  if (showDashboard && isSovereign) {
    return (
      <SovereignDashboard
        multipliers={multipliers}
        controls={controls}
        onBack={() => { setShowDashboard(false); fetchData(); }}
      />
    );
  }


  // ── Time remaining calc ───────────────────────────────────────
  const timeRemaining = election?.end_date
    ? Math.max(0, Math.floor((new Date(election.end_date).getTime() - Date.now()) / 1000))
    : 0;
  const days  = Math.floor(timeRemaining / 86400);
  const hours = Math.floor((timeRemaining % 86400) / 3600);

  const totalVotes = standings.reduce((sum, s) => sum + s.voteCount, 0);


  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 pb-10">

      {/* ── Back button ─────────────────────────────────────────── */}
      <button onClick={onBack} id="btn-politics-back"
        className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
        {'<'} Back to City
      </button>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="border-2 border-amber-900/30 bg-[#050505] p-6 md:p-8 shadow-[0_0_60px_rgba(180,120,30,0.08)]">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-700 mb-1">
              Sovereign Political System
            </div>
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-[0.15em] font-serif text-stone-200">
              {election?.title || 'Hall of Legends'}
            </h2>
            <p className="text-stone-500 font-mono text-xs tracking-widest mt-1 max-w-md">
              {election?.description || 'No election is currently scheduled.'}
            </p>
          </div>

          {/* Election status badge */}
          <div className="flex flex-col items-end gap-3">
            {election && (
              <div className={`border px-4 py-2 font-mono text-xs text-center ${
                election.status === 'active'
                  ? 'border-green-800 bg-green-950/20 text-green-400'
                  : 'border-neutral-800 bg-[#020202] text-stone-500'
              }`}>
                <div className="text-[9px] uppercase tracking-widest mb-1">Status</div>
                <div className="font-bold uppercase">{election.status}</div>
              </div>
            )}
            {election?.status === 'active' && (
              <div className="border border-neutral-800 bg-[#020202] px-4 py-2 font-mono text-xs text-center">
                <div className="text-[9px] uppercase tracking-widest text-stone-600 mb-1">Time Remaining</div>
                <div className="text-stone-300 font-bold tabular-nums">{days}d {hours}h</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Current Sovereign ──────────────────────────────────── */}
        <div className="mt-6 pt-4 border-t border-amber-900/20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1">
                Reigning Sovereign
              </div>
              {sovereign ? (
                <div className="text-xl font-serif font-black uppercase tracking-wider text-amber-400">
                  {sovereign.name}
                </div>
              ) : (
                <div className="text-stone-600 font-mono text-sm italic">Throne is vacant</div>
              )}
            </div>
            {isSovereign && (
              <button
                id="btn-sovereign-dashboard"
                onClick={() => setShowDashboard(true)}
                className="px-6 py-3 border-2 border-amber-700/50 bg-amber-950/20 text-amber-400 hover:bg-amber-900/40 hover:text-amber-200 font-mono text-[11px] uppercase tracking-widest font-bold transition-colors"
              >
                {'>'} Sovereign Dashboard
              </button>
            )}
          </div>
        </div>
      </div>


      {/* ── Global Multipliers Display ──────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: 'global_xp_multiplier', label: 'XP Multi', suffix: 'x' },
          { key: 'global_gold_multiplier', label: 'Gold Multi', suffix: 'x' },
          { key: 'global_drop_rate_bonus', label: 'Drop Bonus', suffix: '%' },
          { key: 'auction_tax_modifier', label: 'Auction Tax', suffix: 'x' },
        ].map(({ key, label, suffix }) => (
          <div key={key} className="border border-neutral-800 bg-[#050505] p-3 text-center">
            <div className="text-[9px] font-mono uppercase tracking-widest text-stone-600 mb-1">{label}</div>
            <div className="text-lg font-mono font-bold text-stone-300 tabular-nums">
              {(multipliers[key] ?? (suffix === '%' ? 0 : 1)).toFixed(suffix === '%' ? 0 : 1)}{suffix}
            </div>
          </div>
        ))}
      </div>


      {/* ── Vote Standings ──────────────────────────────────────── */}
      <div className="border border-neutral-900 bg-[#050505] p-6">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-4 border-b border-neutral-800 pb-2">
          Election Standings — {totalVotes} Total Votes
        </h3>

        {standings.length === 0 ? (
          <div className="text-center text-stone-600 font-mono text-xs py-8">
            No votes have been cast yet. Be the first to crown a ruler.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {standings.map((s, i) => {
              const pct = totalVotes > 0 ? (s.voteCount / totalVotes) * 100 : 0;
              return (
                <div key={s.candidateId} className="flex items-center gap-4 p-3 border border-neutral-800 bg-[#020202]">
                  {/* Rank */}
                  <div className={`text-lg font-mono font-bold w-8 text-center ${
                    i === 0 ? 'text-amber-400' : i === 1 ? 'text-stone-400' : i === 2 ? 'text-orange-600' : 'text-stone-700'
                  }`}>
                    {String(i + 1).padStart(2, '0')}
                  </div>

                  {/* Name + bar */}
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold uppercase font-serif text-stone-300">
                        {s.candidateName}
                      </span>
                      <span className="font-mono text-xs text-stone-500 tabular-nums">
                        {s.voteCount} vote{s.voteCount !== 1 ? 's' : ''} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    {/* Vote share bar */}
                    <div className="h-1.5 bg-neutral-900 w-full border border-neutral-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-700 ${
                          i === 0 ? 'bg-amber-700' : 'bg-stone-700'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* ── Voting Section ──────────────────────────────────────── */}
      {election?.status === 'active' && (
        <div className="border border-red-900/30 bg-[#050505] p-6">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-4 border-b border-red-900/20 pb-2">
            Cast Your Ballot
          </h3>

          {/* Ballot count */}
          <div className="flex items-center gap-3 mb-4 border border-neutral-800 bg-[#020202] p-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600">
              Obsidian Ballots in Inventory
            </span>
            <span className="ml-auto font-mono text-lg font-bold text-amber-400 tabular-nums">
              {ballotsOwned}
            </span>
          </div>

          {ballotsOwned <= 0 ? (
            <div className="text-stone-600 font-mono text-xs text-center py-4 border border-neutral-800 bg-[#020202]">
              You have no Obsidian Ballots. Obtain them from gathering, monster drops, or the Auction House.
            </div>
          ) : (
            <>
              {/* Candidate search */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={candidateSearch}
                  onChange={e => setCandidateSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Search player name..."
                  className="flex-1 bg-[#020202] border border-neutral-800 text-stone-300 text-xs font-mono px-3 py-2 focus:border-amber-900/50 focus:outline-none placeholder:text-stone-700"
                />
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 border border-neutral-700 bg-neutral-900 text-stone-400 hover:text-stone-200 hover:border-neutral-500 font-mono text-[10px] uppercase tracking-widest transition-colors"
                >
                  Search
                </button>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="flex flex-col gap-1 mb-3 max-h-40 overflow-y-auto">
                  {searchResults.map(player => (
                    <button
                      key={player.clerk_user_id}
                      onClick={() => {
                        setSelectedCandidate(player);
                        setSearchResults([]);
                        setCandidateSearch(player.username);
                      }}
                      className={`text-left p-2 border text-xs font-mono transition-colors ${
                        selectedCandidate?.clerk_user_id === player.clerk_user_id
                          ? 'border-amber-800 bg-amber-950/20 text-amber-400'
                          : 'border-neutral-800 bg-[#020202] text-stone-400 hover:border-neutral-600 hover:text-stone-200'
                      }`}
                    >
                      <span className="font-bold uppercase">{player.username}</span>
                      <span className="text-stone-600 ml-2">Lv.{player.level || '?'}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* You can also vote for existing standings candidates */}
              {standings.length > 0 && !selectedCandidate && (
                <div className="mb-3">
                  <div className="text-[9px] font-mono text-stone-700 uppercase tracking-widest mb-2">
                    Or select from current candidates:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {standings.slice(0, 8).map(s => (
                      <button
                        key={s.candidateId}
                        onClick={() => setSelectedCandidate({ clerk_user_id: s.candidateId, username: s.candidateName })}
                        className="px-3 py-1.5 border border-neutral-800 bg-[#020202] text-stone-400 hover:border-amber-900/40 hover:text-amber-400 font-mono text-[10px] uppercase tracking-widest transition-colors"
                      >
                        {s.candidateName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected candidate + cast button */}
              {selectedCandidate && (
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex-1 border border-amber-900/30 bg-amber-950/10 p-3">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-stone-600 mb-1">
                      Voting For
                    </div>
                    <div className="text-amber-400 font-serif font-bold uppercase tracking-wider">
                      {selectedCandidate.username}
                    </div>
                  </div>
                  <button
                    id="btn-cast-vote"
                    onClick={handleVote}
                    disabled={voting}
                    className="px-6 py-3 border-2 border-red-800 bg-red-950/30 text-red-400 hover:bg-red-900 hover:text-stone-200 font-mono text-[11px] uppercase tracking-widest font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {voting ? 'Casting...' : 'Cast Ballot'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* My votes this election */}
          {myVotes.length > 0 && (
            <div className="mt-4 pt-3 border-t border-neutral-800">
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-600 mb-2">
                Your Votes This Cycle
              </div>
              <div className="flex flex-wrap gap-2">
                {myVotes.map(v => (
                  <div key={v.candidate_id} className="border border-neutral-800 bg-[#020202] px-3 py-1.5 font-mono text-xs">
                    <span className="text-stone-400">{v.candidate_name}</span>
                    <span className="text-amber-500 ml-2 font-bold">x{v.vote_count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/* ── Error / Result ──────────────────────────────────────── */}
      {error && (
        <div className="border border-red-900/50 bg-red-950/20 text-red-500 text-xs font-mono p-3 text-center">
          {error}
        </div>
      )}
      {voteResult && (
        <div className="border border-green-900/30 bg-green-950/20 text-green-400 text-xs font-mono p-3 text-center animate-in fade-in duration-300">
          {'>'} Vote cast for <span className="font-bold">{voteResult.candidateName}</span>. Ballots remaining: <span className="font-bold tabular-nums">{voteResult.ballotsRemaining}</span>
        </div>
      )}
    </div>
  );
}
