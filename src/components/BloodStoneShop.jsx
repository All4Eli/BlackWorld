'use client';
import { useState, useEffect } from 'react';
import { BLOOD_STONE_PACKS, DARK_PACT, BS_SHOP_ITEMS } from '@/lib/packs';

export default function BloodStoneShop({ hero, updateHero }) {
  const [tab, setTab] = useState('packs');
  const [loading, setLoading] = useState(null);
  const [shopData, setShopData] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/api/shop/premium')
      .then(r => r.json())
      .then(data => setShopData(data))
      .catch(() => {});
  }, []);

  const balance = hero?.blood_stones ?? shopData?.bloodStones ?? 0;
  const isDonator = shopData?.donator || false;
  const isSubscribed = shopData?.subscriptionActive || false;

  const handlePackPurchase = async (packKey) => {
    setLoading(packKey);
    try {
      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pack', packKey }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setMessage({ type: 'error', text: data.error || 'Failed to create checkout' });
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
    setLoading(null);
  };

  const handleSubscribe = async () => {
    setLoading('dark_pact');
    try {
      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subscription' }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setMessage({ type: 'error', text: data.error || 'Failed to create checkout' });
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
    setLoading(null);
  };

  const handleShopPurchase = async (itemKey) => {
    setLoading(itemKey);
    setMessage(null);
    try {
      const res = await fetch('/api/shop/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        if (data.updatedHero) updateHero(data.updatedHero);
        // Refresh shop data
        const refreshed = await fetch('/api/shop/premium').then(r => r.json());
        setShopData(refreshed);
      } else {
        setMessage({ type: 'error', text: data.message || data.error });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
    setLoading(null);
  };

  const tabs = [
    { id: 'packs', label: 'Blood Stone Packs', icon: '💎' },
    { id: 'subscription', label: 'Dark Pact', icon: '🩸' },
    { id: 'shop', label: 'Blood Stone Shop', icon: '🛒' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif text-stone-200 tracking-wide">PREMIUM SHOP</h2>
          <p className="text-stone-500 text-xs font-mono uppercase tracking-widest mt-1">
            Power your ascent through the darkness
          </p>
        </div>
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-900/30 px-4 py-2 rounded-md">
          <span className="text-xl">💎</span>
          <div>
            <p className="text-xs text-stone-500 font-mono uppercase tracking-widest">Blood Stones</p>
            <p className="text-lg font-bold text-red-400">{balance.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Donator Badge */}
      {isDonator && (
        <div className="flex items-center gap-2 bg-amber-950/20 border border-amber-900/30 px-4 py-2 rounded-md">
          <span className="text-amber-400">✦</span>
          <span className="text-amber-300 text-xs font-mono uppercase tracking-widest">
            {isSubscribed ? '✦✦ Dark Pact Active' : '✦ Donator Active'}
          </span>
          {shopData?.donatorExpires && (
            <span className="text-stone-500 text-xs ml-auto">
              Expires: {new Date(shopData.donatorExpires).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-md border text-sm font-mono ${
          message.type === 'success'
            ? 'bg-green-950/30 border-green-900/30 text-green-300'
            : 'bg-red-950/30 border-red-900/30 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-neutral-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-xs font-mono uppercase tracking-widest transition-all ${
              tab === t.id
                ? 'text-red-400 border-b-2 border-red-700 bg-red-950/10'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            <span className="mr-2">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ──── PACKS TAB ──── */}
      {tab === 'packs' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.values(BLOOD_STONE_PACKS).map(pack => (
            <div
              key={pack.key}
              className="bg-[#0a0a0a] border border-neutral-800 rounded-lg p-5 flex flex-col gap-3
                         hover:border-red-900/50 hover:shadow-[0_0_30px_rgba(153,27,27,0.1)] transition-all"
            >
              <div className="text-3xl text-center">{pack.icon}</div>
              <h3 className="text-stone-200 font-serif text-center tracking-wide">{pack.name}</h3>
              <div className="text-center">
                <span className="text-2xl font-bold" style={{ color: pack.color }}>{pack.displayPrice}</span>
              </div>
              <div className="space-y-1 text-xs text-stone-400 font-mono">
                <div className="flex justify-between">
                  <span>Blood Stones</span>
                  <span className="text-red-400">+{pack.bloodStones}</span>
                </div>
                <div className="flex justify-between">
                  <span>Donator Status</span>
                  <span className="text-amber-400">{pack.donatorDays} days</span>
                </div>
                {pack.bonus && (
                  <div className="text-green-400 text-center mt-2 text-[10px]">{pack.bonus}</div>
                )}
              </div>
              <div className="text-[10px] text-stone-600 text-center">
                {(pack.bloodStones / (pack.price / 100)).toFixed(0)} BS per dollar
              </div>
              <button
                onClick={() => handlePackPurchase(pack.key)}
                disabled={loading === pack.key}
                className="mt-auto w-full py-3 bg-red-900/30 border border-red-900/50 text-red-300 font-mono text-xs
                           uppercase tracking-widest rounded hover:bg-red-800/40 transition-colors disabled:opacity-50"
              >
                {loading === pack.key ? 'Processing...' : 'Purchase'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ──── SUBSCRIPTION TAB ──── */}
      {tab === 'subscription' && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-[#0a0a0a] border border-red-900/30 rounded-lg p-6 space-y-6
                          shadow-[0_0_40px_rgba(153,27,27,0.15)]">
            <div className="text-center space-y-2">
              <div className="text-5xl">🩸</div>
              <h3 className="text-2xl font-serif text-red-400 tracking-wide">THE DARK PACT</h3>
              <p className="text-stone-500 text-xs font-mono uppercase tracking-widest">
                The ultimate commitment to power
              </p>
              <div className="text-3xl font-bold text-stone-200">{DARK_PACT.displayPrice}</div>
            </div>

            {/* Value comparison */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-neutral-900/50 rounded p-3 text-center">
                <div className="text-stone-500 uppercase tracking-widest mb-1">Shard Pack</div>
                <div className="text-stone-400">15 BS/$</div>
              </div>
              <div className="bg-red-950/30 rounded p-3 text-center border border-red-900/20">
                <div className="text-red-400 uppercase tracking-widest mb-1">Dark Pact</div>
                <div className="text-red-300 font-bold">75 BS/$</div>
              </div>
            </div>

            {/* Perks */}
            <div className="space-y-2">
              {DARK_PACT.perks.map((perk, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-neutral-900 last:border-0">
                  <span className="text-red-700 mt-0.5">✦</span>
                  <div>
                    <div className="text-stone-300 text-xs font-mono uppercase tracking-widest">{perk.name}</div>
                    <div className="text-stone-500 text-[11px]">{perk.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleSubscribe}
              disabled={loading === 'dark_pact'}
              className={`w-full py-4 font-mono text-sm uppercase tracking-widest rounded transition-all ${
                isSubscribed
                  ? 'bg-amber-950/30 border border-amber-900/50 text-amber-300 hover:bg-amber-900/40'
                  : 'bg-red-800 border border-red-700 text-white hover:bg-red-700 shadow-[0_0_20px_rgba(220,38,38,0.3)]'
              } disabled:opacity-50`}
            >
              {loading === 'dark_pact'
                ? 'Processing...'
                : isSubscribed
                  ? 'Manage Subscription'
                  : 'Subscribe — $5.99/month'}
            </button>

            <p className="text-[10px] text-stone-600 text-center">
              Cancel anytime. Premium benefits remain active until the end of the billing period.
            </p>
          </div>
        </div>
      )}

      {/* ──── SHOP TAB ──── */}
      {tab === 'shop' && (
        <div className="space-y-6">
          {/* Categories */}
          {['utility', 'booster', 'cosmetic', 'permanent'].map(category => {
            const items = BS_SHOP_ITEMS.filter(i => i.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-3 px-1">
                  {category === 'utility' ? '⚗️ Utility' : category === 'booster' ? '🚀 Boosters' : category === 'cosmetic' ? '🎨 Cosmetics' : '🔒 Permanent'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(item => (
                    <div
                      key={item.key}
                      className="bg-[#0a0a0a] border border-neutral-800 rounded-lg p-4 flex items-start gap-3
                                 hover:border-red-900/40 transition-all"
                    >
                      <div className="text-2xl flex-shrink-0">{item.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-stone-200 text-sm font-mono">{item.name}</div>
                        <div className="text-stone-500 text-[11px] mt-0.5">{item.desc}</div>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-red-400 font-mono text-sm font-bold">
                            💎 {item.cost}
                          </span>
                          <button
                            onClick={() => handleShopPurchase(item.key)}
                            disabled={loading === item.key || balance < item.cost}
                            className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded transition-all ${
                              balance >= item.cost
                                ? 'bg-red-900/30 border border-red-900/50 text-red-300 hover:bg-red-800/40'
                                : 'bg-neutral-900 border border-neutral-800 text-stone-600 cursor-not-allowed'
                            } disabled:opacity-50`}
                          >
                            {loading === item.key ? '...' : balance < item.cost ? 'Need More' : 'Buy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
