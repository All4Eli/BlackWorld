'use client';
import { useState } from 'react';
import HealerView from './HealerView';
import BankView from './BankView';
import CasinoView from './CasinoView';
import ItemShopView from './ItemShopView';
import CovenView from './CovenView';
import AuctionView from './AuctionView';
import ArenaHub from './ArenaHub';
import QuestLog from './QuestLog';
import CraftingStation from './CraftingStation';
import LeaderboardHub from './LeaderboardHub';
import HallOfLegendsView from './HallOfLegendsView';
import BloodStoneShop from './BloodStoneShop';
import MonumentView from './MonumentView';
import LairView from './LairView';
import BountyBoardView from './BountyBoardView';
import CrimesView from './CrimesView';
import GymView from './GymView';
import EducationView from './EducationView';
import BazaarView from './BazaarView';
import StockMarketView from './StockMarketView';

export default function TownView() {
  const [activeLocation, setActiveLocation] = useState(null);
  const categories = [
    {
      title: 'Market District',
      locations: [
        { id: 'shop', name: 'The Merchant', description: 'Exchange gold for rare artifacts and gear.', status: null },
        { id: 'forge', name: 'The Blacksmith', description: 'Forge materials and enhance your power infinitely.', status: null },
        { id: 'bazaar', name: 'Player Bazaar', description: 'Trade items directly with other players in custom player shops.', status: null },
        { id: 'auction', name: 'Auction House', description: 'Trade legendary artifacts with other players.', status: null },
        { id: 'bank', name: 'Blood Bank', description: 'Secure your gold before diving into the dark.', status: null },
        { id: 'stocks', name: 'Black Stock Exchange', description: 'Invest gold in corporate shares and earn passive dividends.', status: null },
      ]
    },
    {
      id: 'pvp',
      title: 'The Proving Grounds',
      locations: [
        { id: 'arena', name: 'The Colosseum', description: 'Wager your gold in lethal combat against other players.', status: null },
        { id: 'gym', name: 'Iron Gym', description: 'Train your battle stats (Strength, Speed, Defense, Dexterity).', status: null },
      ]
    },
    {
      title: 'Sanctuary & Academy',
      locations: [
        { id: 'healer', name: 'The Hollow Healer', description: 'Rejuvenate health and restore flasks.', status: null },
        { id: 'education', name: 'Blackwood Academy', description: 'Enroll in courses for permanent stat boosts and special perks.', status: null },
        { id: 'quests', name: 'Notice Board', description: 'Accept contracts for bounty and glory.', status: null },
      ]
    },
    {
      title: 'The Underbelly',
      locations: [
        { id: 'crimes', name: 'Crime Syndicate', description: 'Commit street crimes and illegal heists for Gold & XP.', status: null },
        { id: 'covens', name: 'Blood Covens', description: 'Pledge loyalty to a community guild.', status: null },
        { id: 'casino', name: 'Demon Casino', description: 'Wager gold on dark outcomes.', status: null },
        { id: 'bounties', name: 'Bounty Board', description: 'Place a bounty on your enemies or claim gold for their heads.', status: null },
        { id: 'premium', name: 'Blood Stone Altar', description: 'Exchange mortal currency for Blood Stones and dark power.', status: null },
      ]
    },
    {
      title: 'Real Estate',
      locations: [
        { id: 'lairs', name: 'Estate Broker', description: 'Purchase and upgrade your personal lair.', status: null },
      ]
    },
    {
      title: 'Hall of Legends',
      locations: [
        { id: 'monuments', name: 'The Monuments', description: 'Contribute resources to build server-wide structures for permanent buffs.', status: null },
        { id: 'leaderboard', name: 'Leaderboards', description: 'Gaze upon the server rankings and living legends.', status: null },
        { id: 'politics', name: 'The Sovereign Throne', description: 'Cast Obsidian Ballots and crown the ruler of BlackWorld.', status: null },
      ]
    }
  ];

  if (activeLocation === 'crimes') return <CrimesView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'gym') return <GymView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'education') return <EducationView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'bazaar') return <BazaarView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'stocks') return <StockMarketView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'healer') return <HealerView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'bank') return <BankView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'casino') return <CasinoView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'shop') return <ItemShopView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'covens') return <CovenView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'auction') return <AuctionView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'arena') return <ArenaHub onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'quests') return <QuestLog onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'forge') return <CraftingStation onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'leaderboard') return <LeaderboardHub onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'monuments') return <MonumentView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'premium') return <BloodStoneShop onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'politics') return <HallOfLegendsView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'lairs') return <LairView onBack={() => setActiveLocation(null)} />;
  if (activeLocation === 'bounties') return <BountyBoardView onBack={() => setActiveLocation(null)} />;

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
