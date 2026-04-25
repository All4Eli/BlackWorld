'use client';
// ═══════════════════════════════════════════════════════════════════
// QuestLog.jsx — Quest Tracker with Tab Separation
// ═══════════════════════════════════════════════════════════════════
//
// DATA FLOW:
//   1. On mount → GET /api/quests
//      → Returns { quests: { active, completed, available, daily, weekly } }
//
//   2. Tabs: ACTIVE | DAILY | STORY | BOUNTY | WEEKLY | COMPLETED
//      Each tab renders the appropriate quest array.
//
//   3. Progress is shown as monospace fractions: [ 3 / 5 ]
//      When progress >= target, status transitions to 'ready_to_turn_in'.
//
//   4. Player clicks "Claim Reward" on ready_to_turn_in quests:
//        POST /api/quests/claim { questKey: "story_first_blood" }
//        → Grants gold/XP rewards → updates hero state
//
//   5. Player can accept available quests:
//        POST /api/quests/accept { questKey: "..." }
//        → Creates player_quests row with status='active'
//
// QUEST TYPES:
//   - DAILY: Auto-generated from hero_stats.daily_quests (JSONB)
//   - STORY: DB-backed progression chain
//   - BOUNTY: Boss hunt contracts
//   - WEEKLY: Weekly challenges
//
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { usePlayer } from '@/context/PlayerContext';

// ── Tab definitions ─────────────────────────────────────────────
const TABS = ['ACTIVE', 'DAILY', 'STORY', 'BOUNTY', 'WEEKLY', 'COMPLETED'];

// ── Quest type badge colors ─────────────────────────────────────
const TYPE_COLORS = {
  STORY:   'border-purple-800 text-purple-400 bg-purple-950/20',
  BOUNTY:  'border-red-800 text-red-400 bg-red-950/20',
  DAILY:   'border-green-800 text-green-400 bg-green-950/20',
  WEEKLY:  'border-blue-800 text-blue-400 bg-blue-950/20',
};

// ── Status badge styles ─────────────────────────────────────────
const STATUS_STYLES = {
  active:            'border-yellow-800 text-yellow-500',
  completed:         'border-green-700 text-green-400 bg-green-950/20',
  claimed:           'border-neutral-700 text-stone-600',
  abandoned:         'border-neutral-800 text-stone-700',
};


