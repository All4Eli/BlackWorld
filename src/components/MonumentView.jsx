'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePlayer } from '@/context/PlayerContext';

const RESOURCE_LABELS = {
  gold: 'Gold',
  essence: 'Essence',
  blood_stones: 'Blood Stones',
};

const RESOURCE_COLORS = {
  gold: { bar: 'bg-yellow-600', text: 'text-yellow-500', glow: 'shadow-[0_0_20px_rgba(202,138,4,0.3)]' },
  essence: { bar: 'bg-purple-600', text: 'text-purple-400', glow: 'shadow-[0_0_20px_rgba(147,51,234,0.3)]' },
  blood_stones: { bar: 'bg-red-600', text: 'text-red-400', glow: 'shadow-[0_0_20px_rgba(220,38,38,0.3)]' },
};

export default function MonumentView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [monuments, setMonuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [donating, setDonating] = useState(null);      // monumentId being donated to
  const [amounts, setAmounts] = useState({});           // { monumentId: inputValue }
  const [message, setMessage] = useState(null);
  const [claiming, setClaiming] = useState(null);

  const fetchMonuments = useCallback(async () => {
    try {
      const res = await fetch('/api/monuments');
      const data = await res.json();
      setMonuments(data.monuments || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMonuments(); }, [fetchMonuments]);

  const getPlayerResource = (type) => {
    if (type === 'gold') return hero?.gold || 0;
    if (type === 'essence') return hero?.essence || 0;
    if (type === 'blood_stones') return hero?.bloodStones || 0;
    return 0;
  };

  const handleDonate = async (monumentId) => {
    const val = parseInt(amounts[monumentId], 10);
    if (!val || val <= 0) return;

    setDonating(monumentId);
    setMessage(null);

    try {
      const res = await fetch('/api/monuments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monumentId, amount: val }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      // Update hero resources
      if (data.updatedHero) updateHero(data.updatedHero);

      // Update monument progress locally (instant UI feedback)
      setMonuments(prev => prev.map(m =>
        m.id === monumentId
          ? { ...m, progress: data.progress, percent: data.percent, status: data.justCompleted ? 'completed' : m.status }
          : m
      ));

      // Clear input
      setAmounts(prev => ({ ...prev, [monumentId]: '' }));

      if (data.justCompleted) {
        setMessage({ type: 'success', text: `🏛️ ${data.monumentName} completed! ${data.buffDesc}` });
      } else {
        setMessage({ type: 'success', text: `Donated ${data.donated.toLocaleString()} resources.` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setDonating(null);
    }
  };

  const handleClaimBuff = async (monumentId) => {
    setClaiming(monumentId);
    setMessage(null);

    try {
      const res = await fetch('/api/monuments/claim-buff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monumentId }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setMessage({ type: 'success', text: data.message });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500">
      <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left mb-2">
        ← Back to City Directory
      </button>

      {/* Header */}
      <div className="border border-red-900/20 bg-[#050505] p-8 text-center relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-red-900/10 rounded-full blur-[100px] pointer-events-none"></div>
        <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-red-700 mb-2 drop-shadow-[0_0_10px_rgba(153,27,27,0.5)]">
          The Monuments
        </h2>
        <p className="text-stone-500 font-mono text-xs tracking-widest max-w-lg mx-auto">
          Contribute resources to build server-wide structures. Completed monuments grant permanent combat buffs to all who contributed.
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 border text-sm font-mono ${
          message.type === 'success'
            ? 'bg-green-950/30 border-green-900/30 text-green-300'
            : 'bg-red-950/30 border-red-900/30 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Monument List */}
      {monuments.length === 0 ? (
        <div className="text-center text-stone-600 font-mono text-sm py-12">
          No active monuments. Check back later.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {monuments.map(mon => {
            const colors = RESOURCE_COLORS[mon.resourceType] || RESOURCE_COLORS.gold;
            const isComplete = mon.status === 'completed';
            const playerResource = getPlayerResource(mon.resourceType);
            const inputVal = amounts[mon.id] || '';

            return (
              <div
                key={mon.id}
                className={`border bg-[#0a0a0a] p-6 transition-all ${
                  isComplete
                    ? 'border-green-900/40 shadow-[0_0_30px_rgba(34,197,94,0.05)]'
                    : 'border-neutral-800 hover:border-red-900/30'
                }`}
              >
                {/* Monument Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-serif font-bold text-stone-200 uppercase tracking-wider">
                      {mon.name}
                    </h3>
                    <p className="text-stone-500 text-xs font-mono mt-1">{mon.description}</p>
                  </div>
                  {isComplete && (
                    <span className="text-[10px] px-2 py-1 bg-green-950/50 border border-green-900/30 text-green-400 font-mono uppercase tracking-widest">
                      Completed
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className={colors.text}>
                      {RESOURCE_LABELS[mon.resourceType]}
                    </span>
                    <span className="text-stone-400">
                      {mon.progress.toLocaleString()} / {mon.required.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-neutral-900 border border-neutral-800 overflow-hidden">
                    <div
                      className={`h-full ${colors.bar} transition-all duration-700 ease-out`}
                      style={{ width: `${mon.percent}%` }}
                    ></div>
                  </div>
                  <div className="text-right text-[10px] text-stone-600 font-mono mt-1">
                    {mon.percent}%
                  </div>
                </div>

                {/* Buff Preview */}
                {mon.buffDesc && (
                  <div className="flex items-center gap-2 text-xs font-mono mb-4 px-3 py-2 bg-neutral-900/50 border border-neutral-800">
                    <span className="text-stone-500">Reward:</span>
                    <span className={colors.text}>{mon.buffDesc}</span>
                  </div>
                )}

                {/* Donation / Claim Section */}
                {!isComplete ? (
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-mono text-stone-500">
                      Your {RESOURCE_LABELS[mon.resourceType]}:{' '}
                      <span className={colors.text}>{playerResource.toLocaleString()}</span>
                    </div>
                    <input
                      type="number"
                      value={inputVal}
                      onChange={(e) => setAmounts(prev => ({ ...prev, [mon.id]: e.target.value }))}
                      placeholder="Amount..."
                      min="1"
                      max={playerResource}
                      disabled={donating === mon.id}
                      className="flex-1 bg-black border border-neutral-800 text-stone-300 px-3 py-2 text-xs font-mono
                                 focus:outline-none focus:border-red-900/50 disabled:opacity-50"
                    />
                    <button
                      onClick={() => handleDonate(mon.id)}
                      disabled={donating === mon.id || !inputVal || parseInt(inputVal) <= 0 || parseInt(inputVal) > playerResource}
                      className="px-4 py-2 bg-red-900/20 border border-red-900/50 text-red-300 font-mono text-xs uppercase tracking-widest
                                 hover:bg-red-900/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {donating === mon.id ? '...' : 'Donate'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-mono text-stone-500">
                      Your contribution: <span className="text-stone-300">{(mon.myContribution || 0).toLocaleString()}</span>
                    </div>
                    {mon.myContribution > 0 && (
                      <button
                        onClick={() => handleClaimBuff(mon.id)}
                        disabled={claiming === mon.id}
                        className="px-4 py-2 bg-green-900/20 border border-green-900/50 text-green-300 font-mono text-xs uppercase tracking-widest
                                   hover:bg-green-900/40 transition-colors disabled:opacity-30"
                      >
                        {claiming === mon.id ? '...' : 'Claim Buff'}
                      </button>
                    )}
                  </div>
                )}

                {/* Top Contributors */}
                {mon.topContributors && mon.topContributors.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-neutral-900">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-2">
                      Top Contributors
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1">
                      {mon.topContributors.slice(0, 10).map((c, i) => (
                        <div key={c.playerId} className="flex items-center gap-1 text-[11px] font-mono">
                          <span className="text-stone-600">{i + 1}.</span>
                          <span className="text-stone-400 truncate">{c.username}</span>
                          <span className={`ml-auto ${colors.text}`}>{c.donated.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
