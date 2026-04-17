'use client';
import { useState, useEffect } from 'react';

export default function ItemShopView({ hero, updateHero, onBack }) {
  const currentGold = hero?.gold || 0;
  const [purchaseMsg, setPurchaseMsg] = useState(null);
  const [shopItems, setShopItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);

  const [tab, setTab] = useState('BUY');

  // Fetch shop items from server
  useEffect(() => {
    const fetchShop = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/shop?level=${hero?.level || 1}`);
        const data = await res.json();
        if (data.items) setShopItems(data.items);
      } catch (err) {
        console.error('Failed to load shop:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchShop();
  }, [hero?.level]);

  const handleBuy = async (item) => {
    if (currentGold < item.cost || buying) return;
    
    setBuying(item.id);
    try {
      const res = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, itemCost: item.cost })
      });
      const data = await res.json();
      
      if (res.ok) {
        updateHero(data.updatedHero);
        setShopItems(prev => prev.filter(i => i.id !== item.id));
        setPurchaseMsg(`Purchased: ${data.item.name}`);
        setTimeout(() => setPurchaseMsg(null), 3000);
      } else {
        setPurchaseMsg(`Error: ${data.error}`);
        setTimeout(() => setPurchaseMsg(null), 3000);
      }
    } catch (err) {
      setPurchaseMsg('Purchase failed.');
      setTimeout(() => setPurchaseMsg(null), 3000);
    } finally {
      setBuying(null);
    }
  };

  const handleSell = async (item) => {
      // Basic sell calculation
      const baseValues = { COMMON: 20, UNCOMMON: 50, RARE: 150, EPIC: 400, LEGENDARY: 1000, CELESTIAL: 3000 };
      const sellValue = baseValues[item.rarity || 'COMMON'] || 10;
      
      if (buying) return;
      setBuying(item.id || item.name); // Using name for materials without IDs

      try {
          const res = await fetch('/api/shop/sell', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ itemId: item.id, itemName: item.name }) // fallback to name if no id
          });
          const data = await res.json();
          if (res.ok) {
              updateHero(data.updatedHero);
              setPurchaseMsg(`Sold ${item.name} for ${data.goldAwarded}g`);
          } else {
              setPurchaseMsg(`Error: ${data.error}`);
          }
      } catch(err) {
          setPurchaseMsg('Sell failed.');
      } finally {
          setBuying(null);
          setTimeout(() => setPurchaseMsg(null), 3000);
      }
  };

  const getTierColor = (tier) => {
    switch(tier) {
      case 'COMMON': return 'text-stone-400 border-stone-800';
      case 'UNCOMMON': return 'text-green-500 border-green-900/50';
      case 'RARE': return 'text-blue-500 border-blue-900/50';
      case 'EPIC': return 'text-purple-500 border-purple-900/50';
      case 'LEGENDARY': return 'text-yellow-500 border-yellow-600/50';
      case 'CELESTIAL': return 'text-cyan-400 border-cyan-800/50';
      default: return 'text-stone-400';
    }
  };

  const isEquipped = (art) => {
     if (!hero?.equipped) return hero?.equippedWeapon?.id === art.id || hero?.equippedArmor?.id === art.id;
     return Object.values(hero.equipped).some(item => item?.id === art.id);
  };

  const sellableItems = (hero?.artifacts || []).filter(art => !isEquipped(art));

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
      <div className="flex justify-between items-center mb-2">
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest">
          ← Back to City Directory
        </button>
        <div className="font-mono text-xs text-stone-500 uppercase tracking-widest">
           Pouch: <span className="text-yellow-600 font-bold">{currentGold.toLocaleString()}g</span>
        </div>
      </div>

      <div className="border border-neutral-900 bg-[#050505]">
        
        <div className="flex border-b border-red-900/30">
           <button onClick={() => setTab('BUY')} className={`flex-1 py-4 uppercase font-serif tracking-widest transition-colors ${tab==='BUY' ? 'bg-red-950/20 text-stone-200 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Buy</button>
           <button onClick={() => setTab('SELL')} className={`flex-1 py-4 uppercase font-serif tracking-widest transition-colors ${tab==='SELL' ? 'bg-red-950/20 text-stone-200 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Sell</button>
        </div>

        <div className="p-8 min-h-[400px]">
             <div className="flex justify-between items-end mb-8 border-b border-neutral-800 pb-4">
               <div>
                  <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200">The Merchant</h2>
                  <p className="text-stone-500 font-mono text-xs tracking-widest mt-1">"Artifacts of power for those with the coin."</p>
               </div>
               {purchaseMsg && (
                <div className="text-green-500 font-mono text-xs uppercase tracking-widest animate-pulse border border-green-900/30 bg-green-950/20 px-4 py-2">
                  {purchaseMsg}
                </div>
               )}
             </div>

            {tab === 'BUY' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {loading ? (
                    <div className="text-stone-600 font-mono italic p-4 border border-neutral-900 animate-pulse">The merchant is arranging wares...</div>
                ) : shopItems.length === 0 ? (
                    <div className="text-stone-600 font-mono italic p-4 border border-neutral-900">The merchant's stock is empty. Return later.</div>
                ) : shopItems.map((item, idx) => (
                    <div key={item.id} className="flex flex-col xl:flex-row justify-between bg-[#020202] border border-neutral-800 p-4 font-mono group hover:border-neutral-700 transition-colors">
                    <div className="flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-1">
                        <h3 className={`font-bold uppercase tracking-widest text-sm ${getTierColor(item.rarity).split(' ')[0]}`}>
                            {item.name}
                        </h3>
                        <span className={`text-[9px] px-2 py-0.5 border ${getTierColor(item.rarity)}`}>
                            {item.rarity}
                        </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-600 uppercase tracking-widest mb-3">
                        <span>Type: <span className="text-stone-400">{item.type}</span></span>
                        {item.stats?.dmg > 0 && <span className="text-red-500">+{item.stats.dmg} DMG</span>}
                        {item.stats?.def > 0 && <span className="text-stone-400">+{item.stats.def} DEF</span>}
                        {item.stats?.hp > 0 && <span className="text-stone-300">+{item.stats.hp} HP</span>}
                        {item.stats?.crit > 0 && <span className="text-yellow-500">+{item.stats.crit}% CRIT</span>}
                        {item.stats?.magicDmg > 0 && <span className="text-purple-400">+{item.stats.magicDmg} MAGIC</span>}
                        {item.stats?.lifesteal > 0 && <span className="text-red-400">+{item.stats.lifesteal} LIFESTEAL</span>}
                        </div>
                    </div>

                    <div className="mt-4 xl:mt-0 flex flex-col justify-between items-end border-t xl:border-t-0 xl:border-l border-neutral-800 pt-4 xl:pt-0 xl:pl-4 min-w-[120px]">
                        <div className="text-lg font-bold text-yellow-600 mb-4">{item.cost.toLocaleString()}g</div>
                        <button 
                        onClick={() => handleBuy(item)}
                        disabled={currentGold < item.cost || buying === item.id}
                        className="w-full py-2 bg-black border border-neutral-700 text-stone-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest text-xs"
                        >
                        {buying === item.id ? '...' : 'Buy'}
                        </button>
                    </div>
                    </div>
                ))}
                </div>
            )}

            {tab === 'SELL' && (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                   {sellableItems.length === 0 ? (
                       <div className="text-stone-600 font-mono italic p-4 border border-neutral-900 col-span-2">You have nothing of value to sell.</div>
                   ) : sellableItems.map((item, idx) => {
                       const baseValues = { COMMON: 20, UNCOMMON: 50, RARE: 150, EPIC: 400, LEGENDARY: 1000, CELESTIAL: 3000 };
                       const sellValue = baseValues[item.rarity || 'COMMON'] || 10;
                       
                       return (
                           <div key={idx} className="flex flex-col xl:flex-row justify-between bg-[#020202] border border-neutral-800 p-4 font-mono group hover:border-neutral-700 transition-colors">
                              <div className="flex-1 pr-4">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className={`font-bold uppercase tracking-widest text-sm ${getTierColor(item.rarity).split(' ')[0]}`}>{item.name}</h3>
                                    {item.rarity && <span className={`text-[9px] px-2 py-0.5 border ${getTierColor(item.rarity)}`}>{item.rarity}</span>}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-600 uppercase tracking-widest mb-3">
                                   <span>Type: <span className="text-stone-400">{item.type}</span></span>
                                </div>
                              </div>
                              <div className="mt-4 xl:mt-0 flex flex-col justify-between items-end border-t xl:border-t-0 xl:border-l border-neutral-800 pt-4 xl:pt-0 xl:pl-4 min-w-[120px]">
                                <div className="text-lg font-bold text-yellow-600 mb-4">+{sellValue}g</div>
                                <button onClick={() => handleSell(item)} disabled={buying === (item.id || item.name)} className="w-full py-2 bg-neutral-900 border border-neutral-700 text-stone-300 hover:text-white hover:border-stone-500 transition-colors uppercase tracking-widest text-xs">
                                   {buying === (item.id || item.name) ? '...' : 'Sell'}
                                </button>
                              </div>
                           </div>
                       )
                   })}
               </div>
            )}
        </div>
      </div>
    </div>
  );
}
