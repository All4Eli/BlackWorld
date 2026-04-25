'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

// ═══════════════════════════════════════════════════════════════════
// ItemShopView — Buy from NPCs, Sell from inventory
// ═══════════════════════════════════════════════════════════════════
//
// BUY TAB:
//   GET  /api/shop?npcKey=shadow_merchant → shop items
//   POST /api/shop  body: { itemKey, quantity }
//
// SELL TAB:
//   GET  /api/inventory → player's inventory (normalized table)
//   POST /api/shop/sell body: { inventoryId, quantity }
//
// FIELD MAPPINGS:
//   API returns: { item_key, name, price, tier, base_stats, ... }
//   (NOT the legacy: { id, cost, rarity, stats })
// ═══════════════════════════════════════════════════════════════════

export default function ItemShopView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const currentGold = hero?.gold || 0;
  const [purchaseMsg, setPurchaseMsg] = useState(null);
  const [shopItems, setShopItems] = useState([]);
  const [sellableItems, setSellableItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [tab, setTab] = useState('BUY');

  // ── Fetch shop items from normalized API ──────────────────────
  useEffect(() => {
    const fetchShop = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/shop?npcKey=shadow_merchant`);
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

  // ── Fetch sellable items from inventory API ───────────────────
  useEffect(() => {
    if (tab !== 'SELL') return;
    const fetchInventory = async () => {
      try {
        const res = await fetch('/api/inventory');
        if (!res.ok) return;
        const data = await res.json();
        // Only show unlocked items (not equipped or auctioned)
        setSellableItems((data.items || []).filter(i => !i.is_locked));
      } catch (err) {
        console.error('Failed to load inventory for sell:', err);
      }
    };
    fetchInventory();
  }, [tab]);

  // ── Buy handler (sends itemKey, not itemId) ───────────────────
  const handleBuy = async (item) => {
    if (currentGold < (item.price || 0) || buying) return;
    
    setBuying(item.item_key || item.item_id);
    try {
      const res = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Server expects { itemKey, quantity } — NOT { itemId, itemCost }
        body: JSON.stringify({ itemKey: item.item_key, quantity: 1 })
      });
      const data = await res.json();
      
      if (res.ok) {
        // Update gold in context via updatedHero shallow merge
        if (data.updatedHero) updateHero(data.updatedHero);
        else updateHero({ gold: data.goldRemaining });

        // Sync the sell tab's inventory from the server response
        // so newly purchased items appear without a page reload
        if (data.inventory) {
          setSellableItems(data.inventory.filter(i => !i.is_locked));
        }

        setPurchaseMsg(`Purchased: ${data.purchased?.itemName || item.name}`);
        setTimeout(() => setPurchaseMsg(null), 3000);
      } else {
        // Prioritize human-readable message over error code
        setPurchaseMsg(`Error: ${data.message || data.error}`);
        setTimeout(() => setPurchaseMsg(null), 3000);
      }
    } catch (err) {
      setPurchaseMsg('Purchase failed.');
      setTimeout(() => setPurchaseMsg(null), 3000);
    } finally {
      setBuying(null);
    }
  };

  // ── Sell handler (sends inventoryId, not itemName) ────────────
  const handleSell = async (item) => {
    if (buying) return;
    setBuying(item.inventory_id);

    try {
      const res = await fetch('/api/shop/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Server expects { inventoryId, quantity }
        body: JSON.stringify({ inventoryId: item.inventory_id, quantity: 1 })
      });
      const data = await res.json();
      if (res.ok) {
        // Update gold in context via updatedHero shallow merge
        if (data.updatedHero) updateHero(data.updatedHero);
        else updateHero({ gold: data.goldTotal });

        // Sync inventory from server response (authoritative)
        if (data.inventory) {
          setSellableItems(data.inventory.filter(i => !i.is_locked));
        } else {
          // Fallback: optimistic removal if server didn't return inventory
          setSellableItems(prev => prev.filter(i => i.inventory_id !== item.inventory_id));
        }

        setPurchaseMsg(`Sold ${item.item_name || item.custom_name} for ${data.goldEarned}g`);
      } else {
        setPurchaseMsg(`Error: ${data.message || data.error}`);
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
                ) : shopItems.map((item, idx) => {
                    const stats = item.base_stats || {};
                    const price = item.price || 0;
                    const tier = item.tier || 'COMMON';
                    
                    return (
                    <div key={item.item_id || idx} className="flex flex-col xl:flex-row justify-between bg-[#020202] border border-neutral-800 p-4 font-mono group hover:border-neutral-700 transition-colors">
                    <div className="flex-1 pr-4">
                        <div className="flex items-center gap-3 mb-1">
                        <h3 className={`font-bold uppercase tracking-widest text-sm ${getTierColor(tier).split(' ')[0]}`}>
                            {item.name}
                        </h3>
                        <span className={`text-[9px] px-2 py-0.5 border ${getTierColor(tier)}`}>
                            {tier}
                        </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-600 uppercase tracking-widest mb-3">
                        <span>Type: <span className="text-stone-400">{item.type}</span></span>
                        {stats.dmg > 0 && <span className="text-red-500">+{stats.dmg} DMG</span>}
                        {stats.def > 0 && <span className="text-stone-400">+{stats.def} DEF</span>}
                        {stats.hp > 0 && <span className="text-stone-300">+{stats.hp} HP</span>}
                        {stats.crit > 0 && <span className="text-yellow-500">+{stats.crit}% CRIT</span>}
                        {stats.magicDmg > 0 && <span className="text-purple-400">+{stats.magicDmg} MAGIC</span>}
                        {stats.lifesteal > 0 && <span className="text-red-400">+{stats.lifesteal} LIFESTEAL</span>}
                        </div>
                    </div>

                    <div className="mt-4 xl:mt-0 flex flex-col justify-between items-end border-t xl:border-t-0 xl:border-l border-neutral-800 pt-4 xl:pt-0 xl:pl-4 min-w-[120px]">
                        <div className="text-lg font-bold text-yellow-600 mb-4">{price.toLocaleString()}g</div>
                        <button 
                        onClick={() => handleBuy(item)}
                        disabled={currentGold < price || buying === (item.item_key || item.item_id)}
                        className="w-full py-2 bg-black border border-neutral-700 text-stone-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest text-xs"
                        >
                        {buying === (item.item_key || item.item_id) ? '...' : 'Buy'}
                        </button>
                    </div>
                    </div>
                )})}
                </div>
            )}

            {tab === 'SELL' && (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                   {sellableItems.length === 0 ? (
                       <div className="text-stone-600 font-mono italic p-4 border border-neutral-900 col-span-2">You have nothing of value to sell.</div>
                   ) : sellableItems.map((item) => {
                       const sellValue = item.sell_price || 0;
                       const canSell = sellValue > 0;
                       
                       return (
                           <div key={item.inventory_id} className="flex flex-col xl:flex-row justify-between bg-[#020202] border border-neutral-800 p-4 font-mono group hover:border-neutral-700 transition-colors">
                              <div className="flex-1 pr-4">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className={`font-bold uppercase tracking-widest text-sm ${getTierColor(item.item_tier).split(' ')[0]}`}>{item.custom_name || item.item_name}</h3>
                                    <span className={`text-[9px] px-2 py-0.5 border ${getTierColor(item.item_tier)}`}>{item.item_tier}</span>
                                    {item.quantity > 1 && <span className="text-stone-500 text-xs">x{item.quantity}</span>}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-600 uppercase tracking-widest mb-3">
                                   <span>Type: <span className="text-stone-400">{item.item_type}</span></span>
                                </div>
                              </div>
                              <div className="mt-4 xl:mt-0 flex flex-col justify-between items-end border-t xl:border-t-0 xl:border-l border-neutral-800 pt-4 xl:pt-0 xl:pl-4 min-w-[120px]">
                                <div className={`text-lg font-bold mb-4 ${canSell ? 'text-yellow-600' : 'text-stone-700'}`}>
                                  {canSell ? `+${sellValue}g` : 'No Value'}
                                </div>
                                <button onClick={() => handleSell(item)} disabled={!canSell || buying === item.inventory_id} className="w-full py-2 bg-neutral-900 border border-neutral-700 text-stone-300 hover:text-white hover:border-stone-500 transition-colors uppercase tracking-widest text-xs disabled:opacity-30 disabled:cursor-not-allowed">
                                   {buying === item.inventory_id ? '...' : canSell ? 'Sell' : 'Unsellable'}
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
