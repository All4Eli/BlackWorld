'use client';
import { SignInButton, Show, UserButton } from '@clerk/nextjs';

export default function BootScreen({ onStart }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-between animate-in fade-in duration-1000 w-full relative">
      
      {/* Top Navigation Bar: Professional Game Portal Output */}
      <nav className="w-full max-w-7xl mx-auto px-6 py-8 flex justify-between items-center relative z-20 font-mono">
        <div className="text-xl font-serif font-black text-red-800 uppercase tracking-[0.3em] flex items-center gap-3">
          <span className="text-red-600">BW</span> Studio
        </div>
        
        <div className="flex gap-6 text-xs font-bold uppercase tracking-widest">
           <Show when="signed-out">
             <SignInButton mode="modal">
               <button className="text-stone-400 hover:text-white transition-colors">Log In</button>
             </SignInButton>
             <SignInButton mode="modal">
               <button className="bg-red-950/40 text-red-500 border border-red-900 hover:bg-red-900 hover:text-white px-6 py-2 transition-all">Sign Up Free</button>
             </SignInButton>
           </Show>
           <Show when="signed-in">
             <div className="flex items-center gap-4">
               <UserButton />
               <button onClick={() => onStart()} className="text-red-500 hover:text-white transition-colors border border-red-900 px-6 py-2">Enter World</button>
             </div>
           </Show>
        </div>
      </nav>

      {/* Main Hero Marketing */}
      <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10 w-full px-6">
        <div className="mb-10 relative pointer-events-none w-full max-w-5xl">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-red-600/10 blur-[120px] rounded-full"></div>
          
          <h1 className="text-5xl md:text-8xl font-black text-stone-200 uppercase tracking-[0.2em] font-serif drop-shadow-2xl mb-6 leading-tight">
            The World Is <br className="hidden md:block" /><span className="text-red-700 drop-shadow-[0_0_20px_rgba(185,28,28,0.5)]">Dead.</span>
          </h1>
          <p className="text-stone-500 font-mono tracking-[0.2em] uppercase text-sm md:text-lg max-w-2xl mx-auto leading-relaxed">
            Descend into a brutal, turn-based MMORPG. Build your legacy, execute ancient entities, and survive the apocalypse.
          </p>
        </div>

        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="group relative bg-red-700 text-black font-black px-16 py-6 tracking-[0.2em] uppercase text-sm hover:scale-105 transition-all shadow-[0_0_40px_rgba(185,28,28,0.4)] overflow-hidden">
              <span className="relative z-10">Play For Free</span>
              <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
            </button>
          </SignInButton>
        </Show>

        <Show when="signed-in">
           <button onClick={() => onStart()} className="group relative bg-black border border-red-800 text-white font-black px-16 py-6 tracking-[0.2em] uppercase text-sm hover:scale-105 transition-all shadow-[0_0_40px_rgba(185,28,28,0.4)] overflow-hidden">
             <span className="relative z-10">Proceed To Save State</span>
           </button>
        </Show>

        <div className="mt-16 flex gap-12 border-t border-neutral-900 pt-10 text-center font-mono opacity-60">
           <div>
             <div className="text-3xl font-bold font-serif text-stone-200">20M+</div>
             <div className="text-xs uppercase tracking-widest text-stone-500 mt-1">Demons Slain</div>
           </div>
           <div>
             <div className="text-3xl font-bold font-serif text-stone-200">100%</div>
             <div className="text-xs uppercase tracking-widest text-stone-500 mt-1">Hellfire Core</div>
           </div>
           <div>
             <div className="text-3xl font-bold font-serif text-stone-200 border-b-2 border-red-600 pb-1 w-max mx-auto">RPG</div>
             <div className="text-xs uppercase tracking-widest text-red-500 mt-1 font-bold">Dark Magic</div>
           </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full text-center py-6 text-stone-700 font-mono text-[10px] uppercase tracking-widest relative z-10">
         &copy; {new Date().getFullYear()} BlackWorld Studio. Built by Elijah.
      </footer>

    </div>
  );
}
