'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

export default function CrimesView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [crimes, setCrimes] = useState([]);
  const [nerve, setNerve] = useState(hero?.nerve ?? 10);
  const [maxNerve, setMaxNerve] = useState(hero?.max_nerve ?? 10);
  const [jailStatus, setJailStatus] = useState({ in_jail: false, jail_until: null, jail_reason: null, remaining_seconds: 0 });
  const [loading, setLoading] = useState(true);
  const [committingId, setCommittingId] = useState(null);
  const [actionResult, setActionResult] = useState(null);

  const fetchCrimesData = async () => {
    try {
      const res = await fetch('/api/crimes');
      const data = await res.json();
      if (res.ok) {
        setCrimes(data.crimes || []);
        if (data.nerve !== undefined) setNerve(data.nerve);
        if (data.max_nerve !== undefined) setMaxNerve(data.max_nerve);
        if (data.jail_status) setJailStatus(data.jail_status);
      }
    } catch (err) {
      console.error('Failed to fetch crimes data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrimesData();
  }, []);

  // Real-time jail countdown timer
  useEffect(() => {
    if (!jailStatus.in_jail || jailStatus.remaining_seconds <= 0) return;

    const timer = setInterval(() => {
      setJailStatus(prev => {
        if (prev.remaining_seconds <= 1) {
          clearInterval(timer);
          fetchCrimesData();
          return { in_jail: false, jail_until: null, jail_reason: null, remaining_seconds: 0 };
        }
        return { ...prev, remaining_seconds: prev.remaining_seconds - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [jailStatus.in_jail, jailStatus.remaining_seconds]);

  const handleCommitCrime = async (crime) => {
    if (jailStatus.in_jail || nerve < crime.nerve_cost || committingId) return;

    setCommittingId(crime.id);
    setActionResult(null);

    try {
      const res = await fetch('/api/crimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crimeId: crime.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.code === 'IN_DUNGEON') {
          setJailStatus({
            in_jail: true,
            jail_until: data.jail_until,
            jail_reason: data.jail_reason,
            remaining_seconds: data.remaining_seconds || 60,
          });
          setActionResult({
            success: false,
            message: data.error || 'You have been thrown into the Dungeon!',
          });
        } else {
          setActionResult({
            success: false,
            message: data.error || 'Failed to commit crime.',
          });
        }
        return;
      }

      if (data.success) {
        setNerve(data.nerve_remaining);
        setActionResult({
          success: true,
          message: `Crime Succeeded! Gained +${data.gold_gained} Gold and +${data.xp_gained} XP.`,
          gold_gained: data.gold_gained,
          xp_gained: data.xp_gained,
        });

        // Update player context
        if (updateHero) {
          updateHero({
            nerve: data.nerve_remaining,
            gold: (hero?.gold || 0) + data.gold_gained,
            xp: (hero?.xp || 0) + data.xp_gained,
          });
        }
      } else {
        // Crime failed and user sent to dungeon
        setJailStatus({
          in_jail: true,
          jail_until: data.jail_until,
          jail_reason: crime.name,
          remaining_seconds: data.jail_seconds || 60,
        });
        setActionResult({
          success: false,
          message: data.message || `Crime failed! You were caught and thrown into the Dungeon for ${data.jail_seconds}s.`,
        });

        if (updateHero) {
          updateHero({
            in_jail: true,
            jail_until: data.jail_until,
            jail_reason: crime.name,
          });
        }
      }
    } catch (err) {
      setActionResult({
        success: false,
        message: 'Connection failed while committing crime.',
      });
    } finally {
      setCommittingId(null);
    }
  };

  const formatCountdown = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const fallbackCrimes = [
    { id: 'c1', name: 'Shoplifting', nerve_cost: 2, success_rate: 0.85, gold_reward_min: 50, gold_reward_max: 150, xp_reward: 10, min_level: 1, description: 'Steal small goods from unattended market stalls.' },
    { id: 'c2', name: 'Pickpocketing', nerve_cost: 3, success_rate: 0.75, gold_reward_min: 120, gold_reward_max: 300, xp_reward: 20, min_level: 1, description: 'Lift purses and gold pouches from wealthy nobles.' },
    { id: 'c3', name: 'Armed Robbery', nerve_cost: 5, success_rate: 0.60, gold_reward_min: 400, gold_reward_max: 900, xp_reward: 45, min_level: 2, description: 'Hold up dark merchants at blade-point.' },
    { id: 'c4', name: 'Bank Heist', nerve_cost: 8, success_rate: 0.45, gold_reward_min: 1200, gold_reward_max: 3000, xp_reward: 90, min_level: 3, description: 'Infiltrate the Blood Vaults for massive riches.' },
    { id: 'c5', name: 'Cyber Warfare', nerve_cost: 12, success_rate: 0.30, gold_reward_min: 4000, gold_reward_max: 10000, xp_reward: 200, min_level: 5, description: 'Hack high-tier merchant ledgers for legendary payouts.' },
  ];

  const crimeList = crimes.length > 0 ? crimes : fallbackCrimes;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      {onBack && (
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
          ← Back to City Directory
        </button>
      )}

      <div className="border border-red-900/30 bg-[#050505] p-8 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        <h1 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-red-700 mb-2 drop-shadow-md">
          Crime Syndicate
        </h1>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center max-w-md mb-6">
          Risky maneuvers, illegal heists, and dark ops. Burn Nerve for quick Gold and XP—if you survive.
        </p>

        {/* DUNGEON ALERT BANNER */}
        {jailStatus.in_jail && (
          <div className="w-full mb-6 bg-red-950/80 border-2 border-red-600 p-6 flex flex-col items-center justify-center text-center animate-pulse shadow-[0_0_30px_rgba(220,38,38,0.4)]">
            <span className="text-xl font-serif font-black tracking-widest text-red-400 uppercase mb-1">
              🚨 IN THE DUNGEON (JAIL) 🚨
            </span>
            <p className="text-stone-300 font-mono text-xs mb-3">
              Reason: <span className="text-red-300 font-bold">{jailStatus.jail_reason || 'Captured by guards'}</span>
            </p>
            <div className="bg-black/80 px-4 py-2 border border-red-900 font-mono text-sm text-red-500 tracking-widest">
              RELEASE IN: <span className="text-2xl font-bold text-stone-100 ml-2">{formatCountdown(jailStatus.remaining_seconds)}</span>
            </div>
            <p className="text-[10px] font-mono text-stone-500 mt-2 uppercase tracking-wider">
              All criminal activities are blocked while locked in the Dungeon.
            </p>
          </div>
        )}

        {/* Nerve Resource Bar */}
        <div className="w-full max-w-lg bg-[#020202] border border-neutral-800 p-4 mb-8">
          <div className="flex justify-between items-center font-mono text-xs uppercase tracking-widest mb-2">
            <span className="text-stone-400 font-bold flex items-center gap-2">
              ⚡ Nerve Capacity
            </span>
            <span className="text-emerald-500 font-bold">
              {nerve} / {maxNerve}
            </span>
          </div>
          <div className="w-full h-3 bg-neutral-950 border border-neutral-800 rounded-xs overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, (nerve / maxNerve) * 100))}%` }}
            />
          </div>
          <p className="text-[9px] font-mono text-stone-600 text-right mt-1">
            Regenerates +1 Nerve every 5 minutes
          </p>
        </div>

        {/* Action Result Message */}
        {actionResult && (
          <div
            className={`w-full max-w-lg mb-6 p-4 border font-mono text-xs text-center transition-all ${
              actionResult.success
                ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                : 'bg-red-950/40 border-red-800 text-red-400'
            }`}
          >
            {actionResult.message}
          </div>
        )}

        {/* Crimes List */}
        <div className="w-full flex flex-col gap-4">
          <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-stone-500 border-b border-red-900/20 pb-2">
            Available Operations
          </h2>

          {loading ? (
            <div className="py-12 text-center font-mono text-xs text-stone-600 uppercase tracking-widest">
              Loading syndicate database...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {crimeList.map((crime) => {
                const isCommitting = committingId === crime.id;
                const successPct = Math.round((crime.success_rate || 0.5) * 100);
                const nerveCost = crime.nerve_cost || 1;
                const canCommit = !jailStatus.in_jail && nerve >= nerveCost && !committingId;

                return (
                  <div
                    key={crime.id}
                    className="border border-neutral-900 bg-black/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-red-900/40 transition-colors"
                  >
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-serif font-bold uppercase tracking-wider text-stone-200 text-base">
                          {crime.name}
                        </h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 border border-red-900/40 bg-red-950/30 text-red-400 uppercase tracking-widest">
                          Level {crime.min_level || 1}+
                        </span>
                      </div>
                      <p className="text-xs font-mono text-stone-500">{crime.description}</p>
                      
                      <div className="flex items-center gap-4 mt-2 font-mono text-[11px]">
                        <span className="text-stone-400">
                          Nerve Cost: <strong className="text-emerald-400">{nerveCost}</strong>
                        </span>
                        <span className="text-stone-400">
                          Est. Success: <strong className="text-stone-300">{successPct}%</strong>
                        </span>
                        <span className="text-stone-400">
                          Reward: <strong className="text-yellow-600">{crime.gold_reward_min || 0} - {crime.gold_reward_max || 0}g</strong>
                        </span>
                        <span className="text-stone-400">
                          XP: <strong className="text-cyan-400">+{crime.xp_reward || 0}</strong>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCommitCrime(crime)}
                      disabled={!canCommit}
                      title={
                        jailStatus.in_jail
                          ? 'Locked: You are in the Dungeon'
                          : nerve < nerveCost
                          ? 'Insufficient Nerve'
                          : 'Execute operation'
                      }
                      className="w-full md:w-auto px-6 py-3 border border-red-900/50 bg-red-950/20 text-red-400 hover:bg-red-900 hover:text-stone-100 font-mono text-xs uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      {isCommitting ? 'Executing...' : 'Commit Crime'}
                    </button>
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
