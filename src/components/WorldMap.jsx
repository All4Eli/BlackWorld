'use client';
import { GameIcon, IconSkull } from './icons/GameIcons';

export default function WorldMap({ availableZones, lockedZones, activeBounties, onSelectZone }) {
   const allZones = [...availableZones, ...lockedZones].sort((a, b) => a.levelReq - b.levelReq);

   return (
       <div className="flex flex-col gap-2">
           {allZones.map((zone) => {
               const isLocked = lockedZones.some(z => z.id === zone.id);
               const isBounty = activeBounties?.includes(zone.id);

               return (
                   <button
                       key={zone.id}
                       disabled={isLocked}
                       onClick={() => onSelectZone(zone)}
                       className={`
                           relative w-full text-left transition-all duration-300 group
                           ${isLocked
                               ? 'bg-[#030303] border border-neutral-900 opacity-50 cursor-not-allowed'
                               : isBounty
                                   ? 'bg-[#0a0202] border border-red-900/60 hover:border-red-700 hover:bg-red-950/20 shadow-[0_0_20px_rgba(153,27,27,0.15)]'
                                   : 'bg-[#050505] border border-neutral-800 hover:border-stone-600 hover:bg-neutral-900/50'
                           }
                       `}
                   >
                       <div className="flex items-center gap-4 p-4 sm:p-5">
                           {/* Zone Icon */}
                           <div className={`
                               w-12 h-12 shrink-0 flex items-center justify-center border rounded
                               ${isLocked
                                   ? 'border-neutral-900 text-neutral-700 bg-black'
                                   : isBounty
                                       ? 'border-red-900/50 text-red-600 bg-red-950/20'
                                       : 'border-neutral-800 text-stone-400 bg-black group-hover:text-stone-200 group-hover:border-stone-600'
                               }
                           `}>
                               <GameIcon name={zone.icon} size={24} />
                           </div>

                           {/* Zone Info */}
                           <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-3 mb-1">
                                   <h3 className={`font-serif text-sm sm:text-base uppercase tracking-[0.12em] font-bold truncate ${
                                       isLocked ? 'text-neutral-600' : 'text-stone-200 group-hover:text-white'
                                   }`}>
                                       {zone.name}
                                   </h3>
                                   {isBounty && !isLocked && (
                                       <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-red-500 bg-red-950/30 border border-red-900/40 px-2 py-0.5 shrink-0">
                                           <IconSkull size={10} /> Bounty
                                       </span>
                                   )}
                               </div>
                               <p className={`text-[11px] sm:text-xs font-mono leading-relaxed truncate ${
                                   isLocked ? 'text-neutral-700' : 'text-stone-600'
                               }`}>
                                   {zone.description}
                               </p>
                           </div>

                           {/* Zone Stats */}
                           <div className="hidden sm:flex items-center gap-6 shrink-0 pr-2">
                               <div className="text-center">
                                   <div className="text-[9px] font-mono uppercase tracking-widest text-stone-700 mb-0.5">Level</div>
                                   <div className={`text-sm font-mono font-bold ${isLocked ? 'text-red-900' : 'text-stone-400'}`}>
                                       {zone.levelReq}+
                                   </div>
                               </div>
                               <div className="text-center">
                                   <div className="text-[9px] font-mono uppercase tracking-widest text-stone-700 mb-0.5">Gold</div>
                                   <div className={`text-sm font-mono font-bold ${isLocked ? 'text-neutral-700' : 'text-yellow-700'}`}>
                                       {zone.goldMultiplier}x
                                   </div>
                               </div>
                               <div className="text-center">
                                   <div className="text-[9px] font-mono uppercase tracking-widest text-stone-700 mb-0.5">XP</div>
                                   <div className={`text-sm font-mono font-bold ${isLocked ? 'text-neutral-700' : 'text-cyan-700'}`}>
                                       {zone.xpMultiplier}x
                                   </div>
                               </div>
                           </div>

                           {/* Arrow / Lock indicator */}
                           <div className={`shrink-0 text-sm font-mono ${isLocked ? 'text-neutral-800' : 'text-stone-600 group-hover:text-stone-300 transition-transform group-hover:translate-x-1'}`}>
                               {isLocked ? (
                                   <span className="text-[10px] text-red-900 uppercase tracking-widest">Lvl {zone.levelReq}</span>
                               ) : '→'}
                           </div>
                       </div>

                       {/* Subtle bottom accent for bounty zones */}
                       {isBounty && !isLocked && (
                           <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-800/60 to-transparent" />
                       )}
                   </button>
               );
           })}
       </div>
   );
}
