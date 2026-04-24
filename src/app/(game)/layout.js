import { auth } from '@/lib/auth';
import * as HeroDal from '@/lib/db/dal/hero';
import * as InventoryDal from '@/lib/db/dal/inventory';
import { sqlOne } from '@/lib/db/pool';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({ subsets: ['latin'] });

export default async function GameLayout({ children }) {
  const { userId } = await auth();
  
  if (!userId) {
    redirect('/');
  }

  // Fetch essential state for the sidebar
  const { data: stats } = await HeroDal.getHeroStats(userId);
  if (!stats || stats.hp === undefined) {
      // For character creation routing, not handled here
      return <div className="text-white">Player not found or needs initialization.</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-[#050505] text-gray-300 font-sans selection:bg-[#8b0000] selection:text-white pb-16 md:pb-0">
      {/* Sidebar - Sharp edges (no rounded corners), dark panel background */}
      <aside className="w-64 bg-[#1a1a1a] border-r border-[#333] flex flex-col justify-between shrink-0 h-full overflow-y-auto hidden md:flex">
        
        {/* Top Section: Logo & Vitals */}
        <div className="p-6">
          <h1 className={`${playfair.className} text-[#8b0000] text-2xl font-bold tracking-widest mb-8 uppercase border-b border-[#333] pb-4`}>
            BlackWorld
          </h1>

          <div className="space-y-4 mb-8">
            <div className="space-y-1">
              <div className="flex justify-between text-xs uppercase tracking-widest text-gray-400">
                <span>HP</span>
                <span>{stats.hp} / {stats.max_hp}</span>
              </div>
              <div className="w-full bg-[#050505] h-2 border border-[#333]">
                <div className="bg-[#8b0000] h-full" style={{ width: `${Math.max(0, (stats.hp / stats.max_hp) * 100)}%` }} />
              </div>
            </div>

             <div className="space-y-1">
              <div className="flex justify-between text-xs uppercase tracking-widest text-gray-400">
                <span>Mana</span>
                <span>{stats.mana} / {stats.max_mana}</span>
              </div>
              <div className="w-full bg-[#050505] h-2 border border-[#333]">
                <div className="bg-[#3b5b8a] h-full" style={{ width: `${Math.max(0, (stats.mana / stats.max_mana) * 100)}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs uppercase tracking-widest text-[#8b0000]">
                <span>Blood Essence</span>
                <span>{stats.essence} / {stats.max_essence}</span>
              </div>
            </div>

             <div className="space-y-1 mt-4 pt-4 border-t border-[#333]">
              <div className="flex justify-between text-xs uppercase tracking-widest text-yellow-600">
                <span>Gold</span>
                <span>{stats.gold.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <nav className="space-y-2 uppercase tracking-widest text-sm">
            <Link href="/dashboard" className="block px-4 py-2 hover:bg-[#050505] hover:text-white transition-colors border-l-2 border-transparent hover:border-[#8b0000]">
               Dashboard
            </Link>
            <Link href="/explore" className="block px-4 py-2 hover:bg-[#050505] hover:text-white transition-colors border-l-2 border-transparent hover:border-[#8b0000]">
               🗡 Explore
            </Link>
            <Link href="/covens" className="block px-4 py-2 hover:bg-[#050505] hover:text-white transition-colors border-l-2 border-transparent hover:border-[#8b0000]">
               ✟ The Underbelly
            </Link>
            <Link href="/leaderboards" className="block px-4 py-2 hover:bg-[#050505] hover:text-white transition-colors border-l-2 border-transparent hover:border-[#8b0000]">
               ♛ Hall of Legends
            </Link>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="p-6 border-t border-[#333] text-xs text-center text-gray-500 uppercase tracking-widest">
            Level {stats.level} <br/> 
            <span className="text-[#8b0000]">Immortal Entity</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#050505]">
        {children}
      </main>

      {/* Mobile Tab Bar Header/Navigation */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#1a1a1a] border-t border-[#333] flex justify-around p-3 z-50 shadow-[0_-4px_6px_rgba(0,0,0,0.5)]">
        <Link href="/dashboard" className="text-gray-400 hover:text-white flex flex-col items-center uppercase tracking-widest text-[10px]">
          <span className="text-lg">⚙</span>
          <span className="mt-1">Dash</span>
        </Link>
        <Link href="/explore" className="text-gray-400 hover:text-[#8b0000] flex flex-col items-center uppercase tracking-widest text-[10px]">
          <span className="text-lg">🗡</span>
          <span className="mt-1">Battle</span>
        </Link>
        <Link href="/covens" className="text-gray-400 hover:text-white flex flex-col items-center uppercase tracking-widest text-[10px]">
          <span className="text-lg">✟</span>
          <span className="mt-1">Covens</span>
        </Link>
        <Link href="/leaderboards" className="text-gray-400 hover:text-white flex flex-col items-center uppercase tracking-widest text-[10px]">
          <span className="text-lg">♛</span>
          <span className="mt-1">Legends</span>
        </Link>
      </nav>
    </div>
  );
}
