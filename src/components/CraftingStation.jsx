'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function CraftingStation({ hero, updateHero, onBack }) {
    const [recipes, setRecipes] = useState([]);
    const [tab, setTab] = useState('FORGE');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRecipes = async () => {
            setLoading(true);
            const { data } = await supabase.from('recipes').select('*').limit(20);
            if (data) setRecipes(data);
            setLoading(false);
        };
        fetchRecipes();
    }, []);

    const craftItem = (recipe) => {
        if (hero.gold < recipe.gold_cost) return alert("Not enough gold to forge.");
        
        // Simulating infinite progression logic:
        // No skill caps, exponential cost check
        const chance = Math.random();
        if (chance <= recipe.success_chance) {
            updateHero({ 
                ...hero, 
                gold: hero.gold - recipe.gold_cost
            });
            alert(`Forged!`);
        } else {
             updateHero({ 
                ...hero, 
                gold: hero.gold - recipe.gold_cost
            });
            alert(`The forge ruined the material... (${(recipe.success_chance * 100).toFixed(0)}% success chance)`);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            <div className="flex justify-between items-center mb-2">
                <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest">
                    ← Back to Market
                </button>
            </div>

            <div className="border border-red-950/40 bg-[#050505] shadow-[0_0_50px_rgba(255,100,0,0.02)]">
                 <div className="flex border-b border-red-900/40 font-mono text-xs text-stone-500 tracking-widest uppercase">
                    <button onClick={() => setTab('FORGE')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg ${tab === 'FORGE' ? 'bg-orange-950/20 text-stone-200 border-b-2 border-orange-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>The Blacksmith</button>
                    <button onClick={() => setTab('ENHANCE')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg ${tab === 'ENHANCE' ? 'bg-orange-950/20 text-stone-200 border-b-2 border-orange-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Infusion Forge</button>
                </div>

                <div className="p-8 min-h-[400px]">
                     {tab === 'FORGE' && (
                         loading ? <div className="text-stone-600 font-mono text-xs uppercase text-center py-10">Stoking the flames...</div> : 
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {recipes.map(r => (
                                  <div key={r.id} className="border border-neutral-800 bg-black p-5 flex justify-between items-center group">
                                      <div>
                                          <h3 className="font-bold text-stone-300 uppercase font-serif tracking-widest">{r.name}</h3>
                                          <div className="text-[10px] text-stone-500 font-mono uppercase mt-1">Tier: {r.tier} • Rate: {r.success_chance * 100}%</div>
                                          <div className="text-[10px] text-yellow-600 font-mono mt-2">Cost: {r.gold_cost}g</div>
                                      </div>
                                      <button onClick={() => craftItem(r)} className="px-5 py-2 border border-red-900/30 text-orange-500 uppercase font-mono tracking-widest text-[10px] hover:bg-red-950/30">
                                          Craft
                                      </button>
                                  </div>
                              ))}
                         </div>
                     )}

                     {tab === 'ENHANCE' && (
                          <div className="text-center py-10">
                              <h3 className="font-serif text-orange-700 text-xl tracking-widest uppercase">Infinite Potential</h3>
                              <p className="font-mono text-xs text-stone-500 mt-2">Push your gear beyond mortal limits. No level cap. No stat ceiling. Only risk.</p>
                              <div className="mt-8 border border-neutral-800 animate-pulse bg-[#020202] py-10 w-1/2 mx-auto cursor-pointer hover:border-orange-900/50">
                                  <span className="font-mono text-xs text-stone-600 tracking-widest uppercase">Select an item to enhance</span>
                              </div>
                          </div>
                     )}
                </div>
            </div>
        </div>
    );
}
