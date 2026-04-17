'use client';
import { useState } from 'react';

export default function AuthModal({ onClose, onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter a valid email and password.');
      return;
    }
    setError('');
    setLoading(true);

    // Simulate backend network request
    setTimeout(() => {
      setLoading(false);
      onAuthSuccess({ email });
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      {/* Modal Container */}
      <div className="bg-[#050505] border border-red-900/40 w-full max-w-md p-8 shadow-[0_0_50px_rgba(153,27,27,0.2)] relative animate-in zoom-in-95 duration-300">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-600 hover:text-red-500 transition-colors"
        >
          ✕
        </button>

        <h2 className="text-3xl font-serif font-black text-stone-200 uppercase tracking-[0.2em] mb-2 text-center">
          {isLogin ? 'Log In' : 'Sign Up'}
        </h2>
        <p className="text-stone-500 font-mono text-center text-xs tracking-widest uppercase mb-8">
          Log in or sign up to save your game state.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 font-mono">
          
          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-400 mb-2">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#111] border border-neutral-800 focus:border-red-900 focus:ring-1 focus:ring-red-900 outline-none text-stone-300 px-4 py-3 transition-all"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-stone-400 mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#111] border border-neutral-800 focus:border-red-900 focus:ring-1 focus:ring-red-900 outline-none text-stone-300 px-4 py-3 transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && <div className="text-red-500 text-xs text-center border-l-2 border-red-500 pl-2 -ml-2">{error}</div>}

          <button 
            disabled={loading}
            type="submit"
            className="mt-4 bg-red-950/30 border border-red-900/50 hover:bg-red-900/50 text-red-500 font-bold uppercase tracking-widest py-4 transition-all disabled:opacity-50 flex justify-center items-center gap-3"
          >
            {loading ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div> : (isLogin ? 'Log In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-8 text-center text-xs font-mono text-stone-600">
          {isLogin ? "Don't have an account?" : "Already have an account?"} 
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="ml-2 text-stone-400 hover:text-red-500 uppercase tracking-widest transition-colors"
          >
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </div>

      </div>
    </div>
  );
}
