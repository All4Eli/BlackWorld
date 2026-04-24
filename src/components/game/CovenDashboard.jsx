'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({ subsets: ['latin'] });

export default function CovenDashboard({ initialCoven, playerGold }) {
  const router = useRouter();
  
  // Local state for forms
  const [isProcessing, setIsProcessing] = useState(false);
  const [formError, setFormError] = useState(null);
  
  // Creation Form State
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');

  // Treasury State
  const [amount, setAmount] = useState('');

  const handleError = (msg) => {
    setFormError(msg);
    setTimeout(() => setFormError(null), 5000); // Simple auto-dismissing toast
  };

  const handleCreateCoven = async (e) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    setFormError(null);

    try {
      const res = await fetch('/api/covens/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tag, description })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      // Success: refresh Server Component to show new state
      router.refresh();
      
    } catch (err) {
      handleError(err.message);
      setIsProcessing(false);
    }
  };

  const handleTreasury = async (action) => {
    if (isProcessing || !amount) return;
    setIsProcessing(true);
    setFormError(null);

    try {
      const res = await fetch('/api/covens/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount: parseInt(amount, 10) })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      setAmount('');
      router.refresh(); // Sync new gold balances

    } catch (err) {
      handleError(err.message);
      setIsProcessing(false);
    }
  };

  // ── No Coven View ──
  if (!initialCoven) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
         <header className="text-center mb-12">
            <h1 className={`${playfair.className} text-4xl text-white tracking-widest uppercase mb-4`}>
                The Underbelly
            </h1>
            <p className="text-gray-500 uppercase tracking-widest text-sm">
                Forge a blood pact. Gather the damned.
            </p>
         </header>

         {formError && (
             <div className="bg-red-900/20 border border-[#8b0000] text-[#8b0000] p-4 text-center font-bold tracking-widest uppercase text-xs">
                ⚠ {formError}
             </div>
         )}

         <form onSubmit={handleCreateCoven} className="bg-[#1a1a1a] border border-[#333] p-8 space-y-6">
            <div>
              <label className="block text-[#8b0000] uppercase tracking-widest text-xs font-bold mb-2">Coven Title</label>
              <input 
                type="text" 
                maxLength={32}
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#050505] border border-[#333] p-3 text-white font-serif outline-none focus:border-[#8b0000] transition-colors"
                placeholder="Order of the Eclipse"
                required 
              />
            </div>

            <div>
              <label className="block text-[#8b0000] uppercase tracking-widest text-xs font-bold mb-2">Tag (3-4 Chars)</label>
              <input 
                type="text" 
                maxLength={4}
                value={tag}
                onChange={e => setTag(e.target.value.toUpperCase())}
                className="w-full bg-[#050505] border border-[#333] p-3 text-white outline-none focus:border-[#8b0000] transition-colors uppercase"
                placeholder="ECLP"
                required 
              />
            </div>

             <div>
              <label className="block text-[#8b0000] uppercase tracking-widest text-xs font-bold mb-2">Manifesto (Optional)</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-[#050505] border border-[#333] p-3 text-gray-400 font-serif outline-none focus:border-[#8b0000] transition-colors h-24 resize-none"
                placeholder="We conquer the darkness."
              />
            </div>

            <div className="pt-4 border-t border-[#333] flex justify-between items-center">
                <div className="text-sm uppercase tracking-widest text-gray-500">
                    Cost: <span className="text-yellow-600 font-mono">5,000</span> Gold <br/>
                    <span className="text-xs">Your Gold: {playerGold.toLocaleString()}</span>
                </div>
                <button 
                  type="submit"
                  disabled={isProcessing || playerGold < 5000}
                  className="bg-[#8b0000] text-white px-8 py-3 uppercase tracking-widest font-bold text-sm hover:bg-red-800 disabled:opacity-30 transition-colors"
                >
                  {isProcessing ? 'Forging...' : 'Establish Coven'}
                </button>
            </div>
         </form>
      </div>
    );
  }

  // ── Active Coven View ──
  return (
    <div className="space-y-8">
        <header className="border-b border-[#333] pb-6">
            <div className="flex items-end justify-between">
                <div>
                   <span className="text-[#8b0000] font-bold text-lg tracking-widest mr-3">[{initialCoven.tag}]</span>
                   <h1 className={`${playfair.className} inline-block text-4xl text-white tracking-widest uppercase`}>
                       {initialCoven.name}
                   </h1>
                </div>
                <div className="text-right uppercase tracking-widest text-sm">
                    <span className="text-gray-500 block mb-1">Your Rank</span>
                    <span className="text-white font-bold">{initialCoven.role}</span>
                </div>
            </div>
        </header>

        {formError && (
             <div className="bg-red-900/20 border border-[#8b0000] text-[#8b0000] p-4 text-center font-bold tracking-widest uppercase text-xs">
                ⚠ {formError}
             </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Treasury Panel */}
            <div className="bg-[#1a1a1a] border border-[#333] p-8 flex flex-col">
                <h2 className={`${playfair.className} text-xl text-[#8b0000] border-b border-[#333] pb-2 mb-6 tracking-widest uppercase`}>
                    The Vault
                </h2>
                
                <div className="flex-1 flex flex-col items-center justify-center py-8">
                    <span className="text-gray-500 uppercase tracking-widest text-xs mb-2">Treasury Balance</span>
                    <span className="text-yellow-600 text-5xl font-mono tracking-widest">{initialCoven.treasury.toLocaleString()}</span>
                </div>

                <div className="border-t border-[#333] pt-6 space-y-4">
                    <div className="flex items-center space-x-2">
                        <input 
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min="1"
                            className="flex-1 bg-[#050505] border border-[#333] p-3 text-white font-mono outline-none focus:border-[#8b0000] transition-colors"
                            placeholder="Amount..."
                        />
                        <button 
                            onClick={() => handleTreasury('deposit')}
                            disabled={isProcessing || !amount}
                            className="bg-[#050505] border border-[#333] text-gray-400 hover:text-white hover:border-[#8b0000] px-6 py-3 uppercase tracking-widest font-bold text-xs disabled:opacity-30 transition-colors"
                        >
                            Deposit
                        </button>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs text-gray-500 tracking-widest uppercase">
                        <span>Personal Holdings: <span className="text-yellow-600">{playerGold.toLocaleString()}</span></span>
                        
                        {(initialCoven.role === 'LEADER' || initialCoven.role === 'OFFICER') && (
                            <button 
                                onClick={() => handleTreasury('withdraw')}
                                disabled={isProcessing || !amount}
                                className="text-[#8b0000] hover:text-red-500 hover:underline disabled:opacity-30"
                            >
                                Withdraw
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Member List Panel */}
            <div className="bg-[#1a1a1a] border border-[#333] p-8">
                <h2 className={`${playfair.className} text-xl text-[#8b0000] border-b border-[#333] pb-2 mb-6 tracking-widest uppercase`}>
                    Blood Pact Members
                </h2>
                <div className="space-y-4">
                    {/* Simplified for the UI demonstration - normally we'd fetch the full list of members in RSC */}
                    <div className="flex justify-between items-center bg-[#050505] p-3 border border-[#333]">
                        <span className="text-white uppercase tracking-widest font-serif text-sm">Active Members</span>
                        <span className="text-gray-500 font-mono text-xs">{initialCoven.memberCount || 1} / {initialCoven.maxMembers || 20}</span>
                    </div>

                    <div className="text-xs text-gray-500 italic mt-4">
                        (A full scrollable roster of online/offline members would render here in Phase 7).
                    </div>
                </div>
            </div>
        </div>

    </div>
  );
}
