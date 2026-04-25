'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

// ═══════════════════════════════════════════════════════════════════
// ArsenalView — Inventory & Equipment Display
// ═══════════════════════════════════════════════════════════════════
//
// MIGRATED FROM hero.artifacts (dead JSONB blob) to:
//   GET /api/inventory → normalized inventory table JOINed with items catalog
//
// Each inventory item now has:
//   inventory_id  — UUID for equip/sell operations
//   item_key      — catalog slug (e.g. 'charred_bone')
//   item_name     — display name
//   item_type     — WEAPON|ARMOR|ACCESSORY|CONSUMABLE|MATERIAL
//   item_slot     — equipment slot (mainHand, body, head, etc.)
//   item_tier     — COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|CELESTIAL
//   base_stats    — { dmg, def, hp, crit, lifesteal, ... }
//   enhancement   — upgrade level (0-25)
//   quantity      — stack size (for materials/consumables)
//   is_locked     — true if equipped or listed on auction
// ═══════════════════════════════════════════════════════════════════

export default function ArsenalView() {
  const { hero, updateHero } = usePlayer();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch inventory from the normalized table on mount ────────
  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/inventory');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setInventory(data.items || []);
      } catch (err) {
        console.error('[ArsenalView] Inventory fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, []);

  // ── equipArtifact ─────────────────────────────────────────────
  // Calls the canonical /api/equipment/equip endpoint.
  // Sends { inventoryId, slot } — the normalized contract.
  const equipArtifact = async (item) => {
    const typeToSlot = {
      WEAPON: 'mainHand', MAIN_HAND: 'mainHand', OFF_HAND: 'offHand',
      ARMOR: 'body', BODY: 'body', HEAD: 'head',
      BOOTS: 'boots', AMULET: 'amulet', RING: 'ring1',
    };
    const slotSource = item.item_slot || item.item_type;
    const slot = typeToSlot[String(slotSource).toUpperCase()];
    if (!slot) return alert('This item cannot be equipped.');

    try {
      const res = await fetch('/api/equipment/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryId: item.inventory_id,
          slot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);

      // Sync equipment to hero context if returned.
      // The API returns equipment[] as a flat array — we must map it
      // into the slot-keyed object shape that PlayerContext expects:
      //   { mainHand: { inventoryId, name, ... }, body: { ... }, ... }
      if (data.equipment) {
        const equippedMap = data.equipment.reduce((acc, e) => {
          acc[e.slot] = {
            inventoryId: e.inventory_id,
            key: e.item_key,
            name: e.custom_name || e.item_name,
            type: e.item_type,
            tier: e.custom_tier || e.item_tier,
            enhancement: e.enhancement,
            baseStats: e.base_stats,
            rolledStats: e.rolled_stats,
          };
          return acc;
        }, {});
        updateHero({ equipped: equippedMap });
      }

      // Refetch inventory to reflect the swap (old item unlocked, new item locked)
      // This handles the case where equipping triggers a swap — the old item
      // must reappear as available in the inventory list.
      try {
        const invRes = await fetch('/api/inventory');
        if (invRes.ok) {
          const invData = await invRes.json();
          setInventory(invData.items || []);
        }
      } catch {
        // Silent — worst case, the list is stale until next navigation
      }
    } catch(err) {
      alert(`Failed to equip: ${err.message}`);
    }
  };

  const getTierColor = (tier) => {
    switch(tier) {
      case 'COMMON': return 'text-stone-400 border-stone-800 bg-stone-950/10';
      case 'UNCOMMON': return 'text-green-500 border-green-900/50 bg-green-950/20';
      case 'RARE': return 'text-blue-500 border-blue-900/50 bg-blue-950/20';
      case 'EPIC': return 'text-purple-500 border-purple-900/50 bg-purple-950/20';
      case 'LEGENDARY': return 'text-yellow-500 border-yellow-600/50 bg-yellow-950/20';
      case 'CELESTIAL': return 'text-cyan-400 border-cyan-800/50 bg-cyan-950/20';
      default: return 'text-purple-400 border-purple-900/30 bg-purple-950/5';
    }
  };

  const isEquipSlot = (type) => {
    const equippable = new Set(['WEAPON', 'ARMOR', 'ACCESSORY', 'MAIN_HAND', 'OFF_HAND', 'BODY', 'HEAD', 'BOOTS', 'AMULET', 'RING']);
    return equippable.has(String(type).toUpperCase());
  };

  // Separate items by category
  const equipItems = inventory.filter(i => isEquipSlot(i.item_type) && !i.is_locked);
  const equippedItems = inventory.filter(i => i.is_locked);
  const materials = inventory.filter(i => !isEquipSlot(i.item_type) && !i.is_locked);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      {/* Inventory & Flasks */}
      <section className="flex flex-col gap-6">
        <div className="bg-[#050505] border border-neutral-900 p-6 shadow-xl">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">Provisions</h3>
          <div className="flex justify-between font-mono text-xs items-center">
            <span className="text-stone-600 uppercase tracking-widest">Crimson Flasks</span>
            <span className="text-red-500 font-bold text-lg">{hero?.flasks || 0}</span>
          </div>
        </div>

        <div className="bg-[#050505] border border-neutral-900 p-6 shadow-xl flex-1 flex flex-col">
          <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">
            Artifacts
            <span className="text-stone-700 text-xs ml-3 font-mono">[ {inventory.length} ]</span>
          </h3>
          
          <div className="flex-1">
            {loading ? (
               <div className="text-stone-700 font-mono text-xs text-center py-12 italic border border-neutral-900 animate-pulse">Loading inventory...</div>
            ) : equipItems.length === 0 && materials.length === 0 ? (
               <div className="text-stone-700 font-mono text-xs text-center py-12 italic border border-neutral-900">Your pack is empty</div>
            ) : (
               <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                 {/* Equippable items first */}
                 {equipItems.map((item) => {
                   const colors = getTierColor(item.custom_tier || item.item_tier);
                   const stats = item.base_stats || {};
                   
                   return (
                     <div key={item.inventory_id} className={`border p-4 transition-all ${colors}`}>
                       <div className="flex justify-between items-start mb-2">
                         <div className="flex gap-2 items-center">
                           <span className="text-sm font-bold uppercase tracking-wide">
                             {item.enhancement > 0 && <span className="text-yellow-500">+{item.enhancement} </span>}
                             {item.custom_name || item.item_name}
                           </span>
                           <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-current">{item.custom_tier || item.item_tier}</span>
                         </div>
                       </div>
                       
                       <div className="flex flex-wrap gap-3 text-[10px] font-mono text-stone-300 uppercase tracking-widest mb-4">
                         <span className="text-stone-500">[{item.item_type}]</span>
                         {stats.dmg > 0 && <span className="text-red-500">+{stats.dmg} DMG</span>}
                         {stats.def > 0 && <span className="text-stone-400">+{stats.def} DEF</span>}
                         {stats.hp > 0 && <span className="text-stone-300">+{stats.hp} HP</span>}
                         {stats.crit > 0 && <span className="text-yellow-500">+{stats.crit}% CRIT</span>}
                         {stats.magicDmg > 0 && <span className="text-purple-400">+{stats.magicDmg} MAGIC</span>}
                         {stats.lifesteal > 0 && <span className="text-red-400">+{stats.lifesteal} LIFESTEAL</span>}
                       </div>

                       <button onClick={() => equipArtifact(item)} className="text-[10px] font-mono uppercase tracking-widest bg-black border border-current hover:text-white w-full py-2 transition-all">
                         Equip
                       </button>
                     </div>
                   );
                 })}

                 {/* Materials / consumables */}
                 {materials.map((item) => {
                   const colors = getTierColor(item.custom_tier || item.item_tier);
                   return (
                     <div key={item.inventory_id} className={`border p-4 transition-all ${colors}`}>
                       <div className="flex justify-between items-start mb-2">
                         <div className="flex gap-2 items-center">
                           <span className="text-sm font-bold uppercase tracking-wide">{item.custom_name || item.item_name}</span>
                           {item.quantity > 1 && <span className="text-stone-500 font-mono text-xs">x{item.quantity}</span>}
                           <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-current">{item.custom_tier || item.item_tier}</span>
                         </div>
                       </div>
                       <div className="text-[10px] font-mono text-stone-600 uppercase tracking-widest mb-2">{item.item_description}</div>
                       <div className="text-[10px] font-mono uppercase tracking-widest text-stone-600 bg-neutral-900/30 py-2 text-center border border-neutral-900">Material</div>
                     </div>
                   );
                 })}
               </div>
            )}
          </div>
        </div>
      </section>

      {/* Learned Tomes */}
      <section className="bg-[#050505] border border-neutral-900 p-6 shadow-xl flex flex-col">
         <h3 className="font-serif text-xl tracking-[0.2em] uppercase text-stone-400 border-b border-red-900/30 pb-3 mb-6">Learned Tomes</h3>
         
         <div className="flex-1">
            <p className="text-[10px] font-mono text-stone-600 uppercase tracking-widest mb-6">
              Ancient knowledge cannot be unlearned. Passive benefits are always active.
            </p>

            {!hero?.learnedTomes?.length ? (
              <div className="text-stone-700 font-mono text-xs text-center py-12 italic border border-neutral-900">No tomes discovered</div>
            ) : (
              <div className="space-y-3">
                {hero.learnedTomes.map((tomeId) => {
                  const rarityStr = tomeId.includes('mythic') ? 'mythic' : tomeId.includes('legendary') ? 'legendary' : 'epic';
                  const rarityColors = {
                    mythic: 'text-fuchsia-400 border-fuchsia-900/40 bg-fuchsia-950/10',
                    legendary: 'text-yellow-500 border-yellow-900/40 bg-yellow-950/10',
                    epic: 'text-blue-400 border-blue-900/40 bg-blue-950/10'
                  };
                  
                  return (
                    <div key={tomeId} className={`border p-4 font-mono ${rarityColors[rarityStr]}`}>
                      <div className="text-sm font-bold uppercase tracking-widest mb-1">
                        {tomeId.replace('tome_', '').replace(/_/g, ' ')}
                      </div>
                      <div className="text-[10px] uppercase text-stone-500 tracking-wider">
                        {rarityStr} Tier Passive
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
         </div>
      </section>

    </div>
  );
}
