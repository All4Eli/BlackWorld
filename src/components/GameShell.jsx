'use client';
import { useState, useEffect } from 'react';
import { calculateEssence, getDailyQuests } from '@/lib/gameData';
import DashboardView from './DashboardView';
import ExplorationEngine from './ExplorationEngine';
import ArsenalView from './ArsenalView';
import SkillTreePanel from './SkillTreePanel';
import QuestLog from './QuestLog';

export default function GameShell({ hero, updateHero, onFindCombat }) {
  const [activeTab, setActiveTab] = useState('DASHBOARD');

  // Recalculate essence on mount (server-side regen)
  useEffect(() => {
    if (!hero) return;
    const { essence, newTimestamp } = calculateEssence(
      hero.essence_last_regen,
      hero.essence ?? 100,
      100
    );
    if (essence !== (hero.essence ?? 100)) {
      updateHero({ ...hero, essence, essence_last_regen: newTimestamp });
    }
  }, []);

  // Initialize daily quests if missing or stale
  useEffect(() => {
    if (!hero) return;
    const today = new Date().toISOString().split('T')[0];
    const existingQuests = hero.daily_quests;
    if (!existingQuests || !existingQuests[0]?.id?.includes(today)) {
      updateHero({ ...hero, daily_quests: getDailyQuests() });
    }
  }, []);

  const unspentPoints = hero?.unspentSkillPoints ?? 0;
  const unfinishedQuests = hero?.daily_quests?.some(q => q.progress < q.target) ?? false;

  const tabs = [
    { id: 'DASHBOARD', label: 'Dashboard' },
    { id: 'EXPLORE', label: 'Explore' },
    { id: 'ARSENAL', label: 'Arsenal' },
    { id: 'SKILLS', label: 'Skills', alert: unspentPoints > 0 },
    { id: 'CONTRACTS', label: 'Contracts', alert: unfinishedQuests }
  ];

  return (
    <div className="flex flex-col w-full h-full min-h-[80vh] max-w-6xl mx-auto px-4 py-6 animate-in fade-in duration-700">
      
      {/* Game Navigation Menu */}
      <nav className="flex flex-wrap gap-2 mb-8 border-b border-red-900/30 pb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] transition-all ${
              activeTab === tab.id 
                ? 'bg-red-950/40 text-stone-200 border border-red-800 shadow-[0_0_15px_rgba(153,27,27,0.2)]' 
                : 'bg-black/50 text-stone-500 border border-neutral-900 hover:border-red-900/50 hover:text-stone-300'
            }`}
          >
            {tab.label}
            {tab.alert && (
               <span className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
            )}
          </button>
        ))}
      </nav>

      {/* View Rendering Container */}
      <div className="flex-1">
        {activeTab === 'DASHBOARD' && <DashboardView hero={hero} />}
        {activeTab === 'EXPLORE' && <ExplorationEngine hero={hero} updateHero={updateHero} onFindCombat={onFindCombat} />}
        {activeTab === 'ARSENAL' && <ArsenalView hero={hero} updateHero={updateHero} />}
        {activeTab === 'SKILLS' && <SkillTreePanel hero={hero} updateHero={updateHero} inline={true} />}
        {activeTab === 'CONTRACTS' && <QuestLog quests={hero.daily_quests} inline={true} />}
      </div>

    </div>
  );
}
