'use client';

export default function QuestLog({ quests, onClose, inline = false }) {
  if (!quests || quests.length === 0) return null;

  const allComplete = quests.every(q => q.progress >= q.target);

  return (
    <div className={inline ? "w-full animate-in fade-in duration-500" : "fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-200"}>
      <div className={`bg-[#050505] border border-red-900/30 w-full ${inline ? 'max-w-4xl mx-auto border-t-0' : 'max-w-lg mx-4 shadow-[0_0_50px_rgba(153,27,27,0.2)] animate-in zoom-in-95 duration-300'}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-red-900/20">
          <div>
            <h2 className="text-xl font-serif font-black text-red-600 uppercase tracking-[0.2em]">Daily Contracts</h2>
            <p className="text-xs text-stone-600 font-mono uppercase tracking-widest mt-1">Resets at midnight</p>
          </div>
          {!inline && (
            <button onClick={onClose} className="text-stone-600 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest">
              Close
            </button>
          )}
        </div>

        {/* Quest List */}
        <div className="p-6 space-y-4">
          {quests.map((quest) => {
            const isDone = quest.progress >= quest.target;
            const pct = Math.min(100, Math.floor((quest.progress / quest.target) * 100));

            return (
              <div key={quest.id} className={`border p-4 transition-all ${isDone ? 'border-emerald-900/50 bg-emerald-950/10' : 'border-neutral-800 bg-black/40'}`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{quest.icon}</span>
                    <div>
                      <div className={`font-bold text-sm uppercase tracking-widest ${isDone ? 'text-emerald-500' : 'text-stone-200'}`}>
                        {quest.title} {isDone && '✓'}
                      </div>
                      <div className="text-xs text-stone-500 mt-1">{quest.description}</div>
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs shrink-0">
                    <div className={`font-bold ${isDone ? 'text-emerald-500' : 'text-stone-400'}`}>
                      {quest.progress}/{quest.target}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-neutral-900 rounded-none overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all duration-700 ${isDone ? 'bg-emerald-700' : 'bg-red-800'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Reward */}
                <div className="flex gap-4 font-mono text-[10px] uppercase tracking-widest text-stone-600">
                  <span>Reward:</span>
                  {quest.reward.gold && <span className="text-yellow-700">+{quest.reward.gold}g</span>}
                  {quest.reward.xp && <span className="text-stone-500">+{quest.reward.xp} EXP</span>}
                  {quest.reward.flasks && <span className="text-red-800">+{quest.reward.flasks} Flask</span>}
                </div>
              </div>
            );
          })}
        </div>

        {allComplete && (
          <div className="p-6 pt-0">
            <div className="border border-emerald-900/50 bg-emerald-950/20 p-4 text-center font-mono text-xs uppercase tracking-widest text-emerald-600">
              All contracts fulfilled. Return tomorrow for new orders.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
