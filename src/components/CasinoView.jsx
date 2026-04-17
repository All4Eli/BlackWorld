'use client';
import { useState } from 'react';

export default function CasinoView({ hero, updateHero, onBack }) {
  const [wager, setWager] = useState('');
  const [choice, setChoice] = useState('HEADS');
  const [result, setResult] = useState(null); // { won: boolean, roll: 'HEADS'|'TAILS', amount: number }
  const [isRolling, setIsRolling] = useState(false);

  const current = hero.gold || 0;

  const handleFlip = () => {
    const val = parseInt(wager);
    if (isNaN(val) || val <= 0 || val > current) return;

    setIsRolling(true);
    setResult(null);

    // Simulate dice roll delay
    setTimeout(() => {
      const isHeads = Math.random() > 0.5;
      const roll = isHeads ? 'HEADS' : 'TAILS';
      const won = roll === choice;

      if (won) {
        updateHero({ ...hero, gold: current + val });
      } else {
        updateHero({ ...hero, gold: current - val });
      }

      setResult({ won, roll, amount: val });
      setIsRolling(false);
    }, 1500);
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left mb-4">
        ← Back to City Directory
      </button>

      <div className="border border-red-900/10 bg-[#050505] p-10 flex flex-col items-center shadow-[0_0_80px_rgba(202,138,4,0.05)] relative overflow-hidden">
        {/* Thematic glowing coins background */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-yellow-600/10 rounded-full blur-[100px] pointer-events-none"></div>

        <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-yellow-600 mb-2 drop-shadow-[0_0_10px_rgba(202,138,4,0.3)]">Demon Casino</h2>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center leading-relaxed max-w-md mb-8">
          The house always wins, but fortune favors the foolish. Flip the Sovereign's Coin.
        </p>

        <div className="bg-[#020202] border border-neutral-800 p-8 w-full max-w-md">
          <div className="flex justify-between items-center mb-6 font-mono text-sm">
            <span className="text-stone-500 uppercase">Available Pouch</span>
            <span className="text-yellow-600 font-bold">{current.toLocaleString()}g</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button 
              onClick={() => setChoice('HEADS')}
              className={`py-4 font-mono uppercase tracking-widest text-sm border transition-colors ${choice === 'HEADS' ? 'bg-yellow-900/20 border-yellow-600 text-yellow-500 shadow-[0_0_15px_rgba(202,138,4,0.2)]' : 'bg-black border-neutral-800 text-stone-500 hover:border-yellow-900/50'}`}
            >
              Heads
            </button>
            <button 
              onClick={() => setChoice('TAILS')}
              className={`py-4 font-mono uppercase tracking-widest text-sm border transition-colors ${choice === 'TAILS' ? 'bg-yellow-900/20 border-yellow-600 text-yellow-500 shadow-[0_0_15px_rgba(202,138,4,0.2)]' : 'bg-black border-neutral-800 text-stone-500 hover:border-yellow-900/50'}`}
            >
              Tails
            </button>
          </div>

          <input 
            type="number"
            value={wager}
            onChange={(e) => setWager(e.target.value)}
            disabled={isRolling}
            placeholder="Wager amount..."
            min="1"
            max={current}
            className="w-full bg-black border border-neutral-800 text-stone-300 px-4 py-4 focus:outline-none focus:border-yellow-900/50 text-center font-mono text-lg mb-6 disabled:opacity-50"
          />

          <button 
            onClick={handleFlip}
            disabled={isRolling || !wager || parseInt(wager) > current || parseInt(wager) <= 0}
            className="w-full py-4 bg-yellow-900/20 border border-yellow-600/50 text-yellow-500 hover:bg-yellow-900/40 hover:text-yellow-400 font-serif uppercase tracking-[0.3em] font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isRolling ? 'Flipping...' : 'Toss Coin'}
          </button>
        </div>

        {/* Results Area */}
        <div className="h-24 mt-6 flex items-center justify-center font-mono w-full">
          {isRolling && (
            <div className="w-12 h-12 rounded-full border-4 border-yellow-600 border-t-transparent animate-spin"></div>
          )}
          
          {result && !isRolling && (
            <div className={`text-center animate-in zoom-in-50 duration-300`}>
              <div className="text-xl uppercase tracking-widest text-stone-300 mb-2">
                Coin landed on <span className="font-bold">{result.roll}</span>
              </div>
              {result.won ? (
                <div className="text-2xl font-black text-yellow-500 drop-shadow-[0_0_10px_rgba(202,138,4,0.8)]">
                  + {result.amount}g
                </div>
              ) : (
                <div className="text-2xl font-black text-red-600 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">
                  - {result.amount}g
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
