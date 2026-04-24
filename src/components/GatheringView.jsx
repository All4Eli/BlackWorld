'use client';
import { useState, useEffect } from 'react';

const SKILL_ICONS = {
  mining: '⛏️', herbalism: '🌿', woodcutting: '🪓', gemcraft: '💎', skinning: '🔪',
};

const TIER_COLORS = {
  COMMON: 'text-stone-400', UNCOMMON: 'text-green-400', RARE: 'text-blue-400',
  EPIC: 'text-purple-400', LEGENDARY: 'text-amber-400',
};

export default function GatheringView({ hero, updateHero, onBack }) {
  const [skills, setSkills] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gathering, setGathering] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);

  useEffect(() => {
    fetch('/api/gathering')
      .then(r => r.json())
      .then(data => {
        setSkills(data.skills || []);
        setNodes(data.nodes || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const gather = async (nodeId) => {
    setGathering(nodeId);
    setResult(null);
    try {
      const res = await fetch('/api/gathering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        if (data.updatedHero) updateHero(data.updatedHero);
        // Update local skill state
        setSkills(prev => {
          const idx = prev.findIndex(s => s.skill_type === data.skillType);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], skill_level: data.skillLevel, skill_xp: data.skillXP };
            return copy;
          }
          return [...prev, { skill_type: data.skillType, skill_level: data.skillLevel, skill_xp: data.skillXP }];
        });
      } else {
        setResult({ error: data.error });
      }
    } catch {
      setResult({ error: 'Network error' });
    }
    setGathering(null);
  };

  // Group nodes by zone
  const zones = [...new Set(nodes.map(n => n.zone_name || n.zone_id))];
  const filteredNodes = selectedZone ? nodes.filter(n => (n.zone_name || n.zone_id) === selectedZone) : nodes;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif text-stone-200 tracking-wide">GATHERING</h2>
          <p className="text-stone-500 text-xs font-mono uppercase tracking-widest mt-1">
            Harvest resources from the land
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-stone-600 hover:text-stone-300 text-xs font-mono uppercase tracking-widest transition-colors">
            ← Back
          </button>
        )}
      </div>

      {/* Skills Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {['mining', 'herbalism', 'woodcutting', 'gemcraft', 'skinning'].map(type => {
          const skill = skills.find(s => s.skill_type === type);
          const level = skill?.skill_level || 1;
          const xp = skill?.skill_xp || 0;
          const xpNeeded = level * 100;
          return (
            <div key={type} className="bg-[#0a0a0a] border border-neutral-800 rounded-lg p-3 text-center">
              <div className="text-2xl mb-1">{SKILL_ICONS[type]}</div>
              <div className="text-stone-300 text-xs font-mono uppercase tracking-widest">{type}</div>
              <div className="text-red-400 font-bold text-lg">Lv.{level}</div>
              <div className="w-full bg-neutral-800 rounded-full h-1 mt-1">
                <div className="bg-red-700 rounded-full h-1 transition-all"
                  style={{ width: `${(xp / xpNeeded) * 100}%` }} />
              </div>
              <div className="text-[10px] text-stone-600 mt-1">{xp}/{xpNeeded} XP</div>
            </div>
          );
        })}
      </div>

      {/* Essence */}
      <div className="flex items-center gap-3 bg-red-950/20 border border-red-900/20 px-4 py-2 rounded-md">
        <span className="text-red-500 text-sm">⚗️</span>
        <span className="text-xs font-mono text-stone-500 uppercase tracking-widest">Blood Essence</span>
        <span className="text-red-400 font-bold ml-auto">{hero?.essence ?? 0} / {hero?.max_essence ?? 100}</span>
        <span className="text-stone-600 text-[10px]">(−5 per gather)</span>
      </div>

      {/* Result */}
      {result && (
        <div className={`px-4 py-3 rounded-md border text-xs font-mono ${
          result.error
            ? 'bg-red-950/30 border-red-900/30 text-red-300'
            : 'bg-green-950/30 border-green-900/30 text-green-300'
        }`}>
          {result.error ? (
            result.error
          ) : (
            <div className="space-y-1">
              <div>✓ Gathered successfully! (+{result.gatherXP} {result.skillType} XP)</div>
              {result.leveledUp && <div className="text-amber-400">⚡ {result.skillType} leveled up to {result.skillLevel}!</div>}
              {result.gathered?.map((item, i) => (
                <div key={i} className={TIER_COLORS[item.tier] || 'text-stone-300'}>
                  → {item.name} ×{item.quantity}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zone Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedZone(null)}
          className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded transition-all ${
            !selectedZone ? 'bg-red-900/30 border border-red-900/50 text-red-300' : 'bg-neutral-900 border border-neutral-800 text-stone-500 hover:text-stone-300'
          }`}
        >All Zones</button>
        {zones.map(zone => (
          <button
            key={zone}
            onClick={() => setSelectedZone(zone)}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded transition-all ${
              selectedZone === zone ? 'bg-red-900/30 border border-red-900/50 text-red-300' : 'bg-neutral-900 border border-neutral-800 text-stone-500 hover:text-stone-300'
            }`}
          >{zone}</button>
        ))}
      </div>

      {/* Nodes */}
      {loading ? (
        <div className="text-stone-600 text-xs font-mono text-center py-8">Loading gathering nodes...</div>
      ) : filteredNodes.length === 0 ? (
        <div className="text-stone-600 text-xs font-mono text-center py-8">No gathering nodes available.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNodes.map(node => {
            const skill = skills.find(s => s.skill_type === ({'ore':'mining','herb':'herbalism','wood':'woodcutting','gem':'gemcraft','essence':'mining','skin':'skinning'})[node.node_type]);
            const meetsReq = !node.min_skill_level || (skill?.skill_level || 1) >= node.min_skill_level;
            return (
              <div
                key={node.id}
                className={`bg-[#0a0a0a] border rounded-lg p-4 transition-all ${
                  meetsReq ? 'border-neutral-800 hover:border-red-900/40' : 'border-neutral-900 opacity-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className={`font-mono text-sm ${TIER_COLORS[node.tier] || 'text-stone-300'}`}>
                      {node.name}
                    </div>
                    <div className="text-[10px] text-stone-600 font-mono">{node.zone_name || node.zone_id}</div>
                  </div>
                  <span className="text-lg">{SKILL_ICONS[({'ore':'mining','herb':'herbalism','wood':'woodcutting','gem':'gemcraft','essence':'mining','skin':'skinning'})[node.node_type]] || '🪨'}</span>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="text-[10px] text-stone-600 font-mono space-y-0.5">
                    <div>Requires: Lv.{node.min_skill_level || 1}</div>
                    <div>Type: {node.node_type}</div>
                  </div>
                  <button
                    onClick={() => gather(node.id)}
                    disabled={gathering || !meetsReq || (hero?.essence || 0) < 5}
                    className="px-4 py-2 bg-red-900/30 border border-red-900/50 text-red-300 text-[10px] font-mono
                               uppercase tracking-widest rounded hover:bg-red-800/40 transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {gathering === node.id ? 'Gathering...' : !meetsReq ? 'Locked' : 'Gather'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
