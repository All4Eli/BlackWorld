'use client';
// ═══════════════════════════════════════════════════════════════════
// GatheringView.jsx — Resource Gathering Interface
// ═══════════════════════════════════════════════════════════════════
//
// DATA FLOW:
//   1. On mount, fetchNodes() calls GET /api/gathering
//      → Returns { nodes, skills, cooldowns }
//      → Populates the node grid with cooldown timers
//
//   2. Player clicks "Gather" on an available node:
//      → POST /api/gathering { nodeId }
//      → API runs the full transaction (lock, check, loot, insert, deduct)
//      → Returns { success, gathered, cooldownExpiresAt, updatedHero }
//      → updateHero() syncs the global PlayerContext (essence deducted)
//      → Node shows cooldown timer until cooldownExpiresAt
//
//   3. A 1-second setInterval ticks down all active cooldown timers.
//      When a timer hits 0, the node becomes available again.
//
// DESIGN COMPLIANCE:
//   - Zero rounded-* classes (sharp edges only)
//   - #030303 / #050505 / #020202 backgrounds
//   - font-mono for all numbers and timers
//   - uppercase tracking-widest for all headers
//   - Zero emojis — GameIcons only
//
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import { GameIcon } from './icons/GameIcons';

// ── Skill type → icon key mapping ───────────────────────────────
const SKILL_ICON_KEYS = {
  mining:       'mining',
  herbalism:    'herb',
  woodcutting:  'axe',
  gemcraft:     'gem',
  skinning:     'knife',
};

// ── node_type → skill_type mapping (must match API) ─────────────
const NODE_TO_SKILL = {
  ore:     'mining',
  herb:    'herbalism',
  wood:    'woodcutting',
  gem:     'gemcraft',
  essence: 'mining',
  skin:    'skinning',
};

// ── Tier color classes ──────────────────────────────────────────
const TIER_COLORS = {
  COMMON:    'text-stone-400',
  UNCOMMON:  'text-green-400',
  RARE:      'text-blue-400',
  EPIC:      'text-purple-400',
  LEGENDARY: 'text-amber-400',
};

const TIER_BORDERS = {
  COMMON:    'border-stone-800',
  UNCOMMON:  'border-green-900/40',
  RARE:      'border-blue-900/40',
  EPIC:      'border-purple-900/40',
  LEGENDARY: 'border-amber-900/40',
};

const TIER_BG = {
  COMMON:    'bg-[#050505]',
  UNCOMMON:  'bg-green-950/10',
  RARE:      'bg-blue-950/10',
  EPIC:      'bg-purple-950/10',
  LEGENDARY: 'bg-amber-950/10',
};


