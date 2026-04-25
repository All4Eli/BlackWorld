'use client';
// ═══════════════════════════════════════════════════════════════════
// CovenWarfareWall.jsx — Territory Siege Warfare UI
// ═══════════════════════════════════════════════════════════════════
//
// DATA FLOW — How this React component talks to the API:
//
//   1. On mount, useEffect calls fetchSiegeState() → GET /api/covens/siege
//      The API returns { territories, siege, myStats, covenId }.
//      This populates the territory list OR the active siege wall grid.
//
//   2. When the user clicks a wall slot to attack, handleAttack() fires:
//        POST /api/covens/siege  →  { action: 'attack', siegeId, targetSlot }
//      The API processes the attack inside a FOR UPDATE transaction,
//      then returns the new wall state + updatedHero.
//
//   3. updateHero(data.updatedHero) pushes the new hero state into
//      the global PlayerContext. Every component that called usePlayer()
//      re-renders with the new essence/HP values. This is how a single
//      API call keeps the ENTIRE UI in sync without prop drilling.
//
//   4. A setInterval polls GET /api/covens/siege every 8 seconds to
//      keep the wall grid updated with other players' attacks in
//      near-real-time. We use a ref (pollRef) to avoid stacking polls.
//
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import { GameIcon } from '@/components/icons/GameIcons';

// ── Constants ───────────────────────────────────────────────────
const POLL_INTERVAL  = 8000;  // 8 seconds between state refreshes
const POINTS_TO_WIN  = 5000;  // Must match the API constant
const WALL_SLOT_COUNT = 10;

// ── Bonus type display labels ───────────────────────────────────
const BONUS_LABELS = {
  gold_bonus:      'Gold Income',
  xp_bonus:        'XP Gain',
  gathering_bonus: 'Gathering Yield',
};


