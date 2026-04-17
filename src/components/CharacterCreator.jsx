'use client';

const CLASSES = [
  {
    id: 'blood_knight',
    name: 'Blood Knight',
    description: 'A towering juggernaut wielding heavy blades. Fueled by raw vitality.',
    hp: 140,
    mana: 20,
    dmg: 15,
    icon: '⚔️'
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    description: 'A fragile scholar of death magic. Commands immense blood magic pools.',
    hp: 70,
    mana: 100,
    dmg: 22,
    icon: '💀'
  },
  {
    id: 'cultist',
    name: 'Abyssal Cultist',
    description: 'A balanced fanatic. Siphons energy equally between sword and sorcery.',
    hp: 100,
    mana: 60,
    dmg: 18,
    icon: '👁'
  }
];

export default function CharacterCreator({ onSelectClass }) {

  return (
    <div className="animate-in fade-in duration-700 min-h-[80vh] flex flex-col items-center justify-center">
      
      <div className="text-center mb-16">
        <h2 className="text-4xl text-red-600 font-serif font-black uppercase tracking-[0.2em] mb-4">Choose Your Torment</h2>
        <p className="text-stone-500 font-mono text-sm tracking-widest uppercase">The path dictates your survival algorithm.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full">
        {CLASSES.map((c) => (
          <div 
            key={c.id}
            onClick={() => onSelectClass(c)}
            className="group cursor-pointer bg-[#050505] border border-red-900/20 hover:border-red-600/50 p-8 flex flex-col gap-6 shadow-xl hover:shadow-[0_0_30px_rgba(220,38,38,0.2)] transition-all"
          >
            <div className="text-5xl mb-4 group-hover:scale-110 transition-transform origin-left grayscale group-hover:grayscale-0">{c.icon}</div>
            
            <div>
              <h3 className="text-2xl font-serif font-bold text-stone-200 uppercase tracking-widest mb-2 group-hover:text-white">{c.name}</h3>
              <p className="text-stone-500 font-serif leading-relaxed text-sm h-16">{c.description}</p>
            </div>

            <div className="border-t border-red-900/20 pt-6 font-mono text-xs text-stone-400 space-y-3">
               <div className="flex justify-between">
                 <span>Base Vitality:</span>
                 <span className="text-red-500 font-bold">{c.hp}</span>
               </div>
               <div className="flex justify-between">
                 <span>Blood Magic:</span>
                 <span className="text-purple-500 font-bold">{c.mana}</span>
               </div>
               <div className="flex justify-between">
                 <span>Base Strike:</span>
                 <span className="text-stone-300 font-bold">{c.dmg}</span>
               </div>
            </div>

            <div className="mt-4 border border-red-900 text-center py-2 text-red-500 opacity-0 group-hover:opacity-100 uppercase tracking-widest text-xs font-bold transition-opacity">
              Select Protocol
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
