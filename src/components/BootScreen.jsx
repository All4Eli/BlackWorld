'use client';
import { useState } from 'react';

export default function BootScreen({ onStart }) {
  const [mode, setMode] = useState(null); // null | 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = mode === 'login'
      ? { email, password }
      : { email, password, username };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }

      // Session cookie is set by the server, reload to pick it up
      window.location.reload();
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between animate-in fade-in duration-1000 w-full relative">
      
      {/* Top Navigation Bar */}
      <nav className="w-full max-w-7xl mx-auto px-6 py-8 flex justify-between items-center relative z-20 font-mono">
        <div className="text-xl font-serif font-black text-red-800 uppercase tracking-[0.3em] flex items-center gap-3">
          <span className="text-red-600">BW</span>
        </div>
        
        <div className="flex gap-4 text-xs font-bold uppercase tracking-widest">
          {!mode && (
            <>
              <button onClick={() => setMode('login')} className="text-stone-400 hover:text-white transition-colors">Log In</button>
              <button onClick={() => setMode('register')} className="bg-red-950/40 text-red-500 border border-red-900 hover:bg-red-900 hover:text-white px-6 py-2 transition-all">Sign Up Free</button>
            </>
          )}
          {mode && (
            <button onClick={() => { setMode(null); setError(''); }} className="text-stone-500 hover:text-white transition-colors">✕ Close</button>
          )}
        </div>
      </nav>

      {/* Main Hero Marketing */}
      <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10 w-full px-6">
        
        {!mode && (
          <>
            <div className="mb-10 relative pointer-events-none w-full max-w-5xl">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-red-600/10 blur-[120px] rounded-full"></div>
              
              <h1 className="text-5xl md:text-8xl font-black text-stone-200 uppercase tracking-[0.2em] font-serif drop-shadow-2xl mb-6 leading-tight">
                The World Is <br className="hidden md:block" /><span className="text-red-700 drop-shadow-[0_0_20px_rgba(185,28,28,0.5)]">Dead.</span>
              </h1>
              <p className="text-stone-500 font-mono tracking-[0.2em] uppercase text-sm md:text-lg max-w-2xl mx-auto leading-relaxed">
                Descend into a brutal, turn-based MMORPG. Build your legacy, execute ancient entities, and survive the apocalypse.
              </p>
            </div>

            <button onClick={() => setMode('register')} className="group relative bg-red-700 text-black font-black px-16 py-6 tracking-[0.2em] uppercase text-sm hover:scale-105 transition-all shadow-[0_0_40px_rgba(185,28,28,0.4)] overflow-hidden">
              <span className="relative z-10">Play For Free</span>
              <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
            </button>

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
          </>
        )}

        {/* Native Auth Modal */}
        {mode && (
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-[#050505] border border-red-900/40 p-8 shadow-[0_0_60px_rgba(185,28,28,0.15)]">
              <h2 className="text-2xl font-serif font-black uppercase tracking-[0.15em] text-stone-200 mb-2">
                {mode === 'login' ? 'Return To The Abyss' : 'Forge Your Soul'}
              </h2>
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-8">
                {mode === 'login' ? 'Authenticate your essence.' : 'Create your immortal account.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      required
                      className="w-full bg-black border border-neutral-800 focus:border-red-900 focus:outline-none text-stone-200 px-4 py-3 font-mono text-sm tracking-widest transition-colors"
                      placeholder="Your dark name..."
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full bg-black border border-neutral-800 focus:border-red-900 focus:outline-none text-stone-200 px-4 py-3 font-mono text-sm tracking-widest transition-colors"
                    placeholder="soul@blackworld.io"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-black border border-neutral-800 focus:border-red-900 focus:outline-none text-stone-200 px-4 py-3 font-mono text-sm tracking-widest transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="text-red-500 text-xs font-mono uppercase tracking-widest bg-red-950/30 border border-red-900/40 p-3 text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-700 text-black font-black py-4 uppercase tracking-[0.15em] text-sm hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(185,28,28,0.3)]"
                >
                  {loading ? 'Processing...' : mode === 'login' ? 'Enter The Darkness' : 'Create Account'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                  className="text-[10px] font-mono uppercase tracking-widest text-stone-600 hover:text-red-500 transition-colors"
                >
                  {mode === 'login' ? 'No account? Create one.' : 'Already have an account? Log in.'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 left-0 w-full flex flex-col items-center justify-center opacity-30 z-20 font-mono text-[10px] uppercase tracking-widest text-[#cf2a2a] space-y-1">
         <div className="border-t border-[#cf2a2a]/30 w-32 mb-2"></div>
         <span>Server Validated // Engine v1.0.3</span>
         &copy; {new Date().getFullYear()} BlackWorld. Built by Elijah.
      </div>

    </div>
  );
}
