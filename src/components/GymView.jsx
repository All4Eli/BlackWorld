'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

export default function GymView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [trainings, setTrainings] = useState([]);
  const [energy, setEnergy] = useState(hero?.energy ?? 100);
  const [maxEnergy, setMaxEnergy] = useState(hero?.max_energy ?? 100);
  const [stats, setStats] = useState({
    str: hero?.str ?? 10,
    spd: hero?.spd ?? 10,
    def: hero?.def ?? 10,
    dex: hero?.dex ?? 10,
  });
  const [jailStatus, setJailStatus] = useState({ in_jail: false, jail_until: null, jail_reason: null, remaining_seconds: 0 });
  const [loading, setLoading] = useState(true);
  const [trainingStat, setTrainingStat] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);

  const fetchGymData = async () => {
    try {
      const res = await fetch('/api/gym');
      const data = await res.json();
      if (res.ok) {
        setTrainings(data.trainings || []);
        if (data.energy !== undefined) setEnergy(data.energy);
        if (data.max_energy !== undefined) setMaxEnergy(data.max_energy);
        if (data.stats) setStats(data.stats);
        if (data.jail_status) setJailStatus(data.jail_status);
      }
    } catch (err) {
      console.error('Failed to fetch gym data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGymData();
  }, []);

  // Real-time jail timer update
  useEffect(() => {
    if (!jailStatus.in_jail || jailStatus.remaining_seconds <= 0) return;

    const timer = setInterval(() => {
      setJailStatus(prev => {
        if (prev.remaining_seconds <= 1) {
          clearInterval(timer);
          fetchGymData();
          return { in_jail: false, jail_until: null, jail_reason: null, remaining_seconds: 0 };
        }
        return { ...prev, remaining_seconds: prev.remaining_seconds - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [jailStatus.in_jail, jailStatus.remaining_seconds]);

  const handleTrain = async (statType, trainingId = null) => {
    if (jailStatus.in_jail || energy < 10 || trainingStat) return;

    setTrainingStat(statType);
    setResultMsg(null);

    try {
      const body = trainingId ? { trainingId } : { statType };
      const res = await fetch('/api/gym', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          setResultMsg({ success: false, text: data.error || 'You are in the Dungeon!' });
        } else {
          setResultMsg({ success: false, text: data.error || 'Training failed.' });
        }
        return;
      }

      if (data.success) {
        const newStatVal = data.new_stat_val;
        const newEnergyVal = data.energy_remaining;

        setEnergy(newEnergyVal);
        setStats(prev => ({ ...prev, [data.stat_type]: newStatVal }));

        setResultMsg({
          success: true,
          text: `Trained ${data.stat_type.toUpperCase()}! Gained +${data.stat_gain} stat point (Now ${newStatVal}).`,
        });

        if (updateHero) {
          updateHero({
            energy: newEnergyVal,
            [data.stat_type]: newStatVal,
          });
        }
      }
    } catch (err) {
      setResultMsg({ success: false, text: 'Connection error during training.' });
    } finally {
      setTrainingStat(null);
    }
  };

  const statConfigs = [
    { key: 'str', label: 'Strength', desc: 'Increases raw damage dealt in combat.', color: 'text-red-500', border: 'border-red-900/40', bg: 'bg-red-950/10' },
    { key: 'spd', label: 'Speed', desc: 'Determines hit frequency and turn priority.', color: 'text-amber-500', border: 'border-amber-900/40', bg: 'bg-amber-950/10' },
    { key: 'def', label: 'Defense', desc: 'Reduces physical damage taken from foes.', color: 'text-blue-500', border: 'border-blue-900/40', bg: 'bg-blue-950/10' },
    { key: 'dex', label: 'Dexterity', desc: 'Boosts critical strike chance and evasion.', color: 'text-emerald-500', border: 'border-emerald-900/40', bg: 'bg-emerald-950/10' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      {onBack && (
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
          ← Back to City Directory
        </button>
      )}

      <div className="border border-neutral-900 bg-[#050505] p-8 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        <h1 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2">
          Iron Gym
        </h1>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center max-w-md mb-6">
          Push your body past mortal limits. Spend Energy to forge your Strength, Speed, Defense, and Dexterity.
        </p>

        {/* DUNGEON ALERT BANNER */}
        {jailStatus.in_jail && (
          <div className="w-full mb-6 bg-red-950/80 border-2 border-red-600 p-4 text-center font-mono text-xs text-red-300">
            🚨 IN THE DUNGEON (JAIL) — Gym workouts disabled for {jailStatus.remaining_seconds}s
          </div>
        )}

        {/* Energy Bar */}
        <div className="w-full max-w-lg bg-[#020202] border border-neutral-800 p-4 mb-8">
          <div className="flex justify-between items-center font-mono text-xs uppercase tracking-widest mb-2">
            <span className="text-stone-400 font-bold flex items-center gap-2">
              ⚡ Energy Reserve
            </span>
            <span className="text-yellow-500 font-bold">
              {energy} / {maxEnergy}
            </span>
          </div>
          <div className="w-full h-3 bg-neutral-950 border border-neutral-800 rounded-xs overflow-hidden">
            <div
              className="h-full bg-yellow-600 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, (energy / maxEnergy) * 100))}%` }}
            />
          </div>
          <p className="text-[9px] font-mono text-stone-600 text-right mt-1">
            Regenerates +5 Energy every 15 minutes
          </p>
        </div>

        {/* Result Message */}
        {resultMsg && (
          <div
            className={`w-full max-w-lg mb-6 p-4 border font-mono text-xs text-center ${
              resultMsg.success
                ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                : 'bg-red-950/40 border-red-800 text-red-400'
            }`}
          >
            {resultMsg.text}
          </div>
        )}

        {/* Battle Stats Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          {statConfigs.map((cfg) => {
            const currentVal = stats[cfg.key] ?? 10;
            const matchedTraining = trainings.find(t => t.stat_type === cfg.key);
            const energyCost = matchedTraining ? Number(matchedTraining.energy_cost) : 10;
            const statGain = matchedTraining ? Number(matchedTraining.stat_gain) : 1;
            const canTrain = !jailStatus.in_jail && energy >= energyCost && !trainingStat;
            const isTrainingThis = trainingStat === cfg.key;

            return (
              <div
                key={cfg.key}
                className={`border ${cfg.border} ${cfg.bg} p-6 flex flex-col justify-between gap-4`}
              >
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`font-serif font-bold uppercase tracking-widest text-lg ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="font-mono text-2xl font-bold text-stone-200">
                      {currentVal.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-stone-500 leading-relaxed">
                    {cfg.desc}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-neutral-900 font-mono text-xs">
                  <span className="text-stone-400">
                    Cost: <strong className="text-yellow-500">{energyCost} Energy</strong> (+{statGain})
                  </span>

                  <button
                    onClick={() => handleTrain(cfg.key, matchedTraining?.id)}
                    disabled={!canTrain}
                    title={
                      jailStatus.in_jail
                        ? 'Locked: You are in the Dungeon'
                        : energy < energyCost
                        ? 'Insufficient Energy'
                        : `Train ${cfg.label}`
                    }
                    className="px-5 py-2 border border-neutral-800 bg-black text-stone-300 hover:bg-neutral-900 hover:border-stone-500 transition-all uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isTrainingThis ? 'Training...' : `Train ${cfg.key.toUpperCase()}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