export default function CovenWarfareWall({ onBack }) {
  // ── Global state from PlayerContext ───────────────────────────
  // hero: the player's full data object (HP, essence, gold, coven_id, etc.)
  // updateHero: function to replace the hero object after API responses
  const { hero, updateHero } = usePlayer();

  // ── Local component state ────────────────────────────────────
  const [territories, setTerritories] = useState([]);  // Available territory nodes
  const [siege, setSiege]     = useState(null);         // Active siege object (or null)
  const [myStats, setMyStats] = useState({ attacks: 0, damage_dealt: 0 });
  const [covenId, setCovenId] = useState(null);
  const [covenName, setCovenName] = useState('');

  const [loading, setLoading]     = useState(true);
  const [acting, setActing]       = useState(false);     // Busy lock for button
  const [cooldown, setCooldown]   = useState(0);         // Attack cooldown timer
  const [combatLog, setCombatLog] = useState([]);        // Local combat feed
  const [error, setError]         = useState('');

  const pollRef = useRef(null);  // Ref to store the interval ID

  // ── Fetch siege state from the API ────────────────────────────
  // This function is memoized with useCallback so the useEffect
  // dependency array stays stable and doesn't cause infinite loops.
  const fetchSiegeState = useCallback(async () => {
    try {
      const res = await fetch('/api/covens/siege');
      if (!res.ok) return;
      const data = await res.json();

      setTerritories(data.territories || []);
      setSiege(data.siege || null);
      setMyStats(data.myStats || { attacks: 0, damage_dealt: 0 });
      setCovenId(data.covenId);
      setCovenName(data.covenName || '');
    } catch (err) {
      console.error('[SIEGE FETCH]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Mount: initial fetch + polling interval ───────────────────
  useEffect(() => {
    fetchSiegeState();

    // Set up polling — every POLL_INTERVAL ms, re-fetch siege state.
    // This keeps our wall grid updated with other players' attacks.
    // Using a ref prevents stacking intervals if the component re-mounts.
    pollRef.current = setInterval(fetchSiegeState, POLL_INTERVAL);

    // Cleanup: clear the interval when the component unmounts.
    // Without this, the interval would keep firing after navigation,
    // wasting bandwidth and potentially updating unmounted state.
    return () => clearInterval(pollRef.current);
  }, [fetchSiegeState]);

  // ── Cooldown timer ────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);


  // ── Action: Declare a new siege on a territory ────────────────
  const handleStartSiege = async (territoryId) => {
    setActing(true);
    setError('');
    try {
      const res = await fetch('/api/covens/siege', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': `siege-start-${territoryId}-${Date.now()}`,
        },
        body: JSON.stringify({ action: 'start_siege', territoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start siege.');

      // Sync hero state (essence was deducted server-side)
      if (data.updatedHero) updateHero(data.updatedHero);
      await fetchSiegeState();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  };


  // ── Action: Join an empty wall slot ───────────────────────────
  const handleJoinSlot = async (slotIndex) => {
    if (!siege) return;
    setActing(true);
    setError('');
    try {
      const res = await fetch('/api/covens/siege', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': `siege-join-${siege.id}-${slotIndex}-${Date.now()}`,
        },
        body: JSON.stringify({ action: 'join_slot', siegeId: siege.id, slotIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join slot.');

      if (data.updatedHero) updateHero(data.updatedHero);
      // Update local wall state immediately for responsive UI
      if (data.wallSlots) {
        setSiege(prev => prev ? { ...prev, wallSlots: data.wallSlots } : null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  };


  // ── Action: Attack an enemy-occupied slot ─────────────────────
  const handleAttack = async (targetSlot) => {
    if (!siege || acting || cooldown > 0) return;
    setActing(true);
    setError('');
    try {
      const res = await fetch('/api/covens/siege', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': `siege-atk-${siege.id}-${targetSlot}-${Date.now()}`,
        },
        body: JSON.stringify({ action: 'attack', siegeId: siege.id, targetSlot }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) setCooldown(30);
        throw new Error(data.error || data.message || 'Attack failed.');
      }

      // Sync hero state (essence deducted)
      if (data.updatedHero) updateHero(data.updatedHero);

      // Update local siege state immediately
      setSiege(prev => {
        if (!prev) return null;
        return {
          ...prev,
          wallSlots:      data.wallSlots      || prev.wallSlots,
          attackerPoints: data.attackerPoints  ?? prev.attackerPoints,
          defenderPoints: data.defenderPoints  ?? prev.defenderPoints,
          status:         data.siegeResolved ? 'resolved' : prev.status,
        };
      });

      // Combat log entry
      const logEntry = data.isCrit
        ? `>> CRITICAL HIT! ${data.damage} damage to slot ${targetSlot}!`
        : `>> Hit slot ${targetSlot} for ${data.damage} damage.`;
      const extras = [];
      if (data.slotFlipped) extras.push('!! Slot breached!');
      if (data.siegeResolved) extras.push(`!! SIEGE WON by ${data.winnerFaction}!`);

      setCombatLog(prev => [...[logEntry, ...extras], ...prev].slice(0, 40));
      setCooldown(5); // 5-second client cooldown

    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
    }
  };


  // ────────────────────────────────────────────────────────────────
  //  RENDER: Loading State
  // ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-stone-600 font-mono text-xs text-center py-20 uppercase tracking-widest animate-pulse">
        Scanning war fronts...
      </div>
    );
  }


  // ────────────────────────────────────────────────────────────────
  //  RENDER: Active Siege — The Warfare Wall
  // ────────────────────────────────────────────────────────────────
  if (siege && siege.status === 'active') {
    const totalPoints   = siege.attackerPoints + siege.defenderPoints;
    const atkPercent     = totalPoints > 0 ? (siege.attackerPoints / POINTS_TO_WIN) * 100 : 0;
    const defPercent     = totalPoints > 0 ? (siege.defenderPoints / POINTS_TO_WIN) * 100 : 0;
    const isAttacker     = siege.attackerCovenId === covenId;
    const myFaction      = isAttacker ? 'ATK' : 'DEF';

    return (
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
        {/* Back button */}
        <button onClick={onBack} id="btn-siege-back"
          className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
          {'<'} Back to Coven
        </button>

        {/* ── Siege Header ──────────────────────────────────── */}
        <div className="border-2 border-red-900/40 bg-[#050505] p-6 md:p-8 shadow-[0_0_60px_rgba(153,27,27,0.12)]">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-red-700 mb-1">
                Territory Siege
              </div>
              <h2 className="text-2xl md:text-4xl font-black uppercase tracking-[0.15em] font-serif text-stone-200">
                {siege.territoryName}
              </h2>
              <div className="text-stone-600 text-[10px] font-mono uppercase tracking-widest mt-1">
                Expires: {new Date(siege.expiresAt).toLocaleString()}
              </div>
            </div>

            {/* Faction badges */}
            <div className="flex gap-4 font-mono text-xs">
              <div className={`border px-4 py-2 text-center ${isAttacker ? 'border-red-800 bg-red-950/30 text-red-400' : 'border-neutral-800 bg-[#020202] text-stone-500'}`}>
                <div className="text-[9px] uppercase tracking-widest mb-1">Attackers</div>
                <div className="text-lg font-bold">[{siege.attackerTag}]</div>
                <div className="text-[10px]">{siege.attackerName}</div>
              </div>
              <div className="text-stone-700 self-center font-serif text-xl">vs</div>
              <div className={`border px-4 py-2 text-center ${!isAttacker ? 'border-blue-800 bg-blue-950/30 text-blue-400' : 'border-neutral-800 bg-[#020202] text-stone-500'}`}>
                <div className="text-[9px] uppercase tracking-widest mb-1">Defenders</div>
                <div className="text-lg font-bold">[{siege.defenderTag || '---'}]</div>
                <div className="text-[10px]">{siege.defenderName || 'Unclaimed'}</div>
              </div>
            </div>
          </div>

          {/* ── Territory Control Bar ───────────────────────── */}
          <div className="mb-6">
            <div className="flex justify-between text-[10px] font-mono uppercase text-stone-500 mb-1">
              <span className="text-red-500">ATK: <span className="font-bold">{siege.attackerPoints.toLocaleString()}</span></span>
              <span className="text-stone-600">Control ({POINTS_TO_WIN.toLocaleString()} to win)</span>
              <span className="text-blue-400">DEF: <span className="font-bold">{siege.defenderPoints.toLocaleString()}</span></span>
            </div>
            <div className="h-5 bg-neutral-900 w-full border border-neutral-800 overflow-hidden flex">
              {/* Attacker progress (red, left-aligned) */}
              <div
                className="h-full bg-gradient-to-r from-red-900 to-red-700 transition-all duration-700"
                style={{ width: `${Math.min(50, atkPercent / 2)}%` }}
              />
              {/* Gap */}
              <div className="flex-1" />
              {/* Defender progress (blue, right-aligned) */}
              <div
                className="h-full bg-gradient-to-l from-blue-900 to-blue-700 transition-all duration-700"
                style={{ width: `${Math.min(50, defPercent / 2)}%` }}
              />
            </div>
          </div>

          {/* ── THE WALL — 10 Slot Grid ────────────────────── */}
          <div className="mb-6">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
              Siege Wall — {WALL_SLOT_COUNT} Positions
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 md:gap-3">
              {(siege.wallSlots || []).map((slot, i) => {
                const isEmpty     = !slot.occupant_id;
                const isEnemy     = !isEmpty && slot.faction !== myFaction;
                const isFriendly  = !isEmpty && slot.faction === myFaction;
                const isMe        = slot.occupant_id === hero?.clerk_user_id;
                const hpPercent   = slot.hp > 0 ? (slot.hp / 500) * 100 : 0;

                return (
                  <div
                    key={i}
                    id={`siege-slot-${i}`}
                    className={`
                      border p-3 font-mono text-xs transition-all relative overflow-hidden
                      ${isEmpty
                        ? 'border-neutral-800 bg-[#020202] hover:border-neutral-600 cursor-pointer'
                        : isEnemy
                          ? 'border-red-900/60 bg-red-950/15 hover:border-red-700'
                          : isMe
                            ? 'border-yellow-700/50 bg-yellow-950/10'
                            : 'border-stone-700/40 bg-stone-950/10'
                      }
                    `}
                    onClick={() => {
                      if (isEmpty) handleJoinSlot(i);
                      else if (isEnemy) handleAttack(i);
                    }}
                  >
                    {/* Slot index */}
                    <div className="text-[9px] text-stone-700 uppercase tracking-widest mb-2">
                      Slot {String(i + 1).padStart(2, '0')}
                    </div>

                    {isEmpty ? (
                      <div className="text-center py-2">
                        <div className="text-stone-600 text-[10px] uppercase tracking-widest">Empty</div>
                        <div className="text-stone-700 text-[9px] mt-1">[Join]</div>
                      </div>
                    ) : (
                      <>
                        {/* Occupant name */}
                        <div className={`font-bold text-[11px] uppercase tracking-wider truncate mb-1 ${
                          isEnemy ? 'text-red-400' : isMe ? 'text-yellow-500' : 'text-stone-300'
                        }`}>
                          {slot.occupant_name}
                          {isMe && <span className="text-[8px] text-yellow-600 ml-1">(YOU)</span>}
                        </div>

                        {/* Faction badge */}
                        <div className={`text-[9px] uppercase tracking-widest mb-2 ${
                          slot.faction === 'ATK' ? 'text-red-600' : 'text-blue-500'
                        }`}>
                          {slot.faction === 'ATK' ? 'Attacker' : 'Defender'}
                        </div>

                        {/* HP bar for this slot */}
                        <div className="h-1.5 bg-neutral-900 w-full border border-neutral-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isEnemy ? 'bg-red-700' : 'bg-emerald-700'
                            }`}
                            style={{ width: `${hpPercent}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-stone-600 text-right mt-0.5 font-mono">
                          {slot.hp} HP
                        </div>

                        {/* Attack prompt for enemy slots */}
                        {isEnemy && (
                          <div className="text-[9px] text-red-700 uppercase tracking-widest text-center mt-1 opacity-70">
                            [Strike]
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Action / Cooldown ───────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-neutral-800 pt-4">
            <div className="font-mono text-xs text-stone-500">
              Your Faction: <span className={myFaction === 'ATK' ? 'text-red-400 font-bold' : 'text-blue-400 font-bold'}>{myFaction}</span>
              <span className="mx-3 text-stone-700">|</span>
              Attacks: <span className="text-stone-300 font-bold">{myStats.attacks}</span>
              <span className="mx-3 text-stone-700">|</span>
              Damage: <span className="text-red-400 font-bold">{myStats.damage_dealt.toLocaleString()}</span>
            </div>
            {cooldown > 0 && (
              <div className="text-stone-600 font-mono text-xs uppercase tracking-widest">
                Cooldown: <span className="text-stone-400 font-bold">{cooldown}s</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Error display ─────────────────────────────────── */}
        {error && (
          <div className="border border-red-900/50 bg-red-950/20 text-red-500 text-xs font-mono p-3 text-center">
            {error}
          </div>
        )}

        {/* ── Combat Log ────────────────────────────────────── */}
        {combatLog.length > 0 && (
          <div className="border border-neutral-900 bg-[#020202] p-4 max-h-40 overflow-y-auto">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
              Siege Combat Log
            </h3>
            {combatLog.map((log, i) => (
              <div key={i} className={`text-xs font-mono py-0.5 ${
                log.includes('CRITICAL') ? 'text-yellow-500' :
                log.includes('SIEGE WON') ? 'text-green-500 font-bold' :
                log.includes('breached') ? 'text-orange-400' :
                log.startsWith('>>') ? 'text-stone-300' :
                'text-stone-500'
              }`}>{log}</div>
            ))}
          </div>
        )}
      </div>
    );
  }


  // ────────────────────────────────────────────────────────────────
  //  RENDER: Resolved Siege
  // ────────────────────────────────────────────────────────────────
  if (siege && siege.status === 'resolved') {
    return (
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
          {'<'} Back to Coven
        </button>
        <div className="border-2 border-green-900/30 bg-[#050505] p-8 text-center">
          <div className="text-green-500 font-serif text-3xl font-black uppercase tracking-[0.2em] mb-2">
            Siege Resolved
          </div>
          <div className="text-stone-400 font-mono text-xs tracking-widest mb-4">
            {siege.territoryName} has changed hands.
          </div>
          <div className="font-mono text-sm text-stone-300">
            ATK: <span className="text-red-400 font-bold">{siege.attackerPoints.toLocaleString()}</span>
            <span className="mx-4 text-stone-700">vs</span>
            DEF: <span className="text-blue-400 font-bold">{siege.defenderPoints.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }


  // ────────────────────────────────────────────────────────────────
  //  RENDER: Territory Map — No Active Siege
  // ────────────────────────────────────────────────────────────────
  const regionGroups = {};
  (territories || []).forEach(t => {
    if (!regionGroups[t.region]) regionGroups[t.region] = [];
    regionGroups[t.region].push(t);
  });

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
      <button onClick={onBack} id="btn-siege-back"
        className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
        {'<'} Back to Coven
      </button>

      <div className="border border-neutral-900 bg-[#050505] p-6 md:p-8 shadow-[0_4px_30px_rgba(0,0,0,0.8)]">
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2 border-b border-red-900/30 pb-4">
          Territory Warfare
        </h2>
        <p className="text-stone-500 font-mono text-xs tracking-widest mb-8">
          Declare siege on unclaimed or rival territories. Control grants passive bonuses to your entire coven.
        </p>

        {error && (
          <div className="border border-red-900/50 bg-red-950/20 text-red-500 text-xs font-mono p-3 text-center mb-6">
            {error}
          </div>
        )}

        {Object.entries(regionGroups).map(([region, nodes]) => (
          <div key={region} className="mb-8">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-4 border-b border-neutral-900 pb-2">
              {region}
            </h3>
            <div className="flex flex-col gap-3">
              {nodes.map(node => {
                const isOwned   = !!node.owner_coven_id;
                const isOurs    = node.owner_coven_id === covenId;

                return (
                  <div key={node.id}
                    className={`border p-5 transition-colors ${
                      isOurs
                        ? 'border-yellow-800/40 bg-yellow-950/10'
                        : 'border-neutral-800 bg-[#020202] hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <GameIcon name="flame" size={16} className="text-red-700" />
                          <span className="text-lg font-bold uppercase font-serif text-stone-300">
                            {node.name}
                          </span>
                          {isOurs && (
                            <span className="text-[9px] uppercase font-mono tracking-widest text-yellow-600 border border-yellow-900/30 bg-yellow-950/10 px-2 py-0.5">
                              Controlled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 font-mono mb-2">{node.description}</p>
                        <div className="flex gap-4 text-[10px] font-mono uppercase tracking-widest text-stone-600">
                          <span>Bonus: <span className="text-stone-400">{BONUS_LABELS[node.bonus_type] || node.bonus_type}</span></span>
                          <span>+<span className="text-red-500 font-bold">{node.bonus_value}%</span></span>
                          {isOwned && node.owner_name && (
                            <span>Owner: <span className="text-stone-400">[{node.owner_tag}] {node.owner_name}</span></span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {isOurs ? (
                          <div className="text-yellow-700 font-mono text-[10px] uppercase tracking-widest px-4 py-2 border border-yellow-900/20">
                            Your Territory
                          </div>
                        ) : (
                          <button
                            id={`btn-siege-${node.id}`}
                            onClick={() => handleStartSiege(node.id)}
                            disabled={acting}
                            className="px-6 py-3 bg-red-950/20 border border-red-900/50 text-red-500 hover:bg-red-900 hover:text-stone-200 transition-colors uppercase tracking-widest text-xs font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {acting ? 'Declaring...' : 'Declare Siege'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {territories.length === 0 && (
          <div className="text-center text-stone-600 italic font-mono text-xs py-12 border border-neutral-800 bg-[#020202]">
            No territories available. The world map is barren.
          </div>
        )}
      </div>
    </div>
  );
}
