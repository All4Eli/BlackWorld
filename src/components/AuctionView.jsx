'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

// ═══════════════════════════════════════════════════════════════════
// AuctionView — Global Market + Sell from normalized inventory
// ═══════════════════════════════════════════════════════════════════
//
// MIGRATED FROM hero.artifacts (dead JSONB blob) to:
//   GET /api/inventory → normalized inventory table JOINed with items catalog
//
// SELL TAB: Fetches from /api/inventory for item listing
// BUY TAB:  Fetches from /api/auction for market listings
// ═══════════════════════════════════════════════════════════════════

export default function AuctionView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [tab, setTab] = useState('MARKET');
  const [listings, setListings] = useState([]);
  const [sellableItems, setSellableItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sellPrice, setSellPrice] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const currentGold = hero?.gold || 0;

  const fetchListings = () => {
    setLoading(true);
    fetch('/api/auction')
      .then(res => res.json())
      .then(data => {
         if (data.auctions) setListings(data.auctions);
         setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  };

  // Fetch inventory for sell tab from normalized API
  const fetchSellableItems = async () => {
    try {
      const res = await fetch('/api/inventory');
      if (!res.ok) return;
      const data = await res.json();
      setSellableItems((data.items || []).filter(i => !i.is_locked));
    } catch (err) {
      console.error('[AuctionView] Inventory fetch failed:', err);
    }
  };

  useEffect(() => {
    if (tab === 'MARKET') fetchListings();
    if (tab === 'SELL') fetchSellableItems();
  }, [tab]);

  const showMessage = (msg) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleBuy = async (auction) => {
    if (currentGold < auction.buyout_price) return;
    setIsProcessing(true);
    try {
       const res = await fetch('/api/auction/buy', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ auctionId: auction.id })
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error);
       if (data.updatedHero) updateHero(data.updatedHero);
       const itemName = auction.item_name || 'item';
       const taxMsg = data.taxAmount > 0 ? ` (${data.taxAmount}g tax applied)` : '';
       showMessage(`Purchased: ${itemName}${taxMsg}`);
       fetchListings();
    } catch(err) {
       showMessage(`Error: ${err.message}`);
    } finally {
       setIsProcessing(false);
    }
  };

  const handleList = async () => {
     const price = parseInt(sellPrice);
     if (!selectedItem || isNaN(price) || price <= 0) return;

     setIsProcessing(true);
     try {
         const res = await fetch('/api/auction/list', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               inventoryId: selectedItem.inventory_id,
               buyoutPrice: price,
             })
         });
         const data = await res.json();
         if (!res.ok) throw new Error(data.error);

         if (data.updatedHero) updateHero(data.updatedHero);

         // Sync inventory from server response (item now locked)
         if (data.inventory) {
           setSellableItems(data.inventory.filter(i => !i.is_locked));
         } else {
           setSellableItems(prev => prev.filter(i => i.inventory_id !== selectedItem.inventory_id));
         }
         setSelectedItem(null);
         setSellPrice('');
         const fee = data.listingFee || Math.ceil(price * 0.05);
         showMessage(`Listed ${selectedItem.custom_name || selectedItem.item_name} for ${price}g! (Paid ${fee}g fee)`);
     } catch(err) {
         showMessage(`Error: ${err.message}`);
     } finally {
         setIsProcessing(false);
     }
  };

  const handleCancel = async (auction) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/auction/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId: auction.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.updatedHero) updateHero(data.updatedHero);
      showMessage(`Listing cancelled. Item returned to your inventory.`);
      fetchListings();
    } catch(err) {
      showMessage(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
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

      <div className="border border-neutral-900 bg-[#050505] shadow-[0_10px_50px_rgba(0,0,0,0.8)]">

        <div className="flex border-b border-red-900/30">
           <button onClick={() => setTab('MARKET')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg transition-colors ${tab === 'MARKET' ? 'bg-red-950/20 text-stone-200 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>
              Global Market
           </button>
           <button onClick={() => setTab('SELL')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg transition-colors ${tab === 'SELL' ? 'bg-red-950/20 text-stone-200 border-b-2 border-red-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>
              Sell Artifacts
           </button>
        </div>

        {actionMsg && (
          <div className="bg-red-950/40 border-b border-red-900/50 text-stone-300 p-3 text-center text-xs font-mono uppercase tracking-widest animate-pulse">
             {actionMsg}
          </div>
        )}

        <div className="p-8 min-h-[400px]">
           {tab === 'MARKET' ? (
              <div className="flex flex-col gap-4">
                 {loading ? (
                    <div className="text-center font-mono text-stone-600 py-10 uppercase tracking-widest text-xs">Loading ledgers...</div>
                 ) : listings.length === 0 ? (
                    <div className="text-center font-mono text-stone-600 py-10 italic text-xs">The market is currently empty.</div>
                 ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                       {listings.map(auction => (
                          <div key={auction.id} className="flex flex-col xl:flex-row justify-between bg-[#020202] border border-neutral-800 p-4 font-mono hover:border-neutral-700 transition-colors">
                             <div className="flex-1 pr-4">
                                <div className="flex items-center gap-3 mb-1">
                                  <h3 className={`font-bold uppercase tracking-widest text-sm ${getTierColor(auction.item_rarity).split(' ')[0]}`}>
                                    {auction.item_name}
                                  </h3>
                                  <span className={`text-[9px] px-2 py-0.5 border ${getTierColor(auction.item_rarity)}`}>
                                    {auction.item_rarity}
                                  </span>
                                </div>
                                <div className="text-[9px] text-stone-600 mb-2 uppercase tracking-widest">
                                   Sold by: <span className="text-stone-400">{auction.seller_name}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-500 uppercase tracking-widest mb-3">
                                  <span>Type: {auction.item_type}</span>
                                  {auction.item_stats?.dmg > 0 && <span className="text-red-500">+{auction.item_stats.dmg} DMG</span>}
                                  {auction.item_stats?.def > 0 && <span className="text-stone-400">+{auction.item_stats.def} DEF</span>}
                                  {auction.item_stats?.hp > 0 && <span className="text-stone-300">+{auction.item_stats.hp} HP</span>}
                                </div>
                             </div>
                             <div className="mt-4 xl:mt-0 flex flex-col justify-between items-end border-t xl:border-t-0 xl:border-l border-neutral-800 pt-4 xl:pt-0 xl:pl-4 min-w-[120px]">
                                <div className="text-lg font-bold text-yellow-600 mb-4">{auction.buyout_price?.toLocaleString()}g</div>
                                <button
                                  onClick={() => auction.seller_id === hero?.clerk_user_id ? handleCancel(auction) : handleBuy(auction)}
                                  disabled={auction.seller_id !== hero?.clerk_user_id && (currentGold < auction.buyout_price || isProcessing)}
                                  className={`w-full py-2 bg-black border transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest text-xs ${auction.seller_id === hero?.clerk_user_id ? 'border-red-900/50 text-red-500 hover:bg-red-950/30' : 'border-neutral-700 text-stone-300 hover:bg-neutral-800 hover:text-white'}`}
                                >
                                  {auction.seller_id === hero?.clerk_user_id ? 'Cancel' : 'Buyout'}
                                </button>
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </div>
           ) : (
              /* ── SELL VIEW — reads from /api/inventory ─────────────── */
              <div className="flex flex-col lg:flex-row gap-8">
                 <div className="flex-1">
                    <h3 className="font-serif text-xl uppercase tracking-[0.1em] text-stone-400 mb-4 border-b border-neutral-800 pb-2">Your Pack</h3>
                    <div className="max-h-96 overflow-y-auto flex flex-col gap-2 pr-2">
                       {sellableItems.length === 0 ? (
                          <div className="text-stone-600 italic font-mono text-xs">No artifacts to sell.</div>
                       ) : (
                          sellableItems.map(item => (
                             <button
                                key={item.inventory_id}
                                onClick={() => setSelectedItem(item)}
                                className={`text-left p-3 border transition-colors ${selectedItem?.inventory_id === item.inventory_id ? 'border-red-900 bg-red-950/10' : 'border-neutral-900 hover:border-neutral-700 bg-[#020202]'}`}
                             >
                                <div className="flex justify-between items-center mb-1">
                                   <span className={`font-bold font-mono text-xs uppercase tracking-widest ${getTierColor(item.custom_tier || item.item_tier).split(' ')[0]}`}>
                                     {item.custom_name || item.item_name}
                                   </span>
                                   <span className={`text-[8px] font-mono px-1 border ${getTierColor(item.custom_tier || item.item_tier)}`}>
                                     {item.custom_tier || item.item_tier}
                                   </span>
                                </div>
                                <div className="text-[10px] text-stone-500 font-mono uppercase tracking-widest">Type: {item.item_type}</div>
                             </button>
                          ))
                       )}
                    </div>
                 </div>

                 <div className="flex-1 bg-[#020202] border border-neutral-900 p-6 flex flex-col items-center justify-center">
                    {selectedItem ? (
                       <div className="w-full max-w-sm">
                          <h4 className="text-stone-300 font-serif text-lg tracking-widest uppercase mb-6 text-center">List on Market</h4>
                          <div className="p-4 border border-red-900/30 bg-red-950/10 mb-6 text-center font-mono">
                             <div className={`font-bold text-sm uppercase tracking-widest mb-2 ${getTierColor(selectedItem.custom_tier || selectedItem.item_tier).split(' ')[0]}`}>
                               {selectedItem.custom_name || selectedItem.item_name}
                             </div>
                             <div className="text-[10px] text-stone-400 uppercase tracking-widest">
                               +{selectedItem.enhancement || 0} {selectedItem.item_type}
                             </div>
                          </div>

                          <div className="mb-6 font-mono">
                             <label className="block text-stone-500 text-[10px] uppercase tracking-widest mb-2">Buyout Price (Gold)</label>
                             <input
                               type="number"
                               value={sellPrice}
                               onChange={e => setSellPrice(e.target.value)}
                               className="w-full bg-black border border-neutral-800 text-yellow-600 font-bold p-3 focus:outline-none focus:border-yellow-900 text-lg"
                               placeholder="1000"
                             />
                             <div className="text-[9px] text-stone-600 uppercase tracking-widest mt-2 text-right">
                               Listing Fee (5%): <span className="text-yellow-700">{sellPrice ? Math.ceil(parseInt(sellPrice) * 0.05) : 0}g</span>
                             </div>
                          </div>

                          <button
                             onClick={handleList}
                             disabled={isProcessing || !sellPrice || isNaN(parseInt(sellPrice)) || parseInt(sellPrice) <= 0}
                             className="w-full py-4 bg-yellow-950/30 border border-yellow-600/50 text-yellow-500 hover:bg-yellow-900/40 transition-colors uppercase tracking-widest font-bold text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                             Submit Listing
                          </button>
                       </div>
                    ) : (
                       <div className="text-stone-600 font-mono text-xs uppercase tracking-widest italic">Select an artifact to sell.</div>
                    )}
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