export default function GatheringView({ onBack }) {
  // ── Global state from PlayerContext ───────────────────────────
  const { hero, updateHero } = usePlayer();

  // ── Local state ──────────────────────────────────────────────
  const [nodes, setNodes]           = useState([]);
  const [skills, setSkills]         = useState([]);
  const [cooldowns, setCooldowns]   = useState({});  // { nodeId: { expiresAt, timesGathered } }
  const [loading, setLoading]       = useState(true);
  const [gathering, setGathering]   = useState(null);   // nodeId currently being gathered
  const [result, setResult]         = useState(null);    // last gather result
  const [selectedZone, setSelectedZone] = useState(null);
  const [error, setError]           = useState('');

  const tickRef = useRef(null);  // Cooldown tick interval

  // ── Fetch nodes + skills + cooldowns from API ─────────────────
  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/gathering');
      if (!res.ok) return;
      const data = await res.json();
      setNodes(data.nodes || []);
      setSkills(data.skills || []);
      setCooldowns(data.cooldowns || {});
    } catch (err) {
      console.error('[GATHERING FETCH]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  // ── Cooldown tick — update remaining seconds every 1s ─────────
  //
  // Instead of polling the API, we calculate remaining seconds
  // client-side by comparing Date.now() to the cooldown_expires_at
  // timestamp returned by the API. This is purely cosmetic — the
  // API enforces the actual cooldown server-side.
  //
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setCooldowns(prev => {
        const now = Date.now();
        const next = { ...prev };
        let changed = false;
        for (const [nid, cd] of Object.entries(next)) {
          const remaining = new Date(cd.expiresAt).getTime() - now;
          if (remaining <= 0) {
            delete next[nid];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(tickRef.current);
  }, []);


  // ── Gather action ─────────────────────────────────────────────
  const handleGather = async (nodeId) => {
    if (gathering) return;
    setGathering(nodeId);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/gathering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Gathering failed.');
        return;
      }

      setResult(data);

      // Sync hero state (essence was deducted server-side)
      if (data.updatedHero) updateHero(data.updatedHero);

      // Set the local cooldown timer for this node
      if (data.cooldownExpiresAt) {
        setCooldowns(prev => ({
          ...prev,
          [nodeId]: { expiresAt: data.cooldownExpiresAt },
        }));
      }

      // Update local skill state for instant XP bar feedback
      setSkills(prev => {
        const idx = prev.findIndex(s => s.skill_type === data.skillType);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], skill_level: data.skillLevel, skill_xp: data.skillXP };
          return copy;
        }
        return [...prev, { skill_type: data.skillType, skill_level: data.skillLevel, skill_xp: data.skillXP }];
      });

    } catch (err) {
      setError('Network error.');
    } finally {
      setGathering(null);
    }
  };


  // ── Compute cooldown remaining for display ────────────────────
  function getCooldownSeconds(nodeId) {
    const cd = cooldowns[nodeId];
    if (!cd) return 0;
    const remaining = new Date(cd.expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  function formatCooldown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }


  // ── Zone filtering ────────────────────────────────────────────
  const zones = [...new Set(nodes.map(n => n.zone_name || n.zone_id))];
  const filteredNodes = selectedZone
    ? nodes.filter(n => (n.zone_name || n.zone_id) === selectedZone)
    : nodes;


  // ────────────────────────────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in fade-in duration-500 pb-10">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200">
            Gathering
          </h2>
          <p className="text-stone-500 text-xs font-mono uppercase tracking-widest mt-1">
            Harvest resources from the corrupted land
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} id="btn-gathering-back"
            className="text-stone-600 hover:text-stone-300 text-xs font-mono uppercase tracking-widest transition-colors">
            {'<'} Back
          </button>
        )}
      </div>

      {/* ── Skills Overview ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {['mining', 'herbalism', 'woodcutting', 'gemcraft', 'skinning'].map(type => {
          const skill = skills.find(s => s.skill_type === type);
          const level = skill?.skill_level || 1;
          const xp = skill?.skill_xp || 0;
          const xpNeeded = level * 100;
          const xpPercent = Math.min(100, (xp / xpNeeded) * 100);

          return (
            <div key={type} className="bg-[#050505] border border-neutral-800 p-3 text-center">
              <div className="mb-1 flex justify-center">
                <GameIcon name={SKILL_ICON_KEYS[type]} size={24} />
              </div>
              <div className="text-stone-400 text-[10px] font-mono uppercase tracking-widest">{type}</div>
              <div className="text-red-400 font-bold text-lg font-mono">Lv.{level}</div>
              {/* XP progress bar */}
              <div className="w-full bg-neutral-900 h-1.5 mt-1 border border-neutral-800 overflow-hidden">
                <div className="bg-red-800 h-full transition-all duration-500"
                  style={{ width: `${xpPercent}%` }} />
              </div>
              <div className="text-[9px] text-stone-600 font-mono mt-0.5">{xp}/{xpNeeded} XP</div>
            </div>
          );
        })}
      </div>

      {/* ── Essence Display ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 bg-red-950/15 border border-red-900/20 px-4 py-2">
        <GameIcon name="potion" size={16} className="text-red-500" />
        <span className="text-xs font-mono text-stone-500 uppercase tracking-widest">Blood Essence</span>
        <span className="text-red-400 font-bold font-mono ml-auto">
          {hero?.essence ?? 0} / {hero?.max_essence ?? 100}
        </span>
      </div>

      {/* ── Result Toast ────────────────────────────────────────── */}
      {result && (
        <div className="px-4 py-3 border text-xs font-mono bg-green-950/20 border-green-900/30 text-green-300 animate-in fade-in duration-300">
          <div className="space-y-1">
            <div>{'>'} Gathered successfully! (+{result.gatherXP} {result.skillType} XP)</div>
            {result.leveledUp && (
              <div className="text-amber-400 font-bold">
                {'>'} {result.skillType} leveled up to {result.skillLevel}!
              </div>
            )}
            {result.gathered?.map((item, i) => (
              <div key={i} className={TIER_COLORS[item.tier] || 'text-stone-300'}>
                :: {item.name} x{item.quantity}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error Toast ─────────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-3 border text-xs font-mono bg-red-950/20 border-red-900/30 text-red-400">
          {error}
        </div>
      )}

      {/* ── Zone Filter ─────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedZone(null)}
          className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all border ${
            !selectedZone
              ? 'bg-red-900/20 border-red-900/50 text-red-300'
              : 'bg-neutral-900 border-neutral-800 text-stone-500 hover:text-stone-300 hover:border-neutral-600'
          }`}
        >All Zones</button>
        {zones.map(zone => (
          <button
            key={zone}
            onClick={() => setSelectedZone(zone)}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all border ${
              selectedZone === zone
                ? 'bg-red-900/20 border-red-900/50 text-red-300'
                : 'bg-neutral-900 border-neutral-800 text-stone-500 hover:text-stone-300 hover:border-neutral-600'
            }`}
          >{zone}</button>
        ))}
      </div>

      {/* ── Node Grid ───────────────────────────────────────────── */}
      {loading ? (
        <div className="text-stone-600 text-xs font-mono text-center py-12 uppercase tracking-widest animate-pulse">
          Scanning for resource nodes...
        </div>
      ) : filteredNodes.length === 0 ? (
        <div className="text-stone-600 text-xs font-mono text-center py-12 border border-neutral-800 bg-[#020202]">
          No gathering nodes available in this zone.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNodes.map(node => {
            const skillType   = NODE_TO_SKILL[node.node_type] || 'mining';
            const playerSkill = skills.find(s => s.skill_type === skillType);
            const meetsReq    = (playerSkill?.skill_level || 1) >= (node.min_skill_level || 1);
            const cdSeconds   = getCooldownSeconds(node.id);
            const onCooldown  = cdSeconds > 0;
            const canGather   = meetsReq && !onCooldown && (hero?.essence || 0) >= (node.essence_cost || 5);

            return (
              <div
                key={node.id}
                id={`gather-node-${node.id}`}
                className={`
                  border p-4 transition-all
                  ${TIER_BG[node.tier] || 'bg-[#050505]'}
                  ${onCooldown
                    ? 'border-neutral-900 opacity-60'
                    : !meetsReq
                      ? 'border-neutral-900 opacity-40'
                      : `${TIER_BORDERS[node.tier] || 'border-neutral-800'} hover:border-neutral-600`
                  }
                `}
              >
                {/* Node header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className={`font-mono text-sm font-bold ${TIER_COLORS[node.tier] || 'text-stone-300'}`}>
                      {node.name}
                    </div>
                    <div className="text-[10px] text-stone-600 font-mono uppercase tracking-widest">
                      {node.zone_name || node.zone_id}
                    </div>
                  </div>
                  <GameIcon name={SKILL_ICON_KEYS[skillType] || 'mining'} size={20} className="text-stone-600" />
                </div>

                {/* Node stats */}
                <div className="flex gap-4 mb-3 text-[10px] font-mono text-stone-600 uppercase tracking-widest">
                  <span>Req: Lv.<span className={`font-bold ${meetsReq ? 'text-stone-400' : 'text-red-500'}`}>{node.min_skill_level || 1}</span></span>
                  <span>Cost: <span className="text-red-500 font-bold">{node.essence_cost || 5}</span></span>
                  <span>Tier: <span className={TIER_COLORS[node.tier]}>{node.tier}</span></span>
                </div>

                {/* Cooldown timer OR gather button */}
                {onCooldown ? (
                  <div className="flex items-center justify-between border border-neutral-800 bg-[#020202] p-3">
                    <span className="text-[10px] text-stone-600 font-mono uppercase tracking-widest">
                      Respawning
                    </span>
                    {/* Monospace countdown timer */}
                    <span className="text-lg font-mono font-bold text-stone-500 tabular-nums tracking-wider">
                      {formatCooldown(cdSeconds)}
                    </span>
                  </div>
                ) : (
                  <button
                    id={`btn-gather-${node.id}`}
                    onClick={() => handleGather(node.id)}
                    disabled={!canGather || gathering === node.id}
                    className={`
                      w-full py-3 font-mono uppercase tracking-widest text-[11px] font-bold transition-all border
                      ${!canGather || gathering === node.id
                        ? 'bg-neutral-900 border-neutral-800 text-stone-700 cursor-not-allowed'
                        : 'bg-red-950/20 border-red-900/50 text-red-400 hover:bg-red-900/40 hover:text-red-200'
                      }
                    `}
                  >
                    {gathering === node.id
                      ? 'Gathering...'
                      : !meetsReq
                        ? `Locked (Lv.${node.min_skill_level})`
                        : (hero?.essence || 0) < (node.essence_cost || 5)
                          ? 'No Essence'
                          : `Gather (${node.essence_cost || 5} Essence)`
                    }
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
