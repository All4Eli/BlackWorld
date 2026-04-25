'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { usePlayer } from '@/context/PlayerContext';
import { calculateEssence } from '@/lib/gameData';
import DashboardView from './DashboardView';
import ExplorationEngine from './ExplorationEngine';
import TownView from './TownView';
import ArsenalView from './ArsenalView';
import SkillTreePanel from './SkillTreePanel';
import QuestLog from './QuestLog';
import AchievementPanel from './AchievementPanel';
import WorldEventBanner from './WorldEventBanner';
import { GameIcon } from './icons/GameIcons';
import BlackWorldSidebar from './BlackWorldSidebar';
import GlobalChatWidget from './GlobalChatWidget';
import GatheringView from './GatheringView';
import { useSounds } from './SoundEngine';
import BloodStoneShop from './BloodStoneShop';

function SoundToggle() {
  const sound = useSounds();
  if (!sound) return null;
  return (
    <button
      onClick={sound.toggleMute}
      className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono text-stone-600 hover:text-stone-400 transition-colors"
    >
      <span className={`w-2 h-2 rounded-full ${sound.muted ? 'bg-red-800' : 'bg-emerald-700'}`} />
      {sound.muted ? 'Unmute' : 'Mute'}
    </button>
  );
}

// ── BEFORE (Prop Drilling): ─────────────────────────────────────
//   export default function GameShell({ hero, updateHero, onFindCombat })
//
//   hero and updateHero were passed as props from page.js.
//   This means:
//     1. GameShell re-renders EVERY time page.js state changes
//        (because it received a new prop reference)
//     2. Every child of GameShell also re-renders (cascading)
//     3. If we wanted hero data in a deeply nested component,
//        we'd have to thread it through every intermediate parent
//
// ── AFTER (Context Subscription): ───────────────────────────────
//   export default function GameShell({ onFindCombat })
//
//   hero and updateHero are consumed from PlayerContext.
//   onFindCombat STAYS as a prop because it triggers a page-level
//   stage transition (EXPLORATION → COMBAT), which is NOT player
//   data — it's navigation/routing logic owned by page.js.
//
export default function GameShell({ onFindCombat }) {

  // ── Subscribe to PlayerContext ──────────────────────────────
  //
  // usePlayer() calls useContext(PlayerContext) under the hood.
  // This does two things:
  //   1. Returns the current { hero, updateHero } from the nearest
  //      <PlayerProvider> ancestor
  //   2. SUBSCRIBES this component: whenever PlayerProvider's value
  //      changes, React will re-render GameShell automatically
  //
  // DESTRUCTURING: { hero, updateHero } = usePlayer()
  //   This is JavaScript "destructuring assignment." It's equivalent to:
  //     const playerContext = usePlayer();
  //     const hero = playerContext.hero;
  //     const updateHero = playerContext.updateHero;
  //   But written in one line.
  const { hero, updateHero } = usePlayer();

  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refillModal, setRefillModal] = useState(null);
  const [onlineCount, setOnlineCount] = useState(1);

  useEffect(() => {
    if (!hero) return;
    
    // Parse URL logic for persistence
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
       setActiveTab(tabParam.toUpperCase());
    }

    // Server-side initialization of timers
    const syncTimers = async () => {
        try {
            const res = await fetch('/api/player/sync-timers', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.updatedHero) {
                updateHero(data.updatedHero);
            }
        } catch (err) {
            console.error('Failed to sync game timers:', err);
        }
    };
    
    syncTimers();

    // Supabase Presence Tracking
    const channel = supabase.channel('world_presence', {
        config: { presence: { key: hero.name || 'player' } }
    });

    channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
    }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.track({ online_at: new Date().toISOString() });
        }
    });

    return () => {
        supabase.removeChannel(channel);
    };
  }, []);

  const handleTabChange = (id) => {
      setActiveTab(id);
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('tab', id.toLowerCase());
      window.history.pushState({}, '', newUrl);
  };

  const unspentPoints = hero?.skill_points_unspent ?? hero?.skillPointsUnspent ?? 0;
  const claimableQuests = hero?.daily_quests?.some(q => q.progress >= q.target && !q.claimed) ?? false;

  const mainTabs = [
    { id: 'DASHBOARD', label: 'Home', iconKey: 'home' },
    { id: 'TOWN', label: 'City', iconKey: 'city' },
    { id: 'EXPLORE', label: 'Explore', iconKey: 'explore' },
    { id: 'CONTRACTS', label: 'Quests', iconKey: 'quest', alert: claimableQuests },
    { id: 'GATHERING', label: 'Gathering', iconKey: 'gathering' }
  ];

  const charTabs = [
    { id: 'ARSENAL', label: 'Arsenal', iconKey: 'arsenal' },
    { id: 'SKILLS', label: 'Skills', iconKey: 'skills', alert: unspentPoints > 0 },
    { id: 'ACHIEVEMENTS', label: 'Legacy', iconKey: 'legacy' },
    { id: 'SHOP', label: 'Blood Shop', iconKey: 'shop' }
  ];

  const activeTabData = [...mainTabs, ...charTabs].find(t => t.id === activeTab);

  const NavItem = ({ tab, isMobile }) => {
    const active = activeTab === tab.id;
    return (
      <button
        id={`nav-${tab.id.toLowerCase()}`}
        onClick={() => {
          handleTabChange(tab.id);
          if (isMobile) setMobileMenuOpen(false);
        }}
        className={`relative flex items-center gap-3 px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] transition-all text-left w-full ${
          active 
            ? 'bg-red-950/20 text-stone-200 border-l-2 border-red-700' 
            : 'text-stone-500 hover:text-stone-300 hover:bg-white/5'
        } ${!isMobile && 'rounded-r-md'}`}
      >
        <GameIcon name={tab.iconKey} size={18} className="opacity-80" />
        {tab.label}
        {tab.alert && (
           <span className="absolute w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)] top-1/2 -translate-y-1/2 right-4" />
        )}
      </button>
    );
  };

  return (
    <>
    <WorldEventBanner />
    <div className="flex flex-col md:flex-row w-full h-full min-h-[85vh] max-w-7xl mx-auto px-4 py-6 animate-in fade-in duration-700">
      
      {/* MOBILE NAV (Top bar with Hamburger Menu, hidden on md+) */}
      <div className="md:hidden relative mb-6 z-40">
        <button 
          id="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-full flex items-center justify-between bg-[#050505] border border-neutral-800 p-4 font-mono uppercase tracking-[0.2em] text-sm text-stone-300 active:bg-neutral-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <GameIcon name={activeTabData?.iconKey || 'home'} size={20} className="opacity-80" />
            {activeTabData?.label || 'Menu'}
            {(unspentPoints > 0 || claimableQuests) && !mobileMenuOpen && (
              <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)] ml-2" />
            )}
          </div>
          <span className="text-xl text-stone-500 font-bold font-mono">{mobileMenuOpen ? '[X]' : '[=]'}</span>
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
      <aside className="hidden md:flex flex-col w-[260px] pr-6 border-r border-neutral-900/50 mr-8 flex-shrink-0">
         <div className="mb-6">
            <BlackWorldSidebar hero={hero} onNavigate={(tab) => {
               setActiveTab(tab);
               if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
            }} />
         </div>

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
         <div className="mt-8 pt-6 border-t border-red-900/20 px-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono text-stone-500">
                 <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]"></span>
                 {onlineCount} Player{onlineCount !== 1 ? 's' : ''} Online
              </div>
              <SoundToggle />
          </div>
      </aside>


      {/* View Rendering Container */}
      <main className="flex-1 overflow-x-hidden min-w-0">
        {/* ── ALL VIEWS MIGRATED TO PlayerContext ──────────────────
            Every component below now calls usePlayer() internally
            to get hero and updateHero. NO hero props are passed.

            Props that REMAIN are:
              - onFindCombat: stage transition (page.js-level)
              - onBack: navigation callback (GameShell-level)
              - inline: UI layout flag (boolean, not data)
        */}
        {activeTab === 'DASHBOARD' && <DashboardView />}
        {activeTab === 'TOWN' && <TownView />}
        {activeTab === 'EXPLORE' && <ExplorationEngine onFindCombat={onFindCombat} />}
        {activeTab === 'ARSENAL' && <ArsenalView />}
        {activeTab === 'SKILLS' && <SkillTreePanel inline={true} />}
        {activeTab === 'CONTRACTS' && <QuestLog onBack={() => setActiveTab('DASHBOARD')} />}
        {activeTab === 'ACHIEVEMENTS' && <AchievementPanel />}
        {activeTab === 'GATHERING' && <GatheringView onBack={() => setActiveTab('DASHBOARD')} />}
        {activeTab === 'SHOP' && <BloodStoneShop />}
      </main>

      {refillModal && (
        <ResourceRefillModal 
          hero={hero} 
          type={refillModal.type} 
          requiredCost={refillModal.required} 
          costReason={refillModal.reason}
          onRefillStones={async (type, cost) => {
              try {
                  const res = await fetch('/api/player/refill', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type, cost })
                  });
                  const data = await res.json();
                  if (!res.ok) {
                      return alert(data.error);
                  }
                  updateHero(data.updatedHero);
                  setRefillModal(null);
              } catch(err) {
                  alert("Failed to refill resources.");
              }
          }}
          onClose={() => setRefillModal(null)} 
        />
      )}

    </div>
    
    <GlobalChatWidget hero={hero} />
    </>
  );
}
