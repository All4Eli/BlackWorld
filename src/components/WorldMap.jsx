'use client';
import { useState, useEffect } from 'react';

const MAP_NODES = [
  { id: 'bone_crypts', x: 20, y: 70, label: 'Bone Crypts', icon: '✟' },
  { id: 'ashen_wastes', x: 50, y: 85, label: 'Ashen Wastes', icon: '◬' },
  { id: 'hollow_cathedral', x: 75, y: 55, label: 'Hollow Cathedral', icon: '⛫' },
  { id: 'abyssal_rift', x: 50, y: 30, label: 'Abyssal Rift', icon: '❂' },
  { id: 'throne_of_nothing', x: 80, y: 15, label: 'Throne of Nothing', icon: '☠' }
];

// Connecting paths
const CONNECTIONS = [
  ['bone_crypts', 'ashen_wastes'],
  ['ashen_wastes', 'hollow_cathedral'],
  ['hollow_cathedral', 'abyssal_rift'],
  ['abyssal_rift', 'throne_of_nothing'],
  ['ashen_wastes', 'abyssal_rift']
];

export default function WorldMap({ availableZones, lockedZones, activeBounties, onSelectZone }) {
   const [hoverState, setHoverState] = useState(null);

   const getNodeById = (id) => MAP_NODES.find(n => n.id === id);

   const getZoneData = (id) => {
       const uZone = availableZones.find(z => z.id === id);
       if (uZone) return { ...uZone, locked: false };
       const lZone = lockedZones.find(z => z.id === id);
       if (lZone) return { ...lZone, locked: true };
       return null;
   };

   return (
       <div className="relative w-full h-[500px] bg-[#020202] border border-neutral-900 overflow-hidden shadow-[inset_0_0_100px_rgba(0,0,0,0.9)] select-none">
           {/* Background Grid Decoration */}
           <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at center, #ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

           {/* SVG Path Connections */}
           <svg className="absolute inset-0 w-full h-full pointer-events-none">
               {CONNECTIONS.map(([src, target], i) => {
                   const sNode = getNodeById(src);
                   const tNode = getNodeById(target);
                   if(!sNode || !tNode) return null;
                   return (
                       <line 
                           key={i}
                           x1={`${sNode.x}%`} y1={`${sNode.y}%`}
                           x2={`${tNode.x}%`} y2={`${tNode.y}%`}
                           stroke="#1a1a1a"
                           strokeWidth="2"
                           strokeDasharray="4 4"
                       />
                   );
               })}
           </svg>

           {/* Nodes */}
           {MAP_NODES.map((node) => {
               const zone = getZoneData(node.id);
               if (!zone) return null;
               
               const isBounty = activeBounties?.includes(node.id);
               const isLocked = zone.locked;

               return (
                   <div 
                       key={node.id}
                       className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 group z-10"
                       style={{ left: `${node.x}%`, top: `${node.y}%` }}
                       onMouseEnter={() => setHoverState(node.id)}
                       onMouseLeave={() => setHoverState(null)}
                   >
                       {/* Floating Bounty Skull */}
                       {isBounty && !isLocked && (
                           <div className="absolute -top-8 text-red-500 font-bold animate-bounce drop-shadow-[0_0_10px_red]">
                               ☠
                           </div>
                       )}

                       {/* Node Marker */}
                       <button 
                           disabled={isLocked}
                           onClick={() => onSelectZone(zone)}
                           className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl transition-all duration-300
                               ${isLocked ? 'bg-neutral-950 border-neutral-900 text-neutral-800 cursor-not-allowed' : 
                               isBounty ? 'bg-black border-red-800 text-red-500 hover:bg-neutral-900 hover:border-red-500 hover:scale-110 shadow-[0_0_20px_rgba(153,27,27,0.4)]' : 
                               'bg-black border-stone-800 text-stone-300 hover:bg-neutral-900 hover:border-stone-400 hover:scale-110'}`}
                       >
                           {node.icon}
                       </button>

                       {/* Label */}
                       <div className={`mt-2 font-mono text-[9px] uppercase tracking-widest text-center px-2 py-1 bg-black border ${isLocked ? 'border-neutral-900 text-neutral-600' : 'border-neutral-800 text-stone-500'}`}>
                           {node.label}
                       </div>

                       {/* Hover Tooltip */}
                       {hoverState === node.id && (
                           <div className="absolute top-16 w-48 p-3 bg-black border border-stone-800 shadow-[0_0_30px_rgba(0,0,0,0.9)] z-50 pointer-events-none">
                               <div className={`font-serif tracking-widest uppercase text-xs font-bold mb-1 ${isLocked ? 'text-neutral-500' : 'text-stone-300'}`}>{zone.name}</div>
                               <div className="text-[10px] font-mono text-stone-600 mb-2">{zone.description}</div>
                               
                               {isLocked ? (
                                   <div className="text-[9px] font-mono text-red-900 uppercase">Requires Lvl {zone.levelReq}</div>
                               ) : (
                                   <div className="flex justify-between text-[9px] font-mono uppercase text-stone-500 border-t border-neutral-900 pt-2">
                                       <span>{zone.xpMultiplier}x XP</span>
                                       <span>{zone.goldMultiplier}x Gold</span>
                                   </div>
                               )}
                           </div>
                       )}
                   </div>
               );
           })}
       </div>
   );
}
