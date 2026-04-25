'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

const ENHANCEMENT_TABLE = {
  1:  { success: 1.00, break: 0.00, gold: 100,    stones: 1 },
  2:  { success: 1.00, break: 0.00, gold: 200,    stones: 1 },
  3:  { success: 0.95, break: 0.00, gold: 350,    stones: 1 },
  4:  { success: 0.90, break: 0.00, gold: 500,    stones: 2 },
  5:  { success: 0.85, break: 0.00, gold: 750,    stones: 2 },
  6:  { success: 0.75, break: 0.05, gold: 1000,   stones: 3 },
  7:  { success: 0.65, break: 0.10, gold: 1500,   stones: 3 },
  8:  { success: 0.55, break: 0.15, gold: 2000,   stones: 4 },
  9:  { success: 0.45, break: 0.20, gold: 3000,   stones: 4 },
  10: { success: 0.35, break: 0.25, gold: 4500,   stones: 5 },
  11: { success: 0.30, break: 0.30, gold: 6000,   stones: 6 },
  12: { success: 0.25, break: 0.35, gold: 8000,   stones: 7 },
  13: { success: 0.20, break: 0.40, gold: 11000,  stones: 8 },
  14: { success: 0.18, break: 0.45, gold: 15000,  stones: 9 },
  15: { success: 0.15, break: 0.50, gold: 20000,  stones: 10 },
  16: { success: 0.12, break: 0.55, gold: 28000,  stones: 12 },
  17: { success: 0.10, break: 0.60, gold: 38000,  stones: 14 },
  18: { success: 0.08, break: 0.65, gold: 50000,  stones: 16 },
  19: { success: 0.06, break: 0.70, gold: 70000,  stones: 18 },
  20: { success: 0.05, break: 0.75, gold: 100000, stones: 20 }
};

const getScaledValues = (level) => ({
    success: 0.04,
    break: 0.80,
    gold: 100000 * Math.pow(1.1, level - 20),
    stones: 20 + (level - 20) * 2
});

