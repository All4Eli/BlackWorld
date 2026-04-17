'use client';
import { useState } from 'react';

// Static Merchant Inventory
const SHOP_ITEMS = [
  { name: 'Iron Longsword', type: 'WEAPON', stat: 8, cost: 150, desc: 'A basic but sturdy blade.', tier: 'COMMON' },
  { name: 'Rusted Chainmail', type: 'ARMOR', stat: 20, cost: 120, desc: 'Offers minor protection from slashing.', tier: 'COMMON' },
  { name: 'Blood-Steel Axe', type: 'WEAPON', stat: 18, cost: 650, desc: 'Heavy and stained with the past.', tier: 'UNCOMMON' },
  { name: 'Sanctified Half-Plate', type: 'ARMOR', stat: 60, cost: 800, desc: 'Blessed by the Hollow Priests.', tier: 'UNCOMMON' },
  { name: 'The Obsidian Cleaver', type: 'WEAPON', stat: 35, cost: 2500, desc: 'An unnaturally sharp shard of void glass.', tier: 'RARE' },
  { name: 'Carapace of the Void', type: 'ARMOR', stat: 120, cost: 3200, desc: 'Pulsing with dark energy. Very heavy.', tier: 'RARE' },
  { name: 'Sovereign Demise (Scythe)', type: 'WEAPON', stat: 65, cost: 10000, desc: 'The weapon of a fallen king.', tier: 'LEGENDARY' },
];

export default function ItemShopView({ hero, updateHero, onBack }) {
  const currentGold = hero?.gold || 0;
  const [purchaseMsg, setPurchaseMsg] = useState(null);

  const handleBuy = (item) => {
    if (currentGold >= item.cost) {
      const boughtItem = { 
        name: item.name, 
        type: item.type, 
        stat: item.stat, 
        id: Math.random().toString(36).substr(2, 9) 
      };
      
      updateHero({
        ...hero,
        gold: currentGold - item.cost,
        artifacts: [...(hero.artifacts || []), boughtItem]
      });

      setPurchaseMsg(`Purchased: ${item.name}`);
      setTimeout(() => setPurchaseMsg(null), 3000);
    }
  };

  const getTierColor = (tier) => {
    switch(tier) {
      case 'COMMON': return 'text-stone-400 border-stone-800';
      case 'UNCOMMON': return 'text-green-500 border-green-900/50';
      case 'RARE': return 'text-blue-500 border-blue-900/50';
      case 'LEGENDARY': return 'text-yellow-500 border-yellow-600/50';
      default: return 'text-stone-400';
    }
  };

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

      <div className="border border-neutral-900 bg-[#050505] p-8">
        <div className="flex justify-between items-end border-b border-red-900/30 pb-4 mb-8">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {SHOP_ITEMS.map((item, idx) => (
            <div key={idx} className="flex flex-col md:flex-row justify-between bg-[#020202] border border-neutral-800 p-4 font-mono group hover:border-neutral-700 transition-colors">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className={`font-bold uppercase tracking-widest text-sm ${getTierColor(item.tier).split(' ')[0]}`}>
                    {item.name}
                  </h3>
                  <span className={`text-[9px] px-2 py-0.5 border ${getTierColor(item.tier)}`}>
                    {item.tier}
                  </span>
                </div>
                <div className="flex gap-4 text-[10px] text-stone-600 uppercase tracking-widest mb-3">
                  <span>Type: <span className="text-stone-400">{item.type}</span></span>
                  <span>Power: <span className="text-stone-400">+{item.stat} {item.type === 'WEAPON' ? 'DMG' : 'HP'}</span></span>
                </div>
                <p className="text-xs text-stone-500 italic max-w-sm">{item.desc}</p>
              </div>

              <div className="mt-4 md:mt-0 flex flex-col justify-between items-end border-t md:border-t-0 md:border-l border-neutral-800 pt-4 md:pt-0 md:pl-4 min-w-[120px]">
                <div className="text-lg font-bold text-yellow-600 mb-4">{item.cost.toLocaleString()}g</div>
                <button 
                  onClick={() => handleBuy(item)}
                  disabled={currentGold < item.cost}
                  className="w-full py-2 bg-black border border-neutral-700 text-stone-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest text-xs"
                >
                  Buy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
