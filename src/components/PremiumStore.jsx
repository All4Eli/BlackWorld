'use client';
import { useState } from 'react';

export default function PremiumStore({ hero, updateHero }) {
    const [tab, setTab] = useState('BLOOD_STONES');
    const bloodStones = hero?.blood_stones || 0;

    const buyBloodStones = async (amount, costStr) => {
        // Simulating Stripe Flow
        const confirmed = confirm(`Simulating checkout for ${costStr}. Proceed?`);
        if (confirmed) {
            try {
                const res = await fetch('/api/premium/buy', { method: 'POST', body: JSON.stringify({ action: 'BUY_CURRENCY', amount }) });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                updateHero(data.updatedHero);
                alert(`Purchase Successful! +${amount} Blood Stones added to your character.`);
            } catch(err) { alert(`Purchase failed: ${err.message}`); }
        }
    };

    const buyItem = async (itemName, cost) => {
        if (bloodStones < cost) {
            return alert(`Not enough Blood Stones for ${itemName}.`);
        }
        const confirmed = confirm(`Purchase ${itemName} for ${cost} Blood Stones?`);
        if (confirmed) {
            try {
                const res = await fetch('/api/premium/buy', { method: 'POST', body: JSON.stringify({ action: 'BUY_ITEM', itemName, cost }) });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                updateHero(data.updatedHero);
                alert(`${itemName} purchased successfully.`);
            } catch(err) { alert(`Purchase failed: ${err.message}`); }
        }
    };

    const BS_PACKS = [
        { name: 'Handful of Blood', stones: 1000, bonus: 0, price: '$0.99' },
        { name: 'Pouch of Blood', stones: 5000, bonus: 550, price: '$4.99' },
        { name: 'Satchel of Blood', stones: 11000, bonus: 1500, price: '$9.99' },
        { name: 'Chest of Blood', stones: 24000, bonus: 4000, price: '$19.99' },
    ];

    const COSMETICS = [
        { name: 'Voidfire Edge (Skin)', type: 'Weapon Skin', cost: 350 },
        { name: 'Abyssal Plate (Skin)', type: 'Armor Skin', cost: 800 },
        { name: 'Champion Aura', type: 'Visual Effect', cost: 500 },
        { name: 'Shadow Wisp', type: 'Companion Pet', cost: 1200 },
    ];

    const CONVENIENCE = [
        { name: 'Minor Shield Crystal', type: 'Enhancement (-15% break)', cost: 25 },
        { name: 'Sanctuary Crystal', type: 'Enhancement (Downgrade only)', cost: 75 },
        { name: 'Inventory Expansion (+20)', type: 'Account Upgrade', cost: 300 },
        { name: 'Auto-Loot Familiar', type: 'Account Upgrade', cost: 500 },
    ];

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="flex justify-between items-center bg-[#050505] border border-red-900/40 p-6 shadow-2xl">
                <div>
                    <h1 className="text-3xl font-serif tracking-widest text-[#cf2a2a] uppercase mb-1">Covenant Exchange</h1>
                    <div className="text-stone-500 font-mono text-xs uppercase">Power comes at a price.</div>
                </div>
                <div className="text-right">
                    <div className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-1 flex items-center justify-end gap-2">
                        <span className="text-[#cf2a2a]">✧</span> Blood Stones
                    </div>
                    <div className="text-3xl font-serif text-[#cf2a2a]">{bloodStones.toLocaleString()}</div>
                </div>
            </div>

            <div className="border border-red-950/40 bg-[#050505]">
                <div className="flex border-b border-red-900/40 font-mono text-[10px] sm:text-xs text-stone-500 tracking-widest uppercase overflow-x-auto">
                    {['BLOOD_STONES', 'COSMETICS', 'CONVENIENCE'].map(t => (
                        <button key={t} onClick={() => setTab(t)} className={`flex-1 py-4 whitespace-nowrap px-4 font-serif text-sm sm:text-lg ${tab === t ? 'bg-red-950/20 text-[#cf2a2a] border-b-2 border-[#cf2a2a]' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>
                            {t.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                <div className="p-8 min-h-[400px]">
                    {tab === 'BLOOD_STONES' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {BS_PACKS.map(pack => (
                                <div key={pack.name} className="border border-red-900/30 bg-black flex flex-col group hover:border-[#cf2a2a]/60 transition cursor-pointer" onClick={() => buyBloodStones(pack.stones + pack.bonus, pack.price)}>
                                    <div className="p-6 text-center border-b border-neutral-800 flex-1 flex flex-col justify-center items-center">
                                        <div className="text-4xl mb-4 text-[#cf2a2a] opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-transform">✧</div>
                                        <div className="text-xl font-serif text-stone-200 uppercase tracking-widest leading-tight">{pack.stones.toLocaleString()}</div>
                                        {pack.bonus > 0 && <div className="text-xs font-mono text-orange-500 uppercase mt-2">+{pack.bonus.toLocaleString()} Bonus</div>}
                                    </div>
                                    <div className="bg-red-950/20 text-center py-4 font-mono text-sm text-[#cf2a2a] uppercase tracking-widest font-bold group-hover:bg-[#cf2a2a] group-hover:text-black transition-colors">
                                        {pack.price} USD
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'COSMETICS' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {COSMETICS.map(item => (
                                 <div key={item.name} className="flex justify-between items-center border border-neutral-800 bg-[#020202] p-4 group">
                                     <div className="flex items-center gap-4">
                                         <div className="w-12 h-12 bg-neutral-900 border border-neutral-700 flex items-center justify-center text-stone-600">?</div>
                                         <div>
                                            <div className="font-serif text-stone-300 uppercase tracking-widest">{item.name}</div>
                                            <div className="text-[10px] text-stone-500 font-mono uppercase mt-1">{item.type}</div>
                                         </div>
                                     </div>
                                     <button onClick={() => buyItem(item.name, item.cost)} className="px-4 py-2 border border-red-900/50 text-[#cf2a2a] font-mono text-xs uppercase tracking-widest hover:bg-red-950/30 flex items-center gap-2">
                                         <span>✧</span> {item.cost}
                                     </button>
                                 </div>
                             ))}
                        </div>
                    )}

                    {tab === 'CONVENIENCE' && (
                        <div className="grid grid-cols-1 gap-4">
                             <div className="bg-red-950/10 border border-red-900/30 p-4 mb-4">
                                 <p className="text-xs font-mono text-stone-400 uppercase tracking-widest text-center">None of these items grant raw combat power. All enhancements are convenience-based.</p>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {CONVENIENCE.map(item => (
                                    <div key={item.name} className="flex flex-col border border-neutral-800 bg-[#020202] p-5">
                                        <div className="font-serif text-stone-300 uppercase tracking-widest mb-1">{item.name}</div>
                                        <div className="text-[10px] text-stone-500 font-mono uppercase mb-4">{item.type}</div>
                                        <div className="mt-auto pt-4 border-t border-neutral-900 flex justify-end">
                                            <button onClick={() => buyItem(item.name, item.cost)} className="px-6 py-2 bg-neutral-900 border border-neutral-700 text-stone-300 font-mono text-xs uppercase tracking-widest hover:border-[#cf2a2a] hover:text-[#cf2a2a] flex items-center gap-2 transition-colors">
                                                <span>✧</span> {item.cost}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
