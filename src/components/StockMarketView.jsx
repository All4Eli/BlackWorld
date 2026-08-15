'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

export default function StockMarketView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [stocks, setStocks] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Inputs state for buy/sell per stock
  const [buyShares, setBuyShares] = useState({});
  const [sellShares, setSellShares] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const fetchStockData = async () => {
    try {
      const res = await fetch('/api/stocks');
      const data = await res.json();
      if (res.ok) {
        setStocks(data.stocks || []);
        setInvestments(data.player_investments || []);
      }
    } catch (err) {
      console.error('Failed to fetch stock market data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, []);

  const handleBuy = async (stock) => {
    const shares = Number(buyShares[stock.id] || 1);
    if (isNaN(shares) || shares <= 0 || submitting) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'buy', stockId: stock.id, shares }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to purchase shares.' });
        return;
      }

      setMsg({
        success: true,
        text: `Purchased ${shares} shares of ${stock.symbol} for ${(data.total_cost || 0).toLocaleString()}g!`,
      });

      await fetchStockData();

      if (updateHero && data.total_cost) {
        updateHero({ gold: Math.max(0, (hero?.gold || 0) - data.total_cost) });
      }
    } catch (err) {
      setMsg({ success: false, text: 'Connection error while purchasing shares.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSell = async (stock) => {
    const shares = Number(sellShares[stock.id] || 1);
    if (isNaN(shares) || shares <= 0 || submitting) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sell', stockId: stock.id, shares }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to sell shares.' });
        return;
      }

      setMsg({
        success: true,
        text: `Sold ${shares} shares of ${stock.symbol} for ${(data.revenue || 0).toLocaleString()}g!`,
      });

      await fetchStockData();

      if (updateHero && data.revenue) {
        updateHero({ gold: (hero?.gold || 0) + data.revenue });
      }
    } catch (err) {
      setMsg({ success: false, text: 'Connection error while selling shares.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimDividends = async () => {
    if (submitting) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_dividends' }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to claim dividends.' });
        return;
      }

      const totalClaimed = data.total_dividends_claimed || 0;
      setMsg({
        success: true,
        text: totalClaimed > 0
          ? `Claimed +${totalClaimed.toLocaleString()}g in passive corporate dividends!`
          : 'No dividend payouts available to claim right now.',
      });

      await fetchStockData();

      if (updateHero && totalClaimed > 0) {
        updateHero({ gold: (hero?.gold || 0) + totalClaimed });
      }
    } catch (err) {
      setMsg({ success: false, text: 'Connection error while claiming dividends.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate portfolio totals
  const totalPortfolioValue = investments.reduce((sum, inv) => {
    const matchedStock = stocks.find(s => s.id === inv.stock_id);
    const price = matchedStock ? Number(matchedStock.share_price) : 0;
    return sum + Number(inv.shares_owned || 0) * price;
  }, 0);

  const now = new Date();
  const totalAccumulatedDividends = investments.reduce((sum, inv) => {
    const matchedStock = stocks.find(s => s.id === inv.stock_id);
    if (!matchedStock) return sum;
    const rate = Number(matchedStock.dividend_rate_per_hour || 0);
    const lastClaim = inv.last_dividend_claim ? new Date(inv.last_dividend_claim) : new Date(inv.created_at || now);
    const hoursElapsed = Math.max(0, Math.floor((now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60)));
    return sum + Number(inv.shares_owned || 0) * rate * hoursElapsed;
  }, 0);

  const fallbackStocks = [
    { id: 'st1', symbol: 'DRK', name: 'DarkCorp', share_price: 500, dividend_rate_per_hour: 5, description: 'Dark military contractor specialized in cursed armor and soul weapons.' },
    { id: 'st2', symbol: 'BLD', name: 'BloodBank', share_price: 1200, dividend_rate_per_hour: 15, description: 'Financial conglomerate holding gold reserves for sovereign players.' },
    { id: 'st3', symbol: 'VLT', name: 'ShadowVault', share_price: 2500, dividend_rate_per_hour: 35, description: 'High-yield dark venture vault investing in rare relic auctions.' },
  ];

  const stockList = stocks.length > 0 ? stocks : fallbackStocks;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      {onBack && (
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
          ← Back to City Directory
        </button>
      )}

      <div className="border border-neutral-900 bg-[#050505] p-8 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        <h1 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-emerald-500 mb-2 drop-shadow-md">
          Black Stock Exchange
        </h1>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center max-w-md mb-6">
          Invest gold into corporate syndicates. Earn hourly dividends and trade shares for financial dominance.
        </p>

        {/* PORTFOLIO SUMMARY CARD */}
        <div className="w-full max-w-2xl bg-[#020202] border border-emerald-900/40 p-6 mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-2 font-mono">
            <span className="text-[10px] text-stone-500 uppercase tracking-widest">
              My Investment Portfolio
            </span>
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs text-stone-400 block">Total Portfolio Value</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {totalPortfolioValue.toLocaleString()}g
                </span>
              </div>
              <div>
                <span className="text-xs text-stone-400 block">Pending Dividends</span>
                <span className="text-2xl font-bold text-yellow-500">
                  {totalAccumulatedDividends.toLocaleString()}g
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClaimDividends}
            disabled={submitting}
            className="w-full md:w-auto px-6 py-3 border border-emerald-600 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900 font-mono text-xs uppercase tracking-widest font-bold transition-all disabled:opacity-40"
          >
            {submitting ? 'Claiming...' : 'Claim Dividends'}
          </button>
        </div>

        {/* Action Message Notice */}
        {msg && (
          <div
            className={`w-full max-w-2xl mb-6 p-4 border font-mono text-xs text-center ${
              msg.success
                ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                : 'bg-red-950/40 border-red-800 text-red-400'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* STOCK MARKET CATALOG */}
        <div className="w-full flex flex-col gap-4">
          <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-stone-500 border-b border-red-900/20 pb-2">
            Corporate Listings
          </h2>

          {loading ? (
            <div className="py-12 text-center font-mono text-xs text-stone-600 uppercase tracking-widest">
              Connecting to exchange ticker...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {stockList.map((stock) => {
                const inv = investments.find(i => i.stock_id === stock.id);
                const sharesOwned = Number(inv?.shares_owned || 0);
                const bShares = Number(buyShares[stock.id] || 1);
                const sShares = Number(sellShares[stock.id] || 1);

                const buyCost = Number(stock.share_price) * bShares;
                const canBuy = (hero?.gold || 0) >= buyCost;
                const canSell = sharesOwned >= sShares && sShares > 0;

                return (
                  <div
                    key={stock.id}
                    className="border border-neutral-900 bg-black/60 p-6 flex flex-col gap-4 hover:border-emerald-900/40 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-neutral-900 pb-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-mono font-black text-emerald-500 bg-emerald-950/30 px-2 py-0.5 border border-emerald-900/50">
                            [{stock.symbol}]
                          </span>
                          <h3 className="font-serif font-bold uppercase tracking-wider text-stone-200 text-lg">
                            {stock.name}
                          </h3>
                        </div>
                        <p className="text-xs font-mono text-stone-500 mt-1">{stock.description}</p>
                      </div>

                      <div className="flex items-center gap-6 font-mono text-xs">
                        <div>
                          <span className="text-stone-500 text-[10px] uppercase block">Share Price</span>
                          <span className="text-stone-200 font-bold text-base">
                            {Number(stock.share_price).toLocaleString()}g
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-500 text-[10px] uppercase block">Dividend / hr</span>
                          <span className="text-yellow-500 font-bold text-base">
                            +{Number(stock.dividend_rate_per_hour)}g
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-500 text-[10px] uppercase block">Owned</span>
                          <span className="text-emerald-400 font-bold text-base">
                            {sharesOwned.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Trade Actions Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs pt-2">
                      {/* Buy Form */}
                      <div className="flex items-center gap-2 bg-[#020202] p-3 border border-neutral-800">
                        <span className="text-stone-500 text-[10px] uppercase">BUY:</span>
                        <input
                          type="number"
                          min="1"
                          value={bShares}
                          onChange={(e) =>
                            setBuyShares(prev => ({ ...prev, [stock.id]: Math.max(1, parseInt(e.target.value) || 1) }))
                          }
                          className="w-20 bg-black border border-neutral-800 text-stone-200 px-2 py-1.5 text-center"
                        />
                        <button
                          onClick={() => handleBuy(stock)}
                          disabled={!canBuy || submitting}
                          className="flex-1 py-2 border border-emerald-700/50 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-900/40 uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Buy ({buyCost.toLocaleString()}g)
                        </button>
                      </div>

                      {/* Sell Form */}
                      <div className="flex items-center gap-2 bg-[#020202] p-3 border border-neutral-800">
                        <span className="text-stone-500 text-[10px] uppercase">SELL:</span>
                        <input
                          type="number"
                          min="1"
                          max={sharesOwned || 1}
                          value={sShares}
                          onChange={(e) =>
                            setSellShares(prev => ({ ...prev, [stock.id]: Math.max(1, parseInt(e.target.value) || 1) }))
                          }
                          className="w-20 bg-black border border-neutral-800 text-stone-200 px-2 py-1.5 text-center"
                        />
                        <button
                          onClick={() => handleSell(stock)}
                          disabled={!canSell || submitting}
                          className="flex-1 py-2 border border-red-800/50 bg-red-950/20 text-red-400 hover:bg-red-900/40 uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Sell ({(Number(stock.share_price) * sShares).toLocaleString()}g)
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
