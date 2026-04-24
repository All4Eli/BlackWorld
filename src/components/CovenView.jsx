'use client';
import { useState, useEffect } from 'react';
import CovenRaidView from './CovenRaidView';

export default function CovenView({ hero, updateHero, onBack }) {
  const [covens, setCovens] = useState([]);
  const [covenDetails, setCovenDetails] = useState(null); // { coven, roster }
  const [loading, setLoading] = useState(true);

  // States for Founding
  const [foundingMode, setFoundingMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [foundingError, setFoundingError] = useState('');
  const [raidMode, setRaidMode] = useState(false);

  const isPledged = !!hero?.coven_id;
  const currentGold = hero?.gold || 0;

  useEffect(() => {
    if (isPledged) {
      // Fetch Sanctuary Data
      fetch(`/api/covens/${hero.coven_id}`)
        .then(res => res.json())
        .then(data => {
            if (data.coven) setCovenDetails(data);
            setLoading(false);
        })
        .catch(err => { console.error(err); setLoading(false); });
    } else {
      // Fetch Directory Data
      fetch('/api/covens')
        .then(res => res.json())
        .then(data => {
            if (data.covens) setCovens(data.covens);
            setLoading(false);
        })
        .catch(err => { console.error(err); setLoading(false); });
    }
  }, [isPledged, hero?.coven_id]);

  const handleFoundCoven = async () => {
      if (currentGold < 1000) {
          setFoundingError("Not enough gold.");
          return;
      }
      setFoundingError('');
      setLoading(true);
      try {
          const res = await fetch('/api/covens', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: newName, tag: newTag, description: newDesc })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to found coven');
          
          updateHero(data.updatedHero);
          setFoundingMode(false);
      } catch(err) {
          setFoundingError(err.message);
      } finally {
          setLoading(false);
      }
  };

  const handleJoinCoven = async (cId) => {
      setLoading(true);
      try {
          const res = await fetch('/api/covens/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ covenId: cId })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          updateHero(data.updatedHero);
      } catch(err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  const handleLeaveCoven = async () => {
     if(!confirm("Are you sure you want to abandon your coven?")) return;
     setLoading(true);
     try {
         const res = await fetch('/api/covens/leave', { method: 'POST' });
         const data = await res.json();
         if (!res.ok) throw new Error(data.error);

         updateHero(data.updatedHero);
         setCovenDetails(null);
     } catch(err) {
         console.error(err);
     } finally {
         setLoading(false);
     }
  };

  if (loading) {
      return <div className="text-stone-500 font-mono text-center py-20">Loading Coven Network...</div>;
  }

  // ==== SANCTUARY VIEW (ALREADY PLEDGED) ====
  if (isPledged && covenDetails) {
      const { coven, roster } = covenDetails;

      if (raidMode) {
        return <CovenRaidView hero={hero} updateHero={updateHero} onBack={() => setRaidMode(false)} />;
      }

      return (
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500 pb-10">
          <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left mb-4">
            ← Back to City Directory
          </button>

          <div className="border-2 border-red-900/30 bg-[#050505] shadow-[0_0_50px_rgba(153,27,27,0.1)] p-8">
             <div className="flex justify-between items-start border-b border-red-900/40 pb-6 mb-8">
                <div>
                   <h2 className="text-4xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2">
                       <span className="text-red-700 mr-3">[{coven.tag}]</span>{coven.name}
                   </h2>
                   <p className="text-stone-500 font-mono text-xs tracking-widest max-w-lg italic">{coven.description}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-4">
                   <div className="border border-neutral-800 bg-[#020202] px-4 py-2 font-mono text-xs text-stone-400">
                      Members: <span className="text-stone-200 font-bold">{coven.member_count}</span>
                   </div>
                   <button onClick={() => setRaidMode(true)} className="px-4 py-2 border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-900 hover:text-white uppercase tracking-widest text-[10px] font-mono transition-colors font-bold">
                       ⚔ Raid Boss
                    </button>
                    <button onClick={handleLeaveCoven} className="text-stone-600 hover:text-red-500 uppercase tracking-widest text-[10px] font-mono transition-colors">
                       Abandon Coven
                    </button>
                 </div>
             </div>

             <div className="bg-[#020202] border border-neutral-900 p-6">
                <h3 className="font-serif text-xl uppercase tracking-widest text-stone-400 mb-6">Coven Roster</h3>
                <div className="flex flex-col gap-2">
                   <div className="grid grid-cols-12 gap-4 pb-2 border-b border-neutral-800 text-[10px] text-stone-600 font-mono uppercase tracking-widest">
                      <div className="col-span-6">Brotherhood Name</div>
                      <div className="col-span-3 text-center">Power Level</div>
                      <div className="col-span-3 text-right">Role</div>
                   </div>
                   {roster?.map(member => (
                       <div key={member.clerk_user_id} className={`grid grid-cols-12 gap-4 py-3 border-b border-neutral-900/50 items-center font-mono text-sm ${member.clerk_user_id === hero.clerk_user_id ? 'bg-red-950/10' : ''}`}>
                          <div className="col-span-6 font-bold text-stone-300">
                             {member.username} 
                             {member.clerk_user_id === hero.clerk_user_id && <span className="ml-2 text-[10px] text-red-500 tracking-widest font-normal uppercase">(You)</span>}
                          </div>
                          <div className="col-span-3 text-center text-red-700">{member.level}</div>
                          <div className={`col-span-3 text-right uppercase tracking-widest text-[10px] ${member.coven_role === 'Leader' ? 'text-yellow-600 font-bold' : 'text-stone-500'}`}>
                             {member.coven_role}
                          </div>
                       </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      );
  }

  // ==== DIRECTORY VIEW (UNPLEDGED) ====
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
      <div className="flex justify-between items-center mb-2">
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest">
          ← Back to City Directory
        </button>
        <button onClick={() => setFoundingMode(!foundingMode)} className="text-yellow-600 hover:text-yellow-500 font-mono text-xs uppercase tracking-widest border border-yellow-900/50 bg-yellow-950/20 px-4 py-2 hover:bg-yellow-900/40 transition-colors">
          {foundingMode ? 'Cancel' : 'Found A Coven (1000g)'}
        </button>
      </div>

      <div className="border border-neutral-900 bg-[#050505] p-8 shadow-[0_4px_30px_rgba(0,0,0,0.8)]">
        
        {foundingMode ? (
           <div className="animate-in fade-in zoom-in-95 duration-300 max-w-lg mx-auto py-8">
              <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-yellow-600 mb-2 border-b border-yellow-900/30 pb-4 text-center">Pledge the Writ</h2>
              <p className="text-stone-500 font-mono text-[10px] tracking-widest mb-8 text-center uppercase leading-relaxed">
                 Carve your name into the bloodstones. Founding a coven requires 1000 gold and marks you as an eternal leader in the dark.
              </p>

              <div className="flex flex-col gap-4 font-mono text-sm">
                 <div>
                   <label className="block text-[10px] text-stone-600 uppercase tracking-widest mb-1">Coven Name</label>
                   <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-black border border-neutral-800 text-stone-300 p-3 focus:outline-none focus:border-red-900" placeholder="E.g. Brotherhood of the Eclipse" />
                 </div>
                 
                 <div>
                   <label className="block text-[10px] text-stone-600 uppercase tracking-widest mb-1">Coven Tag (2-5 Letters)</label>
                   <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)} maxLength={5} className="w-full bg-black border border-neutral-800 text-stone-300 p-3 focus:outline-none focus:border-red-900 uppercase" placeholder="E.g. ECLIP" />
                 </div>

                 <div>
                   <label className="block text-[10px] text-stone-600 uppercase tracking-widest mb-1">Description</label>
                   <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full bg-black border border-neutral-800 text-stone-300 p-3 h-24 resize-none focus:outline-none focus:border-red-900" placeholder="What are your goals?" />
                 </div>

                 {foundingError && <div className="text-red-500 text-xs border border-red-900/50 bg-red-950/20 p-3 text-center">{foundingError}</div>}

                 <button 
                   onClick={handleFoundCoven}
                   disabled={currentGold < 1000 || newName.length < 3 || newTag.length < 2}
                   className="w-full py-4 mt-4 bg-yellow-950/30 border border-yellow-600/50 text-yellow-500 hover:bg-yellow-900/40 uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                 >
                   Establish Protocol (1000g)
                 </button>
              </div>
           </div>
        ) : (
           <>
              <h2 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2 border-b border-red-900/30 pb-4">Blood Covens</h2>
              <p className="text-stone-500 font-mono text-xs tracking-widest mb-8">Pledge your loyalty to a guild. Only the strong survive together.</p>

              <div className="flex flex-col gap-4">
                 {covens.length === 0 ? (
                    <div className="text-center text-stone-600 italic font-mono text-xs py-12 border border-neutral-800 bg-[#020202]">
                       No active covens exist. Be the first to found one.
                    </div>
                 ) : (
                    covens.map(c => (
                       <div key={c.id} className="flex flex-col md:flex-row items-center justify-between bg-[#020202] border border-neutral-800 p-5 hover:border-neutral-700 transition-colors">
                          <div className="flex-1">
                             <div className="flex items-center gap-3 mb-2">
                                <span className="text-xl font-bold uppercase font-serif text-stone-300">{c.name}</span>
                                <span className="text-[10px] uppercase font-mono tracking-widest text-red-700 border border-red-900/30 bg-red-950/10 px-2 py-0.5">[{c.tag}]</span>
                             </div>
                             <p className="text-xs text-stone-500 font-mono max-w-lg">{c.description}</p>
                          </div>
                          
                          <div className="flex items-center gap-6 mt-4 md:mt-0 font-mono">
                             <div className="text-[10px] text-stone-500 uppercase tracking-widest text-right">
                                Members<br/>
                                <span className="text-lg text-stone-300 font-bold">{c.member_count}</span>
                             </div>
                             <button onClick={() => handleJoinCoven(c.id)} className="border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-900 hover:text-stone-200 transition-colors px-6 py-3 uppercase tracking-widest text-xs font-bold">
                                Join
                             </button>
                          </div>
                       </div>
                    ))
                 )}
              </div>
           </>
        )}
      </div>
    </div>
  );
}