export default function QuestLog({ onBack }) {
  const { hero, updateHero } = usePlayer();

  const [tab, setTab]             = useState('ACTIVE');
  const [questData, setQuestData] = useState({
    active: [], completed: [], available: [], daily: [], weekly: []
  });
  const [loading, setLoading]     = useState(true);
  const [claiming, setClaiming]   = useState(null);
  const [accepting, setAccepting] = useState(null);
  const [error, setError]         = useState('');
  const [successMsg, setSuccessMsg] = useState('');


  // ── Fetch all quest data ──────────────────────────────────────
  const fetchQuests = useCallback(async () => {
    try {
      const res = await fetch('/api/quests');
      if (!res.ok) return;
      const data = await res.json();
      setQuestData(data.quests || {});
    } catch (err) {
      console.error('[QUEST FETCH]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQuests(); }, [fetchQuests]);


  // ── Accept a quest ────────────────────────────────────────────
  const handleAccept = async (quest) => {
    setAccepting(quest.id || quest.key);
    setError('');
    setSuccessMsg('');

    try {
      const body = quest.id?.match?.(/^q\d+_/) 
        ? { quest }     // Daily quest (local object)
        : { questKey: quest.key };  // DB quest

      const res = await fetch('/api/quests/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || data.error || 'Accept failed.');
        return;
      }

      if (data.updatedHero) updateHero(data.updatedHero);
      setSuccessMsg(`Accepted: ${quest.title}`);
      await fetchQuests();
    } catch (err) {
      setError('Network error.');
    } finally {
      setAccepting(null);
    }
  };


  // ── Claim a quest reward ──────────────────────────────────────
  const handleClaim = async (quest) => {
    const claimId = quest.id || quest.key;
    setClaiming(claimId);
    setError('');
    setSuccessMsg('');

    try {
      const body = quest.id?.match?.(/^q\d+_/)
        ? { questId: quest.id }        // Daily quest
        : { questKey: quest.key };      // DB quest

      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || data.error || 'Claim failed.');
        return;
      }

      if (data.updatedHero) updateHero(data.updatedHero);

      setSuccessMsg(
        `Claimed: +${data.reward?.gold || 0} Gold, +${data.reward?.xp || 0} XP`
      );
      await fetchQuests();
    } catch (err) {
      setError('Network error.');
    } finally {
      setClaiming(null);
    }
  };


  // ── Build the quest list for the current tab ──────────────────
  const getQuestsForTab = () => {
    // Merge daily quests from hero state + DB quests
    const dailyFromHero = (hero?.daily_quests || []).map(q => ({ ...q, _source: 'daily' }));
    const allActive = questData.active || [];

    switch (tab) {
      case 'ACTIVE':
        return [...allActive, ...dailyFromHero.filter(q => q.accepted && !q.claimed)];
      case 'DAILY':
        return dailyFromHero;
      case 'STORY':
        return [
          ...allActive.filter(q => q.type === 'STORY'),
          ...(questData.available || []).filter(q => q.type === 'STORY'),
        ];
      case 'BOUNTY':
        return [
          ...allActive.filter(q => q.type === 'BOUNTY'),
          ...(questData.available || []).filter(q => q.type === 'BOUNTY'),
        ];
      case 'WEEKLY':
        return [
          ...(questData.weekly || []),
          ...allActive.filter(q => q.type === 'WEEKLY'),
        ];
      case 'COMPLETED':
        return [
          ...(questData.completed || []),
          ...dailyFromHero.filter(q => q.claimed),
        ];
      default:
        return [];
    }
  };

  const visibleQuests = getQuestsForTab();


  // ────────────────────────────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">

      {/* Back button */}
      <button onClick={onBack} id="btn-quest-back"
        className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
        {'<'} Back to Sanctuary
      </button>

      {/* Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200">
          Quest Log
        </h2>
        <p className="text-stone-500 text-xs font-mono uppercase tracking-widest mt-1">
          Contracts, bounties, and sagas of the damned
        </p>
      </div>

      {/* Result / Error Toasts */}
      {successMsg && (
        <div className="border border-green-900/30 bg-green-950/20 text-green-400 text-xs font-mono p-3 animate-in fade-in duration-300">
          {'>'} {successMsg}
        </div>
      )}
      {error && (
        <div className="border border-red-900/50 bg-red-950/20 text-red-500 text-xs font-mono p-3">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="border border-neutral-800 bg-[#050505]">
        <div className="flex border-b border-neutral-800 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccessMsg(''); }}
              className={`flex-shrink-0 px-4 py-3 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                tab === t
                  ? 'bg-[#0a0a0a] text-stone-200 border-b-2 border-red-800'
                  : 'bg-[#030303] text-stone-600 hover:text-stone-400 hover:bg-neutral-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Quest list */}
        <div className="p-6 min-h-[350px]">
          {loading ? (
            <div className="text-stone-600 font-mono text-xs uppercase text-center py-12 tracking-widest animate-pulse">
              Loading contracts...
            </div>
          ) : visibleQuests.length === 0 ? (
            <div className="text-stone-600 font-mono text-xs uppercase text-center py-12 tracking-widest border border-neutral-800 bg-[#020202]">
              No contracts in this category.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleQuests.map((q, idx) => {
                const key = q.id || q.key || `quest-${idx}`;
                const progress = q.progress || 0;
                const target = q.objective_target || q.target || 1;
                const title = q.title || q.name || 'Unknown Quest';
                const type = q.type || q._source?.toUpperCase() || 'QUEST';

                // Determine quest state
                // STATUS MAPPING:
                //   'active'    → in progress, tracking kills/etc.
                //   'completed' → progress >= target, ready to claim rewards
                //   'claimed'   → rewards have been collected
                //   'abandoned' → player gave up
                //
                // For daily quests (JSONB), use q.accepted/q.claimed booleans.
                const isActive = q.status === 'active' || (q.accepted && !q.claimed && progress < target);
                const isReady = q.status === 'completed' || (q.accepted && !q.claimed && progress >= target);
                const isClaimed = q.claimed || q.claimed_at || q.status === 'claimed';
                const isAvailable = !q.accepted && !isActive && !isReady && !isClaimed && q.status !== 'active';

                const pctDone = Math.min(100, (progress / target) * 100);

                return (
                  <div
                    key={key}
                    className={`border p-4 transition-colors ${
                      isClaimed ? 'border-neutral-900 bg-[#020202] opacity-50' :
                      isReady   ? 'border-green-900/40 bg-green-950/5' :
                      isActive  ? 'border-neutral-800 bg-[#050505]' :
                                  'border-neutral-800 bg-[#030303]'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      {/* Left: Quest info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="text-sm font-bold font-serif uppercase tracking-wider text-stone-300">
                            {title}
                          </h3>
                          {/* Type badge */}
                          <span className={`text-[8px] px-2 py-0.5 font-mono uppercase tracking-widest border ${TYPE_COLORS[type] || 'border-neutral-700 text-stone-500'}`}>
                            {type}
                          </span>
                          {/* Status badge */}
                          {isReady && (
                            <span className="text-[8px] px-2 py-0.5 font-mono uppercase tracking-widest border border-green-700 text-green-400 bg-green-950/20">
                              Complete
                            </span>
                          )}
                          {isClaimed && (
                            <span className="text-[8px] px-2 py-0.5 font-mono uppercase tracking-widest border border-neutral-700 text-stone-600">
                              Claimed
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {(q.description || q.objective_type) && (
                          <p className="text-xs font-mono text-stone-600 mb-3">
                            {q.description || `Objective: ${q.objective_type}`}
                          </p>
                        )}

                        {/* Progress bar + fraction */}
                        {(isActive || isReady) && (
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] font-mono text-stone-600 mb-1 uppercase tracking-widest">
                              <span>Progress</span>
                              {/* ── Monospace fraction display ──────────────
                                  Uses tabular-nums for fixed-width digits
                                  so [ 3 / 5 ] and [ 10 / 50 ] align properly.
                              */}
                              <span className="text-stone-400 tabular-nums tracking-wider">
                                {'['} {String(progress).padStart(2, '\u2007')} / {String(target).padStart(2, '\u2007')} {']'}
                              </span>
                            </div>
                            <div className="h-1.5 bg-neutral-900 w-full border border-neutral-800 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${isReady ? 'bg-green-600' : 'bg-amber-700'}`}
                                style={{ width: `${pctDone}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Rewards */}
                        <div className="flex gap-4 text-[10px] font-mono text-stone-600 uppercase tracking-widest">
                          <span>Rewards:</span>
                          {(q.reward_xp || q.reward?.xp) && (
                            <span className="text-blue-500">+{q.reward_xp || q.reward?.xp} XP</span>
                          )}
                          {(q.reward_gold || q.reward?.gold) && (
                            <span className="text-yellow-600">+{q.reward_gold || q.reward?.gold} Gold</span>
                          )}
                          {q.reward?.flasks && (
                            <span className="text-red-500">+{q.reward.flasks} Flasks</span>
                          )}
                        </div>

                        {/* Level requirement */}
                        {q.level_required > 1 && (
                          <div className="text-[9px] font-mono text-stone-700 mt-1 uppercase tracking-widest">
                            Requires Level {q.level_required}
                          </div>
                        )}
                      </div>

                      {/* Right: Action button */}
                      <div className="flex items-center">
                        {isReady && !isClaimed ? (
                          <button
                            id={`btn-claim-${key}`}
                            onClick={() => handleClaim(q)}
                            disabled={claiming === (q.id || q.key)}
                            className="px-5 py-2.5 border-2 border-green-800 bg-green-950/20 text-green-400 hover:bg-green-900/40 hover:text-green-200 font-mono text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-30"
                          >
                            {claiming === (q.id || q.key) ? '...' : 'Claim Reward'}
                          </button>
                        ) : isAvailable ? (
                          <button
                            id={`btn-accept-${key}`}
                            onClick={() => handleAccept(q)}
                            disabled={accepting === (q.id || q.key)}
                            className="px-5 py-2.5 border border-amber-800 bg-amber-950/20 text-amber-400 hover:bg-amber-900/40 font-mono text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-30"
                          >
                            {accepting === (q.id || q.key) ? '...' : 'Accept'}
                          </button>
                        ) : isActive ? (
                          <div className="px-5 py-2.5 border border-neutral-800 text-stone-600 font-mono text-[10px] uppercase tracking-widest">
                            Tracking
                          </div>
                        ) : (
                          <div className="px-5 py-2.5 border border-neutral-900 text-stone-700 font-mono text-[10px] uppercase tracking-widest">
                            Done
                          </div>
                        )}
                      </div>
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
