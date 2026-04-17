'use client';
import { useState, useEffect } from 'react';
import EnhancementForge from './EnhancementForge';

export default function CraftingStation({ hero, updateHero, onBack }) {
    const [recipes, setRecipes] = useState([]);
    const [tab, setTab] = useState('FORGE');
    const [loading, setLoading] = useState(true);
    const [crafting, setCrafting] = useState(null); // recipe id being crafted

    useEffect(() => {
        const fetchRecipes = async () => {
            setLoading(true);
            try {
                // Fetch recipes through our own API route to avoid RLS issues
                const res = await fetch('/api/crafting/recipes');
                if (res.ok) {
                    const data = await res.json();
                    if (data.recipes) setRecipes(data.recipes);
                }
            } catch (err) {
                console.error('Failed to load recipes:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchRecipes();
    }, []);

    const craftItem = async (recipe) => {
        if (hero.gold < recipe.gold_cost) return alert("Not enough gold to forge.");
        
        setCrafting(recipe.id);
        try {
            const response = await fetch('/api/crafting/forge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId: recipe.id })
            });
            const data = await response.json();
            
            if (!response.ok) {
                return alert(`✖ Forge Error: ${data.error}`);
            }

            updateHero(data.updatedHero);

            if (data.forgeSuccess) {
                alert(`🔥 Forged: ${recipe.name}!`);
            } else {
                alert(`☠ The forge consumed the materials... (${(recipe.success_chance * 100).toFixed(0)}% success chance)`);
            }

        } catch (err) {
            alert(`System fault: ${err.message}`);
        } finally {
            setCrafting(null);
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
                    <button onClick={() => setTab('FORGE')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg transition-colors ${tab === 'FORGE' ? 'bg-orange-950/20 text-stone-200 border-b-2 border-orange-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>The Blacksmith</button>
                    <button onClick={() => setTab('ENHANCE')} className={`flex-1 py-4 uppercase tracking-[0.2em] font-serif text-lg transition-colors ${tab === 'ENHANCE' ? 'bg-orange-950/20 text-stone-200 border-b-2 border-orange-700' : 'bg-black text-stone-500 hover:bg-neutral-900'}`}>Infusion Forge</button>
                </div>

                <div className="p-8 min-h-[400px]">
                     {tab === 'FORGE' && (
                         loading ? <div className="text-stone-600 font-mono text-xs uppercase text-center py-10">Stoking the flames...</div> : 
                         recipes.length === 0 ? (
                            <div className="text-stone-600 font-mono text-xs uppercase text-center py-10 italic">
                                 No recipes available. The Blacksmith has nothing to forge.
                            </div>
                         ) : (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {recipes.map(r => (
                                  <div key={r.id} className="border border-neutral-800 bg-black p-5 flex justify-between items-center group hover:border-neutral-700 transition-colors">
                                      <div>
                                          <h3 className="font-bold text-stone-300 uppercase font-serif tracking-widest">{r.name}</h3>
                                          <div className="text-[10px] text-stone-500 font-mono uppercase mt-1">Tier: {r.tier} • Rate: {r.success_chance * 100}%</div>
                                          <div className="text-[10px] text-yellow-600 font-mono mt-2">Cost: {r.gold_cost}g</div>
                                      </div>
                                      <button 
                                          onClick={() => craftItem(r)} 
                                          disabled={crafting === r.id || hero.gold < r.gold_cost}
                                          className="px-5 py-2 border border-red-900/30 text-orange-500 uppercase font-mono tracking-widest text-[10px] hover:bg-red-950/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      >
                                          {crafting === r.id ? 'Forging...' : 'Craft'}
                                      </button>
                                  </div>
                              ))}
                         </div>
                         )
                     )}

                     {tab === 'ENHANCE' && (
                          <div className="py-4">
                              <EnhancementForge hero={hero} updateHero={updateHero} />
                          </div>
                     )}
                </div>
            </div>
        </div>
    );
}
