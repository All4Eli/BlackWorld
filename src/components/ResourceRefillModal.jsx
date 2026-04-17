'use client';
import { useState } from 'react';

export default function ResourceRefillModal({ hero, type, requiredCost, costReason, onRefillStones, onClose }) {
    if (!type) return null; // Not open if type is null

    const limits = hero?.player_resources;
    const current = limits ? limits[`${type}_current`] : 0;
    const isDeficit = requiredCost && current < requiredCost;
    const deficitAmount = isDeficit ? requiredCost - current : 0;
    
    // Hardcoded Blood Stone costs as matched in RES_CONFIG
    const costs = { vitae: 50, resolve: 25, essence: 75 };
    const stoneCost = costs[type] || 50;
    
    // Potions mock inventory filter
    const refillItems = hero?.inventory?.filter(i => i.type === 'refill' && i.resource_type === type) || [];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#050505] border border-red-900/50 p-8 max-w-md w-full animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start mb-6">
                    <h2 className="font-serif text-2xl tracking-widest uppercase text-stone-200">Replenish {type}</h2>
                    <button onClick={onClose} className="text-stone-600 hover:text-stone-300">✕</button>
                </div>
                
                {isDeficit && (
                    <div className="bg-red-950/20 border border-red-900/30 p-4 mb-6">
                        <div className="text-[10px] font-mono uppercase text-red-500 mb-1">Insufficient Reserves</div>
                        <div className="text-sm font-serif text-stone-300">
                            {costReason || "Action"} requires <span className="text-orange-500">{requiredCost} {type}</span>.
                            You are lacking {deficitAmount}.
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    {/* Option: Blood Stones */}
                    <div className="border border-neutral-800 bg-[#020202] p-4 flex justify-between items-center group hover:border-[#cf2a2a]/50 transition-colors">
                        <div>
                            <div className="font-mono text-xs text-stone-400 uppercase tracking-widest mb-1">Covenant Refill</div>
                            <div className="text-[10px] text-stone-600 font-mono">Restores 100% instantly.</div>
                        </div>
                        <button onClick={() => onRefillStones(type, stoneCost)} className="px-5 py-2 bg-neutral-900 border border-[#cf2a2a]/30 text-[#cf2a2a] hover:bg-[#cf2a2a] hover:text-black font-mono text-xs uppercase tracking-widest transition-colors flex items-center gap-2">
                            <span>✧</span> {stoneCost}
                        </button>
                    </div>

                    {/* Option: Items */}
                    {refillItems.length > 0 ? refillItems.map(item => (
                        <div key={item.id} className="border border-neutral-800 bg-[#020202] p-4 flex justify-between items-center group hover:border-green-900/50 transition-colors">
                            <div>
                                <div className="font-mono text-xs text-stone-400 uppercase tracking-widest mb-1">{item.name} <span className="text-stone-600">x{item.quantity}</span></div>
                                <div className="text-[10px] text-stone-600 font-mono">Restores {item.restore_amount} {type}.</div>
                            </div>
                            <button className="px-5 py-2 bg-neutral-900 border border-green-900/30 text-green-500 hover:bg-green-900 hover:text-white font-mono text-xs uppercase tracking-widest transition-colors">
                                Consume
                            </button>
                        </div>
                    )) : (
                        <div className="border border-neutral-900 bg-black p-4 text-center">
                            <span className="text-[10px] font-mono text-stone-600 uppercase">No {type} restorative items in inventory</span>
                        </div>
                    )}
                </div>
                
                <div className="mt-8 pt-4 border-t border-neutral-900 text-center">
                    <span className="text-[10px] font-mono text-stone-600 uppercase">Or simply wait. Time returns to us all.</span>
                </div>
            </div>
        </div>
    );
}
