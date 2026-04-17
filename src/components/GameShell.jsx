'use client';
import { useState, useEffect } from 'react';
import { calculateEssence, getDailyQuests } from '@/lib/gameData';
import DashboardView from './DashboardView';
import ExplorationEngine from './ExplorationEngine';
import TownView from './TownView';
import ArsenalView from './ArsenalView';
import SkillTreePanel from './SkillTreePanel';
import QuestLog from './QuestLog';

export default function GameShell({ hero, updateHero, onFindCombat }) {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const mainTabs = [
    { id: 'DASHBOARD', label: 'Home', icon: '⌂' },
    { id: 'TOWN', label: 'City', icon: '♜' },
    { id: 'EXPLORE', label: 'Explore', icon: '⛫' },
    { id: 'CONTRACTS', label: 'Quests', icon: '⚑', alert: unfinishedQuests }
  ];

  const charTabs = [
    { id: 'ARSENAL', label: 'Arsenal', icon: '⚔' },
    { id: 'SKILLS', label: 'Skills', icon: '✧', alert: unspentPoints > 0 }
  ];

  const activeTabData = [...mainTabs, ...charTabs].find(t => t.id === activeTab);

  const NavItem = ({ tab, isMobile }) => {
    const active = activeTab === tab.id;
    return (
      <button
        onClick={() => {
          setActiveTab(tab.id);
          if (isMobile) setMobileMenuOpen(false);
        }}
        className={`relative flex items-center gap-3 px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] transition-all text-left w-full ${
          active 
            ? 'bg-red-950/20 text-stone-200 border-l-2 border-red-700' 
            : 'text-stone-500 hover:text-stone-300 hover:bg-white/5'
        } ${!isMobile && 'rounded-r-md'}`}
      >
        <span className="text-lg opacity-80">{tab.icon}</span>
        {tab.label}
        {tab.alert && (
           <span className="absolute w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)] top-1/2 -translate-y-1/2 right-4" />
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-full min-h-[85vh] max-w-7xl mx-auto px-4 py-6 animate-in fade-in duration-700">
      
      {/* MOBILE NAV (Top bar with Hamburger Menu, hidden on md+) */}
      <div className="md:hidden relative mb-6 z-40">
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-full flex items-center justify-between bg-[#050505] border border-neutral-800 p-4 font-mono uppercase tracking-[0.2em] text-sm text-stone-300 active:bg-neutral-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl opacity-80">{activeTabData?.icon || '⌂'}</span>
            {activeTabData?.label || 'Menu'}
            {(unspentPoints > 0 || unfinishedQuests) && !mobileMenuOpen && (
              <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)] ml-2" />
            )}
          </div>
          <span className="text-xl text-stone-500 font-bold">{mobileMenuOpen ? '✕' : '☰'}</span>
        </button>

        {mobileMenuOpen && (
          <nav className="absolute top-full left-0 w-full bg-[#050505] border border-t-0 border-neutral-800 shadow-2xl flex flex-col p-2 animate-in slide-in-from-top-2 duration-200">
             <div className="mb-4">
                <h3 className="text-[10px] text-stone-600 font-mono uppercase tracking-widest mb-2 px-4 pt-2">Main</h3>
                <div className="flex flex-col gap-1">
                   {mainTabs.map(tab => <NavItem key={tab.id} tab={tab} isMobile={true} />)}
                </div>
             </div>
             <div>
                <h3 className="text-[10px] text-stone-600 font-mono uppercase tracking-widest mb-2 px-4">Character</h3>
                <div className="flex flex-col gap-1">
                   {charTabs.map(tab => <NavItem key={tab.id} tab={tab} isMobile={true} />)}
                </div>
             </div>
          </nav>
        )}
      </div>

      {/* DESKTOP NAV (Left Sidebar, visible on md+) */}
      <aside className="hidden md:flex flex-col w-56 pr-6 border-r border-red-900/20 mr-8 flex-shrink-0">
         <div className="mb-8">
            <h3 className="text-[10px] text-stone-600 font-mono uppercase tracking-widest mb-3 px-4">Main</h3>
            <div className="flex flex-col gap-1">
               {mainTabs.map(tab => <NavItem key={tab.id} tab={tab} isMobile={false} />)}
            </div>
         </div>
         <div>
            <h3 className="text-[10px] text-stone-600 font-mono uppercase tracking-widest mb-3 px-4">Character</h3>
            <div className="flex flex-col gap-1">
               {charTabs.map(tab => <NavItem key={tab.id} tab={tab} isMobile={false} />)}
            </div>
         </div>
      </aside>

      {/* View Rendering Container */}
      <main className="flex-1 overflow-x-hidden min-w-0">
        {activeTab === 'DASHBOARD' && <DashboardView hero={hero} updateHero={updateHero} />}
        {activeTab === 'TOWN' && <TownView hero={hero} updateHero={updateHero} />}
        {activeTab === 'EXPLORE' && <ExplorationEngine hero={hero} updateHero={updateHero} onFindCombat={onFindCombat} />}
        {activeTab === 'ARSENAL' && <ArsenalView hero={hero} updateHero={updateHero} />}
        {activeTab === 'SKILLS' && <SkillTreePanel hero={hero} updateHero={updateHero} inline={true} />}
        {activeTab === 'CONTRACTS' && <QuestLog quests={hero.daily_quests} inline={true} />}
      </main>

    </div>
  );
}
