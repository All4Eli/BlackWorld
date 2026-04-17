'use client';
import { useState } from 'react';
import HealerView from './HealerView';
import BankView from './BankView';
import CasinoView from './CasinoView';
import ItemShopView from './ItemShopView';
import CovenView from './CovenView';
import AuctionView from './AuctionView';

export default function TownView({ hero, updateHero }) {
  const [activeLocation, setActiveLocation] = useState(null);
  const categories = [
    {
      title: 'Market District',
      locations: [
        { id: 'shop', name: 'The Merchant', description: 'Exchange gold for rare artifacts and gear.', status: null },
        { id: 'auction', name: 'Auction House', description: 'Trade legendary artifacts with other players.', status: null },
        { id: 'bank', name: 'Blood Bank', description: 'Secure your gold before diving into the dark.', status: null },
      ]
    },
    {
      title: 'Sanctuary',
      locations: [
        { id: 'healer', name: 'The Hollow Healer', description: 'Rejuvenate health and restore flasks.', status: null },
      ]
    },
    {
      title: 'The Underbelly',
      locations: [
        { id: 'covens', name: 'Blood Covens', description: 'Pledge loyalty to a community guild.', status: null },
        { id: 'casino', name: 'Demon Casino', description: 'Wager gold on dark outcomes.', status: null },
      ]
    }
  ];

  if (activeLocation === 'healer') return <HealerView hero={hero} updateHero={updateHero} onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'bank') return <BankView hero={hero} updateHero={updateHero} onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'casino') return <CasinoView hero={hero} updateHero={updateHero} onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'shop') return <ItemShopView hero={hero} updateHero={updateHero} onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'covens') return <CovenView hero={hero} updateHero={updateHero} onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'auction') return <AuctionView hero={hero} updateHero={updateHero} onBack={() => setActiveLocation(null)} />;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 animate-in slide-in-from-bottom-4 duration-700">
      
      {/* Banner */}
      <div className="relative w-full h-64 border border-red-900/30 overflow-hidden flex flex-col items-center justify-center p-8 text-center bg-[#070707]">
        {/* Abstract dark vibe background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/10 via-black to-black opacity-80 z-0"></div>
        <div className="relative z-10">
           <h1 className="text-4xl font-black uppercase tracking-[0.3em] font-serif text-red-700 shadow-black drop-shadow-md mb-2">City of the Damned</h1>
           <p className="text-stone-500 font-mono text-sm tracking-widest max-w-lg">
             A sprawling ruin where the ambitious trade secrets, and the desperate wager their souls.
           </p>
        </div>
      </div>

      {/* Directory */}
      <div className="flex flex-col gap-10">
        {categories.map(cat => (
          <div key={cat.title}>
             <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-stone-600 border-b border-red-900/20 pb-2 mb-4 pl-2">
               {cat.title}
             </h2>
             <div className="flex flex-col border border-neutral-900 bg-black/40">
                {cat.locations.map((loc, idx) => (
                 <button 
                   key={loc.id}
                   onClick={() => setActiveLocation(loc.id)}
                   className={`w-full flex justify-between items-center text-left p-5 transition-colors group hover:bg-neutral-900/50 cursor-pointer ${
                      idx !== cat.locations.length - 1 ? 'border-b border-neutral-800' : ''
                   }`}
                 >
                   <div>
                     <div className="flex items-center gap-3">
                       <h3 className="text-stone-200 font-bold uppercase tracking-wider text-sm font-serif">{loc.name}</h3>
                       {loc.status && (
                          <span className={`text-[9px] px-2 py-0.5 rounded-sm font-mono uppercase tracking-widest ${loc.status === 'Coming Soon' ? 'bg-neutral-800 text-stone-500' : 'bg-red-950/50 text-red-500 border border-red-900/50'}`}>
                            {loc.status}
                          </span>
                       )}
                     </div>
                     <p className="text-xs font-mono text-stone-500 mt-1">{loc.description}</p>
                   </div>
                   <span className="text-stone-600 text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                 </button>
               ))}
             </div>
          </div>
        ))}
      </div>

    </div>
  );
}
