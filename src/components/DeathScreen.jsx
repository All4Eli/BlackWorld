'use client';

export default function DeathScreen({ onRestart }) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center animate-in fade-in duration-1000">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/10 via-black to-black pointer-events-none"></div>

      <div className="text-center relative z-10 p-10 border border-red-900/20 bg-[#050505] shadow-[0_0_100px_rgba(153,27,27,0.3)]">
        <h2 className="text-6xl md:text-8xl font-black text-red-700 uppercase tracking-[0.2em] mb-8 font-serif drop-shadow-[0_0_10px_rgba(153,27,27,0.8)]">
          You Died
        </h2>
        <p className="text-stone-500 font-mono tracking-widest uppercase mb-12">
          Your algorithm was insufficient. The memory is wiped.
        </p>

        <button 
          onClick={onRestart}
          className="border border-red-900/50 bg-red-950/20 hover:bg-red-900/40 text-red-500 font-bold px-10 py-4 font-mono uppercase tracking-[0.2em] transition-all text-sm w-full md:w-auto"
        >
          Reboot Simulation
        </button>
      </div>
    </div>
  );
}
