'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

export default function BountyBoardView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [bounties, setBounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Placement State
  const [targetId, setTargetId] = useState('');
  const [goldAmount, setGoldAmount] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    fetchBounties();
  }, []);

  const fetchBounties = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bounties/list');
      const data = await res.json();
      if (res.ok) {
        setBounties(data.bounties || []);
      } else {
        setError(data.message || 'Failed to load bounties.');
      }
    } catch (err) {
      setError('Network error loading bounties.');
    }
    setLoading(false);
  };

  const handlePlaceBounty = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!targetId.trim() || !goldAmount || isNaN(goldAmount) || Number(goldAmount) <= 0) {
      setError('Enter a valid target Clerk User ID and Gold amount.');
      return;
    }

    setPlacing(true);
    try {
      const res = await fetch('/api/bounties/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: targetId.trim(), goldAmount: Number(goldAmount) }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Bounty placed successfully!');
        setTargetId('');
        setGoldAmount('');
        updateHero({ ...hero, gold: hero.gold - Number(goldAmount) });
        fetchBounties();
      } else {
        setError(data.message || 'Failed to place bounty.');
      }
    } catch (err) {
      setError('Network error placing bounty.');
    }
    setPlacing(false);
  };

  const handleClaimBounty = async (bountyId) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/bounties/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bountyId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        const claimedBounty = bounties.find(b => b.id === bountyId);
        if (claimedBounty) {
          updateHero({ ...hero, gold: hero.gold + claimedBounty.gold_amount });
        }
        fetchBounties();
      } else {
        setError(data.message || 'Failed to claim bounty.');
      }
    } catch (err) {
      setError('Network error claiming bounty.');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-red-900/30 pb-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-widest font-serif text-red-600 drop-shadow-md">
            Bounty Board
          </h2>
          <p className="text-xs font-mono text-stone-500 mt-1 uppercase tracking-wider">
            Put a price on their head, or collect the reward.
          </p>
        </div>
        <button 
          onClick={onBack}
          className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-stone-400 font-mono text-xs uppercase hover:bg-neutral-800 transition-colors"
        >
          Return to Town
        </button>
      </div>

      {error && (
        <div className="p-3 border border-red-900 bg-red-950/20 text-red-500 font-mono text-xs uppercase text-center">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-3 border border-green-900 bg-green-950/20 text-green-500 font-mono text-xs uppercase text-center">
          {success}
        </div>
      )}

      {/* Place Bounty Section */}
      <div className="border border-neutral-900 bg-[#0a0a0a] p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-300 font-serif mb-4 border-b border-neutral-800 pb-2">
          Place a Bounty
        </h3>
        <form onSubmit={handlePlaceBounty} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-mono text-stone-500 uppercase mb-2">Target User ID (Clerk ID)</label>
            <input 
              type="text" 
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-black border border-neutral-800 px-3 py-2 text-stone-300 font-mono text-sm focus:outline-none focus:border-red-900 transition-colors"
              placeholder="e.g. user_2Pabc123..."
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-mono text-stone-500 uppercase mb-2">Gold Amount</label>
            <input 
              type="number" 
              min="1"
              value={goldAmount}
              onChange={(e) => setGoldAmount(e.target.value)}
              className="w-full bg-black border border-neutral-800 px-3 py-2 text-stone-300 font-mono text-sm focus:outline-none focus:border-red-900 transition-colors"
              placeholder="0"
            />
          </div>
          <button 
            type="submit" 
            disabled={placing}
            className="w-full sm:w-auto px-6 py-2.5 bg-red-900/20 border border-red-900 text-red-500 font-mono text-xs uppercase tracking-widest hover:bg-red-900/40 transition-colors disabled:opacity-50"
          >
            {placing ? 'Placing...' : 'Place Bounty'}
          </button>
        </form>
        <p className="text-xs font-mono text-stone-600 mt-3">
          Your current gold: <span className="text-yellow-600">{hero?.gold || 0}</span>
        </p>
      </div>

      {/* Active Bounties Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-300 font-serif border-b border-neutral-900 pb-2">
          Active Targets
        </h3>

        {loading ? (
          <div className="text-center py-10 text-stone-500 font-mono text-xs uppercase animate-pulse">
            Scanning for bounties...
          </div>
        ) : bounties.length === 0 ? (
          <div className="text-center py-10 border border-neutral-900 bg-black/40 text-stone-600 font-mono text-xs uppercase">
            No active bounties. The streets are safe... for now.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bounties.map(bounty => (
              <div key={bounty.id} className="border border-neutral-800 bg-black p-4 flex flex-col justify-between group hover:border-red-900/50 transition-colors">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-bold text-red-500 font-serif tracking-wider truncate" title={bounty.target_name || bounty.target_id}>
                      {bounty.target_name || 'Unknown'}
                    </span>
                    <span className="text-yellow-600 font-mono text-sm font-bold bg-yellow-900/10 px-2 py-0.5 border border-yellow-900/30">
                      {bounty.gold_amount}G
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-stone-500 uppercase flex flex-col gap-1">
                    <span>Target ID: <span className="text-stone-400">{bounty.target_id.slice(0, 15)}...</span></span>
                    <span>Placed by: <span className="text-stone-400">{bounty.setter_name || bounty.setter_id}</span></span>
                    <span>Placed on: <span className="text-stone-400">{new Date(bounty.created_at).toLocaleDateString()}</span></span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-900 text-center">
                  {hero?.clerk_user_id === bounty.target_id ? (
                    <span className="text-[10px] font-mono text-stone-600 uppercase">You are the target</span>
                  ) : hero?.clerk_user_id === bounty.setter_id ? (
                    <span className="text-[10px] font-mono text-stone-600 uppercase">Your bounty</span>
                  ) : (
                    <button 
                      onClick={() => handleClaimBounty(bounty.id)}
                      className="w-full py-1.5 bg-neutral-900 border border-neutral-800 text-stone-400 hover:text-white hover:border-neutral-600 font-mono text-xs uppercase transition-colors"
                    >
                      Attempt Claim
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
