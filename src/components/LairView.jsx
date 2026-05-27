'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import { GameIcon } from '@/components/icons/GameIcons';

export default function LairView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [loading, setLoading] = useState(true);
  const [lairData, setLairData] = useState(null);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadLairs() {
      try {
        const res = await fetch('/api/lairs/my');
        if (res.ok) {
          const data = await res.json();
          setLairData(data.lair);
          setTypes(data.types || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadLairs();
  }, []);

  const handleBuy = async (type) => {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lairs/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lairType: type.type })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error);
        return;
      }
      setLairData(data.lair);
      updateHero({ gold: hero.gold - type.base_cost });
    } catch (err) {
      setError('Transaction failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setActionLoading(true);
    setError('');
    try {
      const typeInfo = types.find(t => t.type === lairData.lair_type);
      const upgradeCost = Math.floor(typeInfo.base_cost * Math.pow(1.5, lairData.tier));
      
      const res = await fetch('/api/lairs/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error);
        return;
      }
      setLairData(data.lair);
      updateHero({ gold: hero.gold - upgradeCost });
    } catch (err) {
      setError('Upgrade failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-red-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left mb-4">
        ← Back to City Directory
      </button>

      <div className="border border-neutral-900 bg-[#050505] p-10 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2">Real Estate</h2>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center leading-relaxed max-w-md mb-10">
          A place to call your own. Upgrading your lair increases your bank limit and maximum essence capacity.
        </p>

        <div className="w-full flex justify-between font-mono text-xs text-stone-500 mb-6 uppercase tracking-widest border-b border-neutral-800 pb-2">
          <span>Available Gold: <span className="text-yellow-600 font-bold">{hero.gold?.toLocaleString() || 0}g</span></span>
        </div>

        {error && <div className="text-red-500 text-xs text-center border border-red-900/50 bg-red-950/20 p-2 w-full mb-6">{error}</div>}

        {lairData ? (
          <div className="w-full border border-neutral-800 bg-[#020202] p-8 flex flex-col items-center mb-8">
            <h3 className="text-2xl text-red-700 font-bold uppercase tracking-widest mb-1">{lairData.custom_name || lairData.lair_type}</h3>
            <span className="text-stone-400 font-mono text-xs uppercase tracking-widest mb-6">Tier {lairData.tier}</span>
            
            <div className="w-full grid grid-cols-2 gap-4 text-center font-mono text-sm mb-8">
              <div className="border border-neutral-900 bg-[#080808] py-4">
                <div className="text-[10px] text-stone-600 uppercase mb-1">Bank Bonus</div>
                <div className="text-stone-300">+{(lairData.bank_bonus * lairData.tier)?.toLocaleString() || 0}g</div>
              </div>
              <div className="border border-neutral-900 bg-[#080808] py-4">
                <div className="text-[10px] text-stone-600 uppercase mb-1">Essence Bonus</div>
                <div className="text-stone-300">+{lairData.essence_bonus * lairData.tier || 0}</div>
              </div>
            </div>

            {(() => {
               const typeInfo = types.find(t => t.type === lairData.lair_type);
               if (!typeInfo) return null;
               const upgradeCost = Math.floor(typeInfo.base_cost * Math.pow(1.5, lairData.tier));
               return (
                 <button 
                   onClick={handleUpgrade}
                   disabled={actionLoading || hero.gold < upgradeCost}
                   className="w-full py-4 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-900/40 hover:text-red-200 transition-colors uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   Upgrade Lair ({upgradeCost.toLocaleString()}g)
                 </button>
               );
            })()}
          </div>
        ) : (
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
            {types.map(t => (
              <div key={t.type} className="border border-neutral-800 bg-[#020202] p-6 flex flex-col items-center">
                <span className="text-lg font-bold text-stone-200 uppercase tracking-widest mb-2">{t.type}</span>
                <span className="text-xs text-stone-500 font-mono uppercase tracking-widest mb-4">Base Estate</span>
                
                <div className="text-center font-mono text-[10px] text-stone-400 mb-6 space-y-1">
                  <div>+{t.bank_bonus.toLocaleString()} Bank Limit</div>
                  <div>+{t.essence_bonus} Max Essence</div>
                </div>

                <button 
                  onClick={() => handleBuy(t)}
                  disabled={actionLoading || hero.gold < t.base_cost}
                  className="w-full py-2 border border-neutral-800 bg-black text-yellow-600 hover:border-yellow-700 hover:text-yellow-500 transition-colors uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Buy ({t.base_cost.toLocaleString()}g)
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
