'use client';
import { useState } from 'react';

export default function BankView({ hero, updateHero, onBack }) {
  const [amount, setAmount] = useState('');

  const banked = hero.bankedGold || 0;
  const current = hero.gold || 0;

  const handleDeposit = () => {
    const val = parseInt(amount);
    if (!isNaN(val) && val > 0 && current >= val) {
      updateHero({ ...hero, gold: current - val, bankedGold: banked + val });
      setAmount('');
    }
  };

  const handleWithdraw = () => {
    const val = parseInt(amount);
    if (!isNaN(val) && val > 0 && banked >= val) {
      updateHero({ ...hero, gold: current + val, bankedGold: banked - val });
      setAmount('');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left mb-4">
        ← Back to City Directory
      </button>

      <div className="border border-neutral-900 bg-[#050505] p-10 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2">The Blood Bank</h2>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center leading-relaxed max-w-md mb-10">
          Gold deposited here is safe from the clutches of Death. Protect your assets before you explore the wilds.
        </p>

        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 font-mono mb-8">
          <div className="border border-neutral-800 bg-[#020202] py-6 flex flex-col items-center">
            <span className="text-[10px] text-stone-600 uppercase tracking-widest mb-1">On Person</span>
            <span className="text-3xl font-bold text-yellow-600">{current.toLocaleString()}g</span>
          </div>
          <div className="border border-neutral-800 bg-[#020202] py-6 flex flex-col items-center">
            <span className="text-[10px] text-stone-600 uppercase tracking-widest mb-1">In The Vault</span>
            <span className="text-3xl font-bold text-stone-300">{banked.toLocaleString()}g</span>
          </div>
        </div>

        <div className="w-full max-w-md flex flex-col gap-4 font-mono text-sm">
          <input 
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount..."
            min="1"
            className="w-full bg-[#020202] border border-neutral-800 text-stone-300 px-4 py-4 focus:outline-none focus:border-red-900/50 text-center text-lg"
          />
          <div className="flex gap-4">
            <button 
              onClick={handleDeposit}
              disabled={!amount || parseInt(amount) > current || parseInt(amount) <= 0}
              className="flex-1 py-3 border border-neutral-800 bg-black text-stone-400 hover:bg-neutral-900 hover:text-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
            >
              Deposit
            </button>
            <button 
              onClick={handleWithdraw}
              disabled={!amount || parseInt(amount) > banked || parseInt(amount) <= 0}
              className="flex-1 py-3 border border-neutral-800 bg-black text-stone-400 hover:bg-neutral-900 hover:text-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
            >
              Withdraw
            </button>
          </div>
          
          {/* Quick Actions */}
          <div className="flex justify-between mt-2 pt-4 border-t border-neutral-900">
             <button onClick={() => setAmount(current.toString())} className="text-[10px] text-stone-600 hover:text-yellow-600 uppercase tracking-widest">
                Insert All
             </button>
             <button onClick={() => setAmount(banked.toString())} className="text-[10px] text-stone-600 hover:text-stone-300 uppercase tracking-widest">
                Retrieve All
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
