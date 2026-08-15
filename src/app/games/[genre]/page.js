import { GENRES } from '@/data/genres';
import Link from 'next/link';

export async function generateStaticParams() {
  return GENRES.map((genre) => ({
    genre: genre.slug,
  }));
}

export async function generateMetadata({ params }) {
  const genre = GENRES.find((g) => g.slug === params.genre);
  if (!genre) {
    return { title: 'Play BlackWorld' };
  }
  
  return {
    title: `Play the Best ${genre.name} | BlackWorld`,
    description: `Looking for a hardcore ${genre.name}? Join BlackWorld, the ultimate dark fantasy MMORPG. Build your character, join a coven, and dominate a player-driven economy. Play for free today.`,
    openGraph: {
      title: `Play the Best ${genre.name} | BlackWorld`,
      description: `Experience the ultimate ${genre.name} in BlackWorld.`,
      url: `https://blackworld.vercel.app/games/${genre.slug}`,
      siteName: 'BlackWorld',
      type: 'website',
    },
    alternates: {
      canonical: `https://blackworld.vercel.app/games/${genre.slug}`,
    }
  };
}

export default function GameGenrePage({ params }) {
  const genre = GENRES.find((g) => g.slug === params.genre) || { name: 'Dark Fantasy Game', target: 'dark fantasy game' };
  
  return (
    <div className="min-h-screen bg-[#030303] text-stone-300 font-serif relative overflow-hidden flex flex-col">
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/5 via-black to-black pointer-events-none z-0"></div>
      
      <main className="relative z-10 container mx-auto px-4 py-20 flex flex-col items-center justify-center min-h-screen text-center">
        <h1 className="text-4xl md:text-6xl font-black text-red-700 tracking-[0.2em] uppercase mb-6 drop-shadow-md">
          The Ultimate {genre.name}
        </h1>
        
        <p className="max-w-2xl text-lg text-stone-400 mb-10 leading-relaxed">
          If you are searching for a hardcore <strong>{genre.name.toLowerCase()}</strong>, your journey ends here. 
          BlackWorld is a ruthless, player-driven universe where every choice matters. 
          Commit crimes, train your stats, trade in player bazaars, and wage war alongside your Coven in this unparalleled {genre.target}.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mb-12">
          <div className="bg-[#0a0a0a] border border-neutral-800 p-6 rounded-lg text-left">
            <h3 className="text-red-500 font-bold mb-2 uppercase tracking-wider text-sm">Player-Driven Economy</h3>
            <p className="text-stone-500 text-sm">Every item in the game is crafted, looted, or sold by players in real-time bazaars and auctions.</p>
          </div>
          <div className="bg-[#0a0a0a] border border-neutral-800 p-6 rounded-lg text-left">
            <h3 className="text-red-500 font-bold mb-2 uppercase tracking-wider text-sm">Deep Character Progression</h3>
            <p className="text-stone-500 text-sm">Train your strength, agility, and intelligence. Specialize in unique skill trees tailored to your playstyle.</p>
          </div>
          <div className="bg-[#0a0a0a] border border-neutral-800 p-6 rounded-lg text-left">
            <h3 className="text-red-500 font-bold mb-2 uppercase tracking-wider text-sm">Coven Warfare</h3>
            <p className="text-stone-500 text-sm">Join forces with other players to claim territories, raid dungeons, and dominate the leaderboards.</p>
          </div>
        </div>
        
        <Link 
          href="/?tab=creator"
          className="bg-red-800 hover:bg-red-700 text-white border-2 border-red-900 px-8 py-4 text-xl font-bold uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(220,38,38,0.3)] hover:shadow-[0_0_50px_rgba(220,38,38,0.5)]"
        >
          Create Your Character Now
        </Link>
        
        <div className="mt-16 text-xs text-stone-600 uppercase tracking-widest">
          <p>No downloads required. Play instantly in your browser.</p>
        </div>
      </main>
    </div>
  );
}
