'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function BattlePassHub({ hero, updateHero }) {
    const [tab, setTab] = useState('TRACK');
    const [activeSeason, setActiveSeason] = useState({ name: 'Season 1: Ascendance', max_tier: 50, days_left: 42 });
    const [playerBP, setPlayerBP] = useState({ 
        current_tier: 12, 
        current_xp: 450,
        xp_per_tier: 1000, 
        is_premium: false,
        claimed_free: [1, 2, 3],
        claimed_premium: []
    });

    const PREVIEW_REWARDS = [
        { tier: 10,  free: '10 Blood Stones', premium: 'Premium Portrait Frame' },
        { tier: 20,  free: '5000 Gold', premium: 'Exclusive Core Cosmetic' },
        { tier: 30,  free: 'Safeguard Scroll', premium: 'Epic Weapon Skin' },
        { tier: 40,  free: '50 Blood Stones', premium: 'Blood Crystal: Absolute' },
        { tier: 50,  free: 'Title: Season Veteran', premium: 'Title: Season Champion' },
    ];

    const purchasePremium = () => {
        if (!hero?.blood_stones || hero.blood_stones < 1000) {
            return alert("Insufficient Blood Stones. Visit the Premium Store.");
        }
        updateHero({ ...hero, blood_stones: hero.blood_stones - 1000 });
        setPlayerBP({ ...playerBP, is_premium: true });
        alert("Battle Pass Premium Unlocked!");
    };

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="flex justify-between items-center bg-[#050505] border border-neutral-800 p-6 shadow-2xl">
                <div>
                    <h1 className="text-3xl font-serif tracking-widest text-orange-600 uppercase mb-1">{activeSeason.name}</h1>
                    <div className="text-stone-500 font-mono text-xs uppercase">{activeSeason.days_left} Days Remaining</div>
                </div>
                <div className="text-right">
                    <div className="text-sm font-mono text-stone-400 uppercase tracking-widest mb-1">Current Tier</div>
                    <div className="text-4xl font-serif text-stone-200">{playerBP.current_tier}</div>
                </div>
            </div>

            <div className="border border-neutral-800 bg-[#050505] shadow-[0_0_50px_rgba(255,100,0,0.02)]">
                 <div className="flex border-b border-neutral-800 font-mono text-xs text-stone-500 tracking-widest uppercase">
                    <button onClick={() => setTab('TRACK')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg ${tab === 'TRACK' ? 'bg-orange-950/20 text-stone-200 border-b-2 border-orange-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Reward Track</button>
                    <button onClick={() => setTab('CHALLENGES')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg ${tab === 'CHALLENGES' ? 'bg-orange-950/20 text-stone-200 border-b-2 border-orange-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Challenges</button>
                </div>

                <div className="p-8">
                     {tab === 'TRACK' && (
                         <div className="space-y-6">
                            {!playerBP.is_premium && (
                                <div className="border border-orange-900/50 bg-gradient-to-r from-orange-950/30 to-black p-6 flex justify-between items-center mb-10">
                                    <div>
                                        <h3 className="font-serif text-xl text-orange-500 uppercase tracking-widest mb-1">Unlock Premium</h3>
                                        <p className="text-stone-400 text-xs font-mono uppercase">Get exclusive skins, titles, and 400+ Blood Stones.</p>
                                    </div>
                                    <button onClick={purchasePremium} className="border border-orange-700 bg-red-950/40 text-stone-200 px-6 py-3 uppercase tracking-widest text-xs font-mono hover:bg-orange-900/50 transition whitespace-nowrap">
                                        Unlock (1,000 BS)
                                    </button>
                                </div>
                            )}

                            {/* Progress Bar */}
                            <div className="mb-10">
                                <div className="flex justify-between text-xs font-mono text-stone-500 uppercase tracking-widest mb-2">
                                    <span>Tier {playerBP.current_tier}</span>
                                    <span>{playerBP.current_xp} / {playerBP.xp_per_tier} XP</span>
                                    <span>Tier {playerBP.current_tier + 1}</span>
                                </div>
                                <div className="h-2 bg-neutral-900 border border-neutral-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-700 w-1/2" style={{ width: `${(playerBP.current_xp / playerBP.xp_per_tier) * 100}%` }}></div>
                                </div>
                            </div>

                            {/* Reward Tiers List (Abbreviated Preview) */}
                            <div className="space-y-4">
                                {PREVIEW_REWARDS.map(r => {
                                    const unlocked = playerBP.current_tier >= r.tier;
                                    return (
                                        <div key={r.tier} className={`flex border ${unlocked ? 'border-orange-900/30 bg-orange-950/10' : 'border-neutral-800 bg-[#020202] opacity-70'} overflow-hidden`}>
                                            <div className="bg-black border-r border-neutral-800 p-6 flex flex-col justify-center items-center w-24">
                                                <div className="text-[10px] text-stone-500 uppercase font-mono tracking-widest mb-1">Tier</div>
                                                <div className={`text-2xl font-serif ${unlocked ? 'text-orange-500' : 'text-stone-600'}`}>{r.tier}</div>
                                            </div>
                                            <div className="flex-1 flex">
                                                {/* Free Track */}
                                                <div className="flex-1 p-6 border-r border-neutral-800 flex justify-between items-center">
                                                    <div>
                                                        <div className="text-[10px] text-stone-500 uppercase font-mono tracking-widest mb-2">Free</div>
                                                        <div className={`font-serif tracking-widest uppercase ${unlocked ? 'text-stone-300' : 'text-stone-600'}`}>{r.free}</div>
                                                    </div>
                                                    {unlocked && (
                                                        <button className="text-[10px] border border-neutral-700 px-3 py-1 text-stone-400 uppercase tracking-widest hover:border-stone-500">Claim</button>
                                                    )}
                                                </div>
                                                {/* Premium Track */}
                                                <div className="flex-1 p-6 flex justify-between items-center bg-gradient-to-r from-red-950/10 to-transparent">
                                                    <div>
                                                        <div className="text-[10px] text-orange-900 uppercase font-mono tracking-widest mb-2 flex items-center gap-2">
                                                            <span className="text-orange-600">Premium</span>
                                                            {!playerBP.is_premium && <span className="text-neutral-500 border border-neutral-800 px-1 rounded">Locked</span>}
                                                        </div>
                                                        <div className={`font-serif tracking-widest uppercase ${unlocked && playerBP.is_premium ? 'text-orange-400' : 'text-stone-600'}`}>{r.premium}</div>
                                                    </div>
                                                    {unlocked && playerBP.is_premium && (
                                                        <button className="text-[10px] bg-orange-900/20 text-orange-500 border border-orange-800/50 px-3 py-1 uppercase tracking-widest hover:bg-orange-800 hover:text-white">Claim</button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                         </div>
                     )}

                     {tab === 'CHALLENGES' && (
                          <div className="space-y-6">
                              <h3 className="font-serif text-xl tracking-widest text-stone-300 uppercase border-b border-neutral-800 pb-2">Weekly Quests <span className="text-xs text-stone-600 font-mono ml-4">Resets in 3 days</span></h3>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Free Challenges */}
                                  <div className="border border-neutral-800 bg-[#020202] p-4 relative overflow-hidden">
                                      <div className="absolute top-0 right-0 p-2 text-orange-900/30 text-4xl">♆</div>
                                      <div className="font-mono text-xs text-stone-500 uppercase tracking-widest mb-1">Combat</div>
                                      <div className="font-serif text-stone-300 uppercase tracking-widest mb-4">Slay 100 Beasts</div>
                                      <div className="h-1 bg-neutral-900 overflow-hidden mb-2">
                                          <div className="h-full bg-stone-500 w-[45%]"></div>
                                      </div>
                                      <div className="flex justify-between text-[10px] text-stone-600 font-mono uppercase">
                                          <span>45 / 100</span>
                                          <span className="text-orange-600">+200 BP XP</span>
                                      </div>
                                  </div>

                                  <div className="border border-green-900/30 bg-[#020202] p-4 relative overflow-hidden opacity-50">
                                      <div className="absolute top-0 right-0 p-2 text-green-900/30 text-4xl">✓</div>
                                      <div className="font-mono text-xs text-stone-500 uppercase tracking-widest mb-1">Wealth</div>
                                      <div className="font-serif text-stone-300 uppercase tracking-widest mb-4">Earn 5,000 Gold</div>
                                      <div className="h-1 bg-green-900 overflow-hidden mb-2">
                                          <div className="h-full bg-green-500 w-full"></div>
                                      </div>
                                      <div className="flex justify-between text-[10px] text-green-600 font-mono uppercase">
                                          <span>Completed</span>
                                          <span>Claimed</span>
                                      </div>
                                  </div>

                                  {/* Premium Challenge */}
                                  <div className="border border-red-900/20 bg-red-950/10 p-4 relative overflow-hidden group">
                                      {!playerBP.is_premium && (
                                          <div className="absolute inset-0 bg-black/80 backdrop-blur-[1px] flex items-center justify-center z-10 transition-opacity">
                                              <span className="text-[10px] text-orange-600 uppercase border border-orange-900/50 bg-black px-3 py-1 tracking-widest">Premium Only</span>
                                          </div>
                                      )}
                                      <div className="absolute top-0 right-0 p-2 text-orange-900/20 text-4xl">✧</div>
                                      <div className="font-mono text-xs text-orange-800 uppercase tracking-widest mb-1">Dominance</div>
                                      <div className="font-serif text-orange-200 uppercase tracking-widest mb-4">Slay 3 Rare Bosses</div>
                                      <div className="h-1 bg-neutral-900 overflow-hidden mb-2">
                                          <div className="h-full bg-orange-700 w-[33%]"></div>
                                      </div>
                                      <div className="flex justify-between text-[10px] text-stone-600 font-mono uppercase">
                                          <span>1 / 3</span>
                                          <span className="text-orange-500">+500 BP XP</span>
                                      </div>
                                  </div>
                              </div>
                          </div>
                     )}
                </div>
            </div>
        </div>
    )
}
