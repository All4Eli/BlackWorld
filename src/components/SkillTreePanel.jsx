'use client';
import { SKILL_TREE, calculateSkillBonuses } from '@/lib/skillTree';

export default function SkillTreePanel({ hero, updateHero, onClose }) {
  const skillPoints = hero.skillPoints || {};
  const availablePoints = (hero.unspentSkillPoints ?? 0);
  const bonuses = calculateSkillBonuses(skillPoints);

  const canAllocate = (skill) => {
    if (availablePoints <= 0) return false;
    const currentRank = skillPoints[skill.id] || 0;
    if (currentRank >= skill.maxRank) return false;
    if (skill.requires) {
      const reqRank = skillPoints[skill.requires] || 0;
      if (reqRank < skill.reqRank) return false;
    }
    return true;
  };

  const allocate = (skillId) => {
    const current = skillPoints[skillId] || 0;
    const newSkillPoints = { ...skillPoints, [skillId]: current + 1 };
    updateHero({
      ...hero,
      skillPoints: newSkillPoints,
      unspentSkillPoints: availablePoints - 1,
    });
  };

  const getRarityColor = (skill) => {
    const rank = skillPoints[skill.id] || 0;
    if (rank >= skill.maxRank) return 'border-emerald-800 bg-emerald-950/10';
    if (rank > 0) return 'border-yellow-900/50 bg-yellow-950/5';
    return 'border-neutral-800 bg-black/40';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-in fade-in duration-200">
      <div className="bg-[#050505] border border-red-900/30 shadow-[0_0_60px_rgba(153,27,27,0.15)] w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4 animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-red-900/20 sticky top-0 bg-[#050505] z-10">
          <div>
            <h2 className="text-xl font-serif font-black text-red-600 uppercase tracking-[0.2em]">Skill Tree</h2>
            <p className="text-xs text-stone-600 font-mono uppercase tracking-widest mt-1">
              {availablePoints > 0
                ? <span className="text-yellow-600">{availablePoints} point{availablePoints > 1 ? 's' : ''} to spend</span>
                : 'Level up to earn more points'}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-600 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest">
            Close
          </button>
        </div>

        {/* Branches */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(SKILL_TREE).map(([branchId, branch]) => (
            <div key={branchId} className="border border-neutral-800 bg-[#020202]">
              {/* Branch Header */}
              <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
                <span className="text-2xl">{branch.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-stone-200 uppercase tracking-widest">{branch.name}</h3>
                  <p className="text-[10px] text-stone-600 mt-0.5">{branch.description}</p>
                </div>
              </div>

              {/* Skills */}
              <div className="p-3 space-y-2">
                {branch.skills.map((skill) => {
                  const rank = skillPoints[skill.id] || 0;
                  const isMaxed = rank >= skill.maxRank;
                  const canSpend = canAllocate(skill);
                  const isLocked = skill.requires && (skillPoints[skill.requires] || 0) < skill.reqRank;

                  return (
                    <div
                      key={skill.id}
                      className={`border p-3 transition-all ${getRarityColor(skill)} ${isLocked ? 'opacity-40' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-xs font-bold uppercase tracking-widest ${isMaxed ? 'text-emerald-500' : rank > 0 ? 'text-yellow-600' : 'text-stone-400'}`}>
                          {skill.name}
                        </span>
                        <span className="text-[10px] font-mono text-stone-600">
                          {rank}/{skill.maxRank}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-600 mb-2">{skill.description}</p>
                      {isLocked && (
                        <p className="text-[9px] text-red-900 font-mono uppercase">
                          Requires: {SKILL_TREE[branchId].skills.find(s => s.id === skill.requires)?.name} Rank {skill.reqRank}
                        </p>
                      )}
                      {!isLocked && !isMaxed && (
                        <button
                          onClick={() => canSpend && allocate(skill.id)}
                          disabled={!canSpend}
                          className="w-full mt-1 text-[10px] font-mono uppercase tracking-widest border border-neutral-800 py-1.5 transition-all disabled:opacity-20 disabled:cursor-not-allowed text-stone-500 hover:text-yellow-500 hover:border-yellow-900/50"
                        >
                          {canSpend ? '+ Allocate Point' : isMaxed ? 'Maxed' : 'No Points'}
                        </button>
                      )}
                      {isMaxed && (
                        <div className="text-[10px] text-emerald-700 font-mono uppercase tracking-widest text-center py-1">✓ Mastered</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Active Bonuses Summary */}
        <div className="p-6 border-t border-neutral-800">
          <div className="text-[10px] text-stone-700 font-mono uppercase tracking-widest mb-3">Active Skill Bonuses</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-xs">
            {bonuses.maxHp > 0 && <div className="text-red-500">+{bonuses.maxHp} Max HP</div>}
            {bonuses.baseDmg > 0 && <div className="text-stone-300">+{bonuses.baseDmg} DMG</div>}
            {bonuses.maxMana > 0 && <div className="text-purple-400">+{bonuses.maxMana} Mana</div>}
            {bonuses.critChance > 0 && <div className="text-yellow-600">{bonuses.critChance}% Crit</div>}
            {bonuses.lifesteal > 0 && <div className="text-red-400">+{bonuses.lifesteal} Lifesteal</div>}
            {bonuses.damageReduction > 0 && <div className="text-stone-400">-{bonuses.damageReduction} DMG Taken</div>}
            {bonuses.magicDmg > 0 && <div className="text-purple-300">+{bonuses.magicDmg} Magic DMG</div>}
            {bonuses.flaskBonus > 0 && <div className="text-red-300">+{bonuses.flaskBonus} Flask Heal</div>}
            {Object.values(bonuses).every(v => v === 0 || v === false) && <div className="text-stone-700 italic col-span-4">No skills allocated yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
