'use client';
// ═══════════════════════════════════════════════════════════════════
// SovereignDashboard.jsx — The Throne's Control Panel
// ═══════════════════════════════════════════════════════════════════
//
// RENDERED ONLY when the current player IS the Sovereign.
// This component provides high-contrast, sharp-edged controls
// for adjusting global server multipliers.
//
// DATA FLOW:
//   1. Receives `multipliers` and `controls` as props from HallOfLegendsView
//   2. Player adjusts a slider/input → local state updates
//   3. Player clicks "Apply" → POST /api/politics/sovereign { key, value }
//   4. API verifies the requester IS the Sovereign (403 if not)
//   5. server_config row is updated → affects all players server-wide
//
// ═══════════════════════════════════════════════════════════════════

import { useState } from 'react';

export default function SovereignDashboard({ multipliers, controls, onBack }) {
  // Local state for each control value (tracks pending changes)
  const [values, setValues] = useState(() => {
    const init = {};
    for (const [key, ctrl] of Object.entries(controls)) {
      init[key] = multipliers[key] ?? (ctrl.step >= 1 ? 0 : 1.0);
    }
    return init;
  });

  const [saving, setSaving]     = useState(null);  // key being saved
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');


  // ── Apply a single control change ─────────────────────────────
  const handleApply = async (key) => {
    setSaving(key);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/politics/sovereign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: values[key] }),
      });
      const data = await res.json();

      if (res.status === 403) {
        setError('Access denied. You are not the Sovereign.');
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to apply change.');
        return;
      }

      setSuccess(`${data.label} set to ${data.value}`);
    } catch (err) {
      setError('Network error.');
    } finally {
      setSaving(null);
    }
  };


  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">

      {/* ── Back button ─────────────────────────────────────────── */}
      <button onClick={onBack} id="btn-sov-back"
        className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
        {'<'} Back to Hall of Legends
      </button>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="border-2 border-amber-700/40 bg-[#050505] p-8 shadow-[0_0_80px_rgba(180,120,30,0.1)]">
        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-700 mb-1">
          Sovereign Authority
        </div>
        <h2 className="text-3xl md:text-4xl font-black uppercase tracking-[0.2em] font-serif text-amber-400 mb-2">
          The Throne
        </h2>
        <p className="text-stone-500 font-mono text-xs tracking-widest max-w-lg">
          As the reigning Sovereign, you command the economic levers of BlackWorld.
          Every adjustment here affects ALL players server-wide.
        </p>
      </div>

      {/* ── Result toasts ───────────────────────────────────────── */}
      {success && (
        <div className="border border-green-900/30 bg-green-950/20 text-green-400 text-xs font-mono p-3 text-center animate-in fade-in duration-300">
          {'>'} {success}
        </div>
      )}
      {error && (
        <div className="border border-red-900/50 bg-red-950/20 text-red-500 text-xs font-mono p-3 text-center">
          {error}
        </div>
      )}

      {/* ── Multiplier Controls ─────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {Object.entries(controls).map(([key, ctrl]) => {
          const currentValue = values[key] ?? 1;
          const isModified = currentValue !== (multipliers[key] ?? (ctrl.step >= 1 ? 0 : 1.0));

          return (
            <div
              key={key}
              className={`border p-5 transition-colors ${
                isModified
                  ? 'border-amber-800/50 bg-amber-950/10'
                  : 'border-neutral-800 bg-[#050505]'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                {/* Label + description */}
                <div className="flex-1">
                  <div className="text-stone-300 font-bold uppercase tracking-wider text-sm font-serif mb-1">
                    {ctrl.label}
                  </div>
                  <div className="text-[10px] font-mono text-stone-600 uppercase tracking-widest">
                    Range: {ctrl.min} — {ctrl.max} (step: {ctrl.step})
                  </div>
                  <div className="text-[10px] font-mono text-stone-700 mt-0.5">
                    Config key: <span className="text-stone-500">{key}</span>
                  </div>
                </div>

                {/* Value control */}
                <div className="flex items-center gap-3">
                  {/* Decrement button */}
                  <button
                    onClick={() => setValues(prev => ({
                      ...prev,
                      [key]: Math.max(ctrl.min, parseFloat((prev[key] - ctrl.step).toFixed(2))),
                    }))}
                    disabled={currentValue <= ctrl.min}
                    className="w-10 h-10 border border-neutral-700 bg-[#020202] text-stone-400 hover:text-stone-200 hover:border-neutral-500 font-mono text-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    -
                  </button>

                  {/* Current value display */}
                  <div className={`w-20 text-center text-xl font-mono font-bold tabular-nums ${
                    isModified ? 'text-amber-400' : 'text-stone-300'
                  }`}>
                    {ctrl.step >= 1 ? currentValue : currentValue.toFixed(1)}
                  </div>

                  {/* Increment button */}
                  <button
                    onClick={() => setValues(prev => ({
                      ...prev,
                      [key]: Math.min(ctrl.max, parseFloat((prev[key] + ctrl.step).toFixed(2))),
                    }))}
                    disabled={currentValue >= ctrl.max}
                    className="w-10 h-10 border border-neutral-700 bg-[#020202] text-stone-400 hover:text-stone-200 hover:border-neutral-500 font-mono text-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    +
                  </button>

                  {/* Apply button */}
                  <button
                    onClick={() => handleApply(key)}
                    disabled={!isModified || saving === key}
                    className={`ml-2 px-5 py-2 font-mono text-[10px] uppercase tracking-widest font-bold transition-colors border ${
                      isModified
                        ? 'border-amber-700 bg-amber-950/30 text-amber-400 hover:bg-amber-900 hover:text-stone-200'
                        : 'border-neutral-800 bg-neutral-900 text-stone-700 cursor-not-allowed'
                    }`}
                  >
                    {saving === key ? '...' : 'Apply'}
                  </button>
                </div>
              </div>

              {/* Current live value indicator */}
              <div className="mt-3 pt-2 border-t border-neutral-800">
                <div className="flex justify-between text-[9px] font-mono uppercase tracking-widest text-stone-600">
                  <span>Current Live Value</span>
                  <span className="text-stone-400 font-bold">
                    {ctrl.step >= 1
                      ? (multipliers[key] ?? 0)
                      : (multipliers[key] ?? 1.0).toFixed(1)
                    }
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Warning ─────────────────────────────────────────────── */}
      <div className="border border-amber-900/20 bg-amber-950/5 p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-700 mb-1">
          Sovereign Advisory
        </div>
        <p className="text-stone-500 font-mono text-[11px] leading-relaxed">
          Changes take effect immediately and affect every player on the server.
          Extreme adjustments will be visible on the global feed and may influence
          the next election cycle. Rule wisely.
        </p>
      </div>
    </div>
  );
}