// CONTEXT MIGRATED: hero/updateHero from usePlayer(), inventory from API
export default function EnhancementForge() {
    const { hero, updateHero } = usePlayer();
    const [selectedItem, setSelectedItem] = useState(null);
    const [protection, setProtection] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch equippable items from normalized inventory
    useEffect(() => {
        const fetchInventory = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/inventory');
                if (!res.ok) return;
                const data = await res.json();
                // Only show equippable items (not materials/consumables)
                const equippable = new Set(['WEAPON', 'ARMOR', 'ACCESSORY']);
                setInventory((data.items || []).filter(i =>
                    equippable.has(i.item_type) && !i.is_locked
                ));
            } catch (err) {
                console.error('[EnhancementForge] Failed to load inventory:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchInventory();
    }, []);

    const [protections, setProtections] = useState([
        { id: 'prot-1', name: 'Minor Safeguard Scroll', type: 'chance_boost', value: 0.1 }
    ]);
    const [pityCount, setPityCount] = useState(0);

    const level = selectedItem?.enhancement || 0;
    const tableInfo = ENHANCEMENT_TABLE[level + 1] || getScaledValues(level + 1);
    
    const pityBonus = Math.min(pityCount * 0.05, 0.50);
    const modifiedSuccess = Math.min(tableInfo.success + pityBonus, 1.0);

    const calculateBreakChance = (baseBreak, prot) => {
        if(!prot) return baseBreak;
        if(prot.type === 'chance_boost') return Math.max(0, baseBreak - prot.value);
        if(prot.type === 'full') return 0;
        return baseBreak;
    }

    const attemptEnhancement = async () => {
        if (!selectedItem) return;
        
        try {
            const res = await fetch('/api/forge/enhance', {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'x-idempotency-key': `enhance-${selectedItem.inventory_id}-${level + 1}-${Date.now()}`,
               },
               body: JSON.stringify({ 
                   inventoryId: selectedItem.inventory_id, 
                   targetLevel: level + 1,
                   protectionId: protection?.id || null 
               })
            });
            const data = await res.json();
            
            if (!res.ok) {
                return alert(data.error);
            }
            
            if (data.updatedHero) updateHero(data.updatedHero);

            // Sync inventory from server response (authoritative)
            // This handles all cases: destroyed items disappear,
            // downgraded items show correct level, etc.
            if (data.inventory) {
                const equippable = new Set(['WEAPON', 'ARMOR', 'ACCESSORY']);
                setInventory(data.inventory.filter(i =>
                    equippable.has(i.item_type) && !i.is_locked
                ));
            }
            
            if (data.outcome === 'SUCCESS') {
                alert("Enhancement SUCCESS!");
                setSelectedItem({ ...selectedItem, enhancement: (selectedItem.enhancement || 0) + 1 });
                setPityCount(0);
            } else if (data.outcome === 'DOWNGRADE') {
                alert(`Enhancement FAILED! Item Downgraded by ${data.levelsLost} levels.`);
                setSelectedItem({ ...selectedItem, enhancement: Math.max(0, (selectedItem.enhancement || 0) - data.levelsLost) });
            } else if (data.outcome === 'PROTECTED') {
                alert("Enhancement FAILED! Protected from breaking.");
            } else if (data.outcome === 'DESTROYED') {
                alert("Enhancement FAILED! Item BROKEN (Destroyed).");
                setSelectedItem(null);
            } else {
                alert("Enhancement FAILED! Materials lost, item safe.");
                setPityCount(c => c + 1);
            }

            if (protection) {
                setProtections(protections.filter(p => p.id !== protection.id));
                setProtection(null);
            }
        } catch(err) {
            console.error('Failed to enhance', err);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border border-neutral-800 bg-black p-4">
                <h3 className="font-serif text-stone-500 uppercase tracking-widest text-sm mb-4">Your Arsenal</h3>
                <div className="space-y-2">
                    {loading ? (
                        <div className="text-stone-600 text-xs text-center py-6 animate-pulse">Loading items...</div>
                    ) : inventory.length === 0 ? (
                        <div className="text-stone-600 text-xs text-center py-6">No items to enhance.</div>
                    ) : inventory.map(item => (
                        <div key={item.inventory_id} 
                             onClick={() => setSelectedItem(item)}
                             className={`p-3 border cursor-pointer ${selectedItem?.inventory_id === item.inventory_id ? 'border-orange-700 bg-orange-950/20' : 'border-neutral-800 hover:border-neutral-700'}`}>
                            <div className="font-bold text-stone-300">+{item.enhancement || 0} {item.custom_name || item.item_name}</div>
                            <div className="text-xs text-stone-500 font-mono">{item.item_tier} {item.item_type}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border border-neutral-800 bg-[#050505] p-6 relative flex flex-col justify-between">
                {selectedItem ? (
                    <>
                        <div className="text-center">
                            <h2 className="font-serif text-2xl text-orange-600 mb-1">+{selectedItem.enhancement || 0} {selectedItem.custom_name || selectedItem.item_name}</h2>
                            <div className="font-mono text-xs text-stone-500 mb-6">Target: +{(selectedItem.enhancement || 0) + 1}</div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="p-4 border border-red-900/30 bg-black">
                                    <div className="text-xs text-stone-500 uppercase mb-1">Success Chance</div>
                                    <div className="text-xl text-green-500 font-mono">
                                        {(modifiedSuccess * 100).toFixed(1)}%
                                    </div>
                                    {pityCount > 0 && <div className="text-[10px] text-yellow-500 mt-1">+{pityBonus*100}% Pity Bonus</div>}
                                </div>
                                <div className="p-4 border border-red-900/30 bg-black">
                                    <div className="text-xs text-stone-500 uppercase mb-1">Break Chance</div>
                                    <div className="text-xl text-red-500 font-mono">
                                        {(calculateBreakChance(tableInfo.break, protection) * 100).toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border border-neutral-800 bg-black mb-6 text-left">
                                <div className="text-xs text-stone-400 uppercase mb-2">Protection</div>
                                {protections.length > 0 ? (
                                    <select 
                                        className="w-full bg-neutral-900 border border-neutral-700 text-stone-300 text-sm p-2"
                                        value={protection ? protection.id : ''}
                                        onChange={(e) => setProtection(protections.find(p => p.id === e.target.value) || null)}
                                    >
                                        <option value="">None (Risk it)</option>
                                        {protections.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="text-xs text-stone-600">No protection items available.</div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-xs font-mono text-stone-500">
                                <span>Cost:</span>
                                <span className={(hero?.gold || 0) >= tableInfo.gold ? 'text-yellow-600' : 'text-red-500'}>
                                    {tableInfo.gold.toLocaleString()}g
                                </span>
                            </div>
                            <button onClick={attemptEnhancement} className="w-full py-4 border border-orange-900/50 bg-black text-orange-500 hover:bg-orange-950/30 font-serif tracking-widest uppercase transition-colors">
                                Infuse Power
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-stone-600 text-sm font-mono uppercase text-center p-10">
                        Select an item<br/>to begin infusion
                    </div>
                )}
            </div>
        </div>
    )
}
