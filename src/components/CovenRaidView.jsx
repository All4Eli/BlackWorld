'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePlayer } from '@/context/PlayerContext';

const TIER_COLORS = {
  normal: 'text-stone-400',
  hard: 'text-blue-400',
  nightmare: 'text-purple-400',
  inferno: 'text-red-500',
};

const TIER_BORDERS = {
  normal: 'border-stone-700',
  hard: 'border-blue-800',
  nightmare: 'border-purple-800',
  inferno: 'border-red-900',
};

const TIER_BG = {
  normal: 'bg-stone-950/30',
  hard: 'bg-blue-950/20',
  nightmare: 'bg-purple-950/20',
  inferno: 'bg-red-950/20',
};

export default function CovenRaidView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [raid, setRaid] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [myContrib, setMyContrib] = useState({ damage_dealt: 0, hits: 0 });
  const [loading, setLoading] = useState(true);
  const [attacking, setAttacking] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [selectedTier, setSelectedTier] = useState('normal');
  const [combatLog, setCombatLog] = useState([]);
  const [cooldown, setCooldown] = useState(0);
  const [showSummon, setShowSummon] = useState(false);

  const fetchRaid = useCallback(async () => {
    try {
      const res = await fetch('/api/covens/raids');
      const data = await res.json();
      setRaid(data.raid);
      setContributions(data.contributions || []);
      setMyContrib(data.myContribution || { damage_dealt: 0, hits: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRaid(); }, [fetchRaid]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleSummon = async () => {
    setSummoning(true);
    try {
      const res = await fetch('/api/covens/raids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summon', tier: selectedTier }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error);
      setShowSummon(false);
      await fetchRaid();
    } catch (err) {
      alert('Failed to summon raid.');
    } finally {
      setSummoning(false);
    }
  };

  const handleAttack = async () => {
    if (attacking || cooldown > 0) return;
    setAttacking(true);
    try {
      const res = await fetch('/api/covens/raids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attack' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) setCooldown(parseInt(data.error.match(/\d+/)?.[0] || '30'));
        else alert(data.error);
        return;
      }

      // Update hero
      if (data.updatedHero) updateHero(data.updatedHero);

      // Combat log
      const logs = [];
      logs.push(`>> You ${data.isCrit ? 'CRITICALLY ' : ''}hit ${raid.bossName} for ${data.damageDealt} damage!`);
      if (data.dodged) logs.push(`↯ You dodged the counterattack!`);
      else logs.push(`☠ ${raid.bossName} strikes back for ${data.bossDmgToPlayer} damage.`);
      if (data.defeated) {
        logs.push(`>> THE BOSS HAS BEEN SLAIN!`);
        if (data.rewardMessage) logs.push(`★ ${data.rewardMessage}`);
      }
      setCombatLog(prev => [...logs, '─'.repeat(40), ...prev].slice(0, 50));

      // Update local raid state
      setRaid(prev => prev ? { ...prev, bossCurrentHp: data.bossCurrentHp, status: data.defeated ? 'defeated' : 'active' } : null);
      setCooldown(30);

      // Refresh contributions
      if (data.defeated) {
        setTimeout(() => fetchRaid(), 1000);
      }
    } catch (err) {
      alert('Attack failed.');
    } finally {
      setAttacking(false);
    }
  };

  if (loading) return <div className="text-stone-600 font-mono text-xs text-center py-20 uppercase tracking-widest animate-pulse">Scanning for raid activity...</div>;

  const hpPercent = raid ? Math.max(0, (raid.bossCurrentHp / raid.bossMaxHp) * 100) : 0;
  const hpColor = hpPercent > 50 ? 'bg-red-700' : hpPercent > 20 ? 'bg-yellow-600' : 'bg-red-500 animate-pulse';

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
      <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
        ← Back to Coven
      </button>

      {/* No active raid */}
      {!raid || raid.status === 'defeated' ? (
        <div className="border border-neutral-900 bg-[#050505] p-4 sm:p-8 text-center">
          {raid?.status === 'defeated' && (
            <div className="mb-8 p-6 border border-green-900/30 bg-green-950/10">
              <div className="text-green-500 font-serif text-3xl mb-2">{'>'} VICTORY</div>
              <div className="text-stone-400 font-mono text-sm">{raid.bossName} has been vanquished!</div>
            </div>
          )}

          <h2 className="text-xl sm:text-3xl font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] font-serif text-stone-200 mb-4">Raid Summoning</h2>
          <p className="text-stone-500 font-mono text-xs tracking-widest mb-8 max-w-lg mx-auto">
            Summon a world boss for your coven. All members can attack. Rewards are split by damage contribution. Costs 1000g from the treasury.
          </p>

          {!showSummon ? (
            <button onClick={() => setShowSummon(true)} className="px-8 py-4 bg-red-900/30 border border-red-900/50 text-red-300 font-mono uppercase tracking-widest text-sm hover:bg-red-800/40 transition-colors">
              Summon Raid Boss
            </button>
          ) : (
            <div className="max-w-md mx-auto space-y-4 animate-in fade-in duration-300">
              <div className="grid grid-cols-2 gap-3">
                {['normal', 'hard', 'nightmare', 'inferno'].map(t => (
                  <button key={t} onClick={() => setSelectedTier(t)}
                    className={`p-4 border font-mono text-xs uppercase tracking-widest transition-all ${
                      selectedTier === t
                        ? `${TIER_BORDERS[t]} ${TIER_BG[t]} ${TIER_COLORS[t]} shadow-lg`
                        : 'border-neutral-800 text-stone-600 hover:border-neutral-600'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              <button onClick={handleSummon} disabled={summoning}
                className="w-full py-4 bg-red-900/30 border border-red-900/50 text-red-300 font-mono uppercase tracking-widest text-sm hover:bg-red-800/40 disabled:opacity-50 transition-colors">
                {summoning ? 'Summoning...' : 'Confirm Summoning (1000g Treasury)'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Active Raid */}
          <div className={`border-2 ${TIER_BORDERS[raid.bossTier]} ${TIER_BG[raid.bossTier]} p-4 sm:p-8 shadow-[0_0_50px_rgba(153,27,27,0.15)]`}>
            {/* Boss Header */}
            <div className="text-center mb-6">
              <div className={`text-[10px] font-mono uppercase tracking-widest mb-2 ${TIER_COLORS[raid.bossTier]}`}>
                {raid.bossTier} Raid Boss
              </div>
              <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] font-serif text-stone-200 mb-1">{raid.bossName}</h2>
              <div className="text-stone-600 text-[10px] font-mono uppercase tracking-widest">
                Expires: {new Date(raid.expiresAt).toLocaleString()}
              </div>
            </div>

            {/* HP Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-[10px] font-mono uppercase text-stone-500 mb-1">
                <span>Boss HP</span>
                <span className="text-red-500">{raid.bossCurrentHp.toLocaleString()} / {raid.bossMaxHp.toLocaleString()}</span>
              </div>
              <div className="h-4 bg-neutral-900 w-full border border-neutral-800 overflow-hidden">
                <div className={`h-full ${hpColor} transition-all duration-500`} style={{ width: `${hpPercent}%` }} />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6 font-mono text-xs">
              <div className="bg-black/40 border border-neutral-800 p-3 text-center">
                <div className="text-[10px] text-stone-600 uppercase mb-1">Boss DMG</div>
                <div className="text-red-500 text-lg font-bold">{raid.bossDamage}</div>
              </div>
              <div className="bg-black/40 border border-neutral-800 p-3 text-center">
                <div className="text-[10px] text-stone-600 uppercase mb-1">Boss DEF</div>
                <div className="text-stone-400 text-lg font-bold">{raid.bossDefense}</div>
              </div>
              <div className="bg-black/40 border border-neutral-800 p-3 text-center">
                <div className="text-[10px] text-stone-600 uppercase mb-1">Reward Pool</div>
                <div className="text-yellow-600 text-lg font-bold">{raid.rewardGold.toLocaleString()}g</div>
              </div>
            </div>

            {/* Attack Button */}
            <button onClick={handleAttack} disabled={attacking || cooldown > 0}
              className={`w-full py-5 font-mono uppercase tracking-widest text-sm font-bold transition-all ${
                cooldown > 0
                  ? 'bg-neutral-900 border border-neutral-800 text-stone-600 cursor-not-allowed'
                  : 'bg-red-900/40 border-2 border-red-800 text-red-300 hover:bg-red-700/50 hover:text-white shadow-[0_0_30px_rgba(153,27,27,0.3)]'
              }`}>
              {attacking ? 'Attacking...' : cooldown > 0 ? `Cooldown: ${cooldown}s` : '>> Attack Boss (15 Essence)'}
            </button>

            {/* Your Contribution */}
            <div className="mt-4 flex justify-between font-mono text-xs text-stone-500 border-t border-neutral-800 pt-4">
              <span>Your Damage: <span className="text-stone-300 font-bold">{myContrib.damage_dealt.toLocaleString()}</span></span>
              <span>Hits: <span className="text-stone-300 font-bold">{myContrib.hits}</span></span>
            </div>
          </div>

          {/* Combat Log */}
          {combatLog.length > 0 && (
            <div className="border border-neutral-900 bg-[#020202] p-4 max-h-48 overflow-y-auto">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">Combat Log</h3>
              {combatLog.map((log, i) => (
                <div key={i} className={`text-xs font-mono py-0.5 ${
                  log.includes('CRITICALLY') ? 'text-yellow-500' :
                  log.includes('SLAIN') ? 'text-green-500 font-bold' :
                  log.includes('>>') ? 'text-yellow-400' :
                  log.includes('dodged') ? 'text-cyan-400' :
                  log.includes('!!') ? 'text-red-400' :
                  'text-stone-500'
                }`}>{log}</div>
              ))}
            </div>
          )}

          {/* Contribution Leaderboard */}
          <div className="border border-neutral-900 bg-[#050505] p-3 sm:p-6">
            <h3 className="font-serif text-lg uppercase tracking-widest text-stone-400 mb-4">Damage Leaderboard</h3>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-12 gap-4 pb-2 border-b border-neutral-800 text-[10px] text-stone-600 font-mono uppercase tracking-widest">
                <div className="col-span-1">#</div>
                <div className="col-span-5">Player</div>
                <div className="col-span-3 text-center">Hits</div>
                <div className="col-span-3 text-right">Damage</div>
              </div>
              {contributions.length === 0 ? (
                <div className="text-center text-stone-600 font-mono text-xs py-6 italic">No attacks yet.</div>
              ) : (
                contributions.map((c, i) => (
                  <div key={c.player_id} className={`grid grid-cols-12 gap-4 py-2 px-2 font-mono items-center text-sm ${
                    c.player_id === hero?.clerk_user_id ? 'bg-red-950/10 border border-red-900/20' : 'border border-transparent'
                  }`}>
                    <div className="col-span-1 text-stone-500">{i + 1}</div>
                    <div className="col-span-5 text-stone-300 font-bold uppercase tracking-wider text-xs">
                      {c.username}
                      {c.player_id === hero?.clerk_user_id && <span className="text-red-500 ml-2 text-[10px]">(You)</span>}
                    </div>
                    <div className="col-span-3 text-center text-stone-500 text-xs">{c.hits}</div>
                    <div className="col-span-3 text-right text-red-400 font-bold">{c.damage_dealt.toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
