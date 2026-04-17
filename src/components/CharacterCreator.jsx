'use client';
import { useState } from 'react';

export default function CharacterCreator({ onCreateCharacter }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    if (trimmed.length > 16) {
      setError('Name must be 16 characters or less.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError('Only letters, numbers, and underscores allowed.');
      return;
    }
    onCreateCharacter(trimmed);
  };

  return (
    <div className="animate-in fade-in duration-700 min-h-[80vh] flex flex-col items-center justify-center px-6">

      <div className="text-center mb-14">
        <h2 className="text-4xl text-red-600 font-serif font-black uppercase tracking-[0.2em] mb-4">Enter Your Name</h2>
        <p className="text-stone-500 font-mono text-sm tracking-widest uppercase">Your name will be visible to all who walk the dark.</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
        <div className="relative">
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            placeholder="Choose a name..."
            maxLength={16}
            className="w-full bg-[#050505] border border-red-900/30 focus:border-red-600/60 px-6 py-5 text-xl text-stone-200 font-serif uppercase tracking-[0.15em] placeholder:text-stone-700 placeholder:normal-case focus:outline-none shadow-[0_0_20px_rgba(153,27,27,0.1)] focus:shadow-[0_0_30px_rgba(185,28,28,0.2)] transition-all"
            autoFocus
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-stone-700">
            {username.length}/16
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-xs font-mono uppercase tracking-widest">{error}</p>
        )}

        <button
          type="submit"
          disabled={username.trim().length < 2}
          className="w-full bg-red-950/20 border border-red-900/40 hover:bg-red-900/30 hover:border-red-700/50 py-5 text-sm font-bold uppercase tracking-[0.2em] text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-mono shadow-[0_0_20px_rgba(153,27,27,0.1)]"
        >
          Descend Into The Dark
        </button>
      </form>

      {/* Base Stats Preview */}
      <div className="mt-14 w-full max-w-md">
        <div className="text-[10px] text-stone-700 uppercase tracking-widest mb-4 font-mono">All warriors begin equal</div>
        <div className="bg-[#050505] border border-neutral-900 p-5 font-mono text-xs space-y-3 text-stone-500">
          <div className="flex justify-between"><span>Vitality</span><span className="text-red-500 font-bold">100 HP</span></div>
          <div className="flex justify-between"><span>Blood Magic</span><span className="text-purple-500 font-bold">50 Mana</span></div>
          <div className="flex justify-between"><span>Base Strike</span><span className="text-stone-300 font-bold">12 DMG</span></div>
          <div className="flex justify-between"><span>Blood Essence</span><span className="text-red-800 font-bold">100</span></div>
          <div className="border-t border-neutral-900 pt-3 mt-3 text-stone-700 italic text-[10px]">
            Grow stronger through Skill Points and ancient Tomes.
          </div>
        </div>
      </div>
    </div>
  );
}
