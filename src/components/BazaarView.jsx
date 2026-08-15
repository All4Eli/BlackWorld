'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

export default function BazaarView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [activeTab, setActiveTab] = useState('MARKET'); // 'MARKET' | 'MY_SHOP'
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Listing Form State (My Shop)
  const [selectedInvId, setSelectedInvId] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [listQuantity, setListQuantity] = useState('1');

  // Buy Quantity State per listing
  const [buyQuantities, setBuyQuantities] = useState({});

  const [submittingId, setSubmittingId] = useState(null);
  const [msg, setMsg] = useState(null);

  const fetchBazaarData = async () => {
    try {
      const res = await fetch('/api/bazaar');
      const data = await res.json();
      if (res.ok) {
        setListings(data.listings || []);
        setMyListings(data.my_listings || []);
      }
    } catch (err) {
      console.error('Failed to fetch bazaar data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInventoryData = async () => {
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      if (res.ok) {
        // Filter out equipped / locked items if needed
        setInventory((data.items || []).filter(item => !item.is_locked));
      }
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    }
  };

  useEffect(() => {
    fetchBazaarData();
    fetchInventoryData();
  }, []);

  const handleBuy = async (listing) => {
    const qty = Number(buyQuantities[listing.id] || 1);
    if (!qty || qty <= 0 || submittingId) return;

    setSubmittingId(listing.id);
    setMsg(null);

    try {
      const res = await fetch('/api/bazaar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'buy', listingId: listing.id, quantity: qty }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to purchase item.' });
        return;
      }

      setMsg({
        success: true,
        text: `Purchased ${data.quantity_bought || qty}x ${listing.item_name} for ${(data.total_cost || 0).toLocaleString()}g!`,
      });

      await fetchBazaarData();
      await fetchInventoryData();

      if (updateHero && data.total_cost) {
        updateHero({ gold: Math.max(0, (hero?.gold || 0) - data.total_cost) });
      }
    } catch (err) {
      setMsg({ success: false, text: 'Connection error while purchasing item.' });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleList = async () => {
    const prc = Number(listPrice);
    const qty = Number(listQuantity);

    if (!selectedInvId || isNaN(prc) || prc < 0 || isNaN(qty) || qty <= 0 || submittingId) return;

    setSubmittingId('list');
    setMsg(null);

    try {
      const res = await fetch('/api/bazaar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', inventoryId: selectedInvId, price: prc, quantity: qty }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to list item in bazaar.' });
        return;
      }

      setMsg({ success: true, text: 'Item listed successfully in your Bazaar shop!' });
      setSelectedInvId('');
      setListPrice('');
      setListQuantity('1');

      await fetchBazaarData();
      await fetchInventoryData();
    } catch (err) {
      setMsg({ success: false, text: 'Connection error while listing item.' });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRemove = async (listingId) => {
    if (submittingId) return;

    setSubmittingId(listingId);
    setMsg(null);

    try {
      const res = await fetch('/api/bazaar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', listingId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to remove listing.' });
        return;
      }

      setMsg({ success: true, text: 'Listing canceled and item returned to inventory.' });
      await fetchBazaarData();
      await fetchInventoryData();
    } catch (err) {
      setMsg({ success: false, text: 'Connection error while removing listing.' });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      {onBack && (
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
          ← Back to City Directory
        </button>
      )}

      <div className="border border-neutral-900 bg-[#050505] p-8 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        <h1 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-yellow-600 mb-2 drop-shadow-md">
          Player Bazaar
        </h1>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center max-w-md mb-6">
          Direct player-to-player marketplace. Browse global listings or list your own inventory at custom prices.
        </p>

        {/* Tab Selection */}
        <div className="flex gap-4 mb-8 font-mono text-xs">
          <button
            onClick={() => { setActiveTab('MARKET'); setMsg(null); }}
            className={`px-6 py-3 uppercase tracking-widest border transition-all ${
              activeTab === 'MARKET'
                ? 'bg-yellow-950/20 border-yellow-600 text-yellow-400 font-bold'
                : 'bg-black border-neutral-800 text-stone-500 hover:text-stone-300'
            }`}
          >
            Bazaar Market ({listings.length})
          </button>
          <button
            onClick={() => { setActiveTab('MY_SHOP'); setMsg(null); }}
            className={`px-6 py-3 uppercase tracking-widest border transition-all ${
              activeTab === 'MY_SHOP'
                ? 'bg-yellow-950/20 border-yellow-600 text-yellow-400 font-bold'
                : 'bg-black border-neutral-800 text-stone-500 hover:text-stone-300'
            }`}
          >
            My Shop ({myListings.length})
          </button>
        </div>

        {/* Action Message Notice */}
        {msg && (
          <div
            className={`w-full max-w-xl mb-6 p-4 border font-mono text-xs text-center ${
              msg.success
                ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                : 'bg-red-950/40 border-red-800 text-red-400'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* TAB 1: BAZAAR MARKET */}
        {activeTab === 'MARKET' && (
          <div className="w-full flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-red-900/20 pb-2">
              <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-stone-500">
                Global Listings
              </h2>
              <span className="text-[10px] font-mono text-stone-600">
                Gold Pouch: <strong className="text-yellow-600">{(hero?.gold || 0).toLocaleString()}g</strong>
              </span>
            </div>

            {loading ? (
              <div className="py-12 text-center font-mono text-xs text-stone-600 uppercase tracking-widest">
                Loading bazaar listings...
              </div>
            ) : listings.length === 0 ? (
              <div className="py-12 text-center font-mono text-xs text-stone-600 uppercase tracking-widest border border-neutral-900 bg-black/40">
                No active listings found in the Bazaar.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {listings.map((item) => {
                  const buyQty = buyQuantities[item.id] || 1;
                  const totalCost = Number(item.price) * buyQty;
                  const canAfford = (hero?.gold || 0) >= totalCost;
                  const isBuying = submittingId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="border border-neutral-900 bg-black/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-yellow-900/40 transition-colors"
                    >
                      <div className="flex flex-col gap-1 flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-serif font-bold uppercase tracking-wider text-stone-200 text-base">
                            {item.item_name}
                          </h3>
                          <span className="text-[9px] font-mono px-2 py-0.5 border border-yellow-900/40 bg-yellow-950/20 text-yellow-500 uppercase tracking-widest">
                            {item.item_type || 'Item'}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-stone-500">
                          Seller: <span className="text-stone-300 font-bold">{item.seller_username || 'Unknown Merchant'}</span>
                        </p>

                        <div className="flex items-center gap-4 mt-2 font-mono text-[11px]">
                          <span className="text-stone-400">
                            Unit Price: <strong className="text-yellow-600">{Number(item.price).toLocaleString()}g</strong>
                          </span>
                          <span className="text-stone-400">
                            In Stock: <strong className="text-stone-200">{item.quantity}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-1 font-mono text-xs">
                          <span className="text-stone-500 text-[10px]">QTY:</span>
                          <input
                            type="number"
                            min="1"
                            max={item.quantity}
                            value={buyQty}
                            onChange={(e) =>
                              setBuyQuantities(prev => ({
                                ...prev,
                                [item.id]: Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)),
                              }))
                            }
                            className="w-16 bg-black border border-neutral-800 text-stone-200 px-2 py-2 text-center"
                          />
                        </div>

                        <button
                          onClick={() => handleBuy(item)}
                          disabled={!canAfford || isBuying}
                          title={!canAfford ? 'Insufficient gold' : 'Buy item'}
                          className="flex-1 md:flex-initial px-6 py-2.5 border border-yellow-700/50 bg-yellow-950/20 text-yellow-500 hover:bg-yellow-900/40 font-mono text-xs uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {isBuying ? 'Buying...' : `Buy (${totalCost.toLocaleString()}g)`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MY SHOP */}
        {activeTab === 'MY_SHOP' && (
          <div className="w-full flex flex-col gap-8">
            {/* Create Listing Form */}
            <div className="border border-neutral-800 bg-[#020202] p-6 flex flex-col gap-4">
              <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-yellow-600 font-bold border-b border-neutral-800 pb-2">
                Create New Bazaar Listing
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                {/* Select Inventory Item */}
                <div className="flex flex-col gap-1">
                  <label className="text-stone-500 uppercase text-[10px]">Select Item</label>
                  <select
                    value={selectedInvId}
                    onChange={(e) => setSelectedInvId(e.target.value)}
                    className="bg-black border border-neutral-800 text-stone-200 px-3 py-3 focus:outline-none focus:border-yellow-900/50"
                  >
                    <option value="">-- Choose Inventory Item --</option>
                    {inventory.map((inv) => (
                      <option key={inv.id || inv.inventory_id} value={inv.id || inv.inventory_id}>
                        {inv.item_name || inv.name} (Qty: {inv.quantity || 1})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price Input */}
                <div className="flex flex-col gap-1">
                  <label className="text-stone-500 uppercase text-[10px]">Unit Price (Gold)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Price in Gold..."
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    className="bg-black border border-neutral-800 text-stone-200 px-3 py-3 focus:outline-none focus:border-yellow-900/50 text-center"
                  />
                </div>

                {/* Quantity Input */}
                <div className="flex flex-col gap-1">
                  <label className="text-stone-500 uppercase text-[10px]">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Quantity..."
                    value={listQuantity}
                    onChange={(e) => setListQuantity(e.target.value)}
                    className="bg-black border border-neutral-800 text-stone-200 px-3 py-3 focus:outline-none focus:border-yellow-900/50 text-center"
                  />
                </div>
              </div>

              <button
                onClick={handleList}
                disabled={!selectedInvId || !listPrice || submittingId === 'list'}
                className="mt-2 py-3 border border-yellow-600/50 bg-yellow-950/20 text-yellow-500 hover:bg-yellow-900/40 font-mono text-xs uppercase tracking-widest font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {submittingId === 'list' ? 'Listing Item...' : 'List Item in Bazaar'}
              </button>
            </div>

            {/* Active Shop Listings */}
            <div className="flex flex-col gap-4">
              <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-stone-500 border-b border-red-900/20 pb-2">
                My Active Shop Listings ({myListings.length})
              </h2>

              {myListings.length === 0 ? (
                <div className="py-8 text-center font-mono text-xs text-stone-600 uppercase tracking-widest border border-neutral-900 bg-black/40">
                  You currently have no active bazaar listings.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {myListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="border border-neutral-900 bg-black/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      <div>
                        <h3 className="font-serif font-bold uppercase tracking-wider text-stone-200 text-base">
                          {listing.item_name}
                        </h3>
                        <div className="flex items-center gap-4 mt-1 font-mono text-xs">
                          <span className="text-stone-400">
                            Unit Price: <strong className="text-yellow-600">{Number(listing.price).toLocaleString()}g</strong>
                          </span>
                          <span className="text-stone-400">
                            Listed Qty: <strong className="text-stone-200">{listing.quantity}</strong>
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemove(listing.id)}
                        disabled={submittingId === listing.id}
                        className="px-5 py-2 border border-red-900/50 bg-red-950/20 text-red-400 hover:bg-red-900 hover:text-stone-100 font-mono text-xs uppercase tracking-widest transition-all disabled:opacity-40"
                      >
                        {submittingId === listing.id ? 'Removing...' : 'Cancel Listing'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
