'use client';
import { useState } from 'react';
import { usePlayerData } from '@/hooks/usePlayerData';
import { getDailyQuests, calcCombatStats } from '@/lib/gameData';
import { calculateSkillBonuses } from '@/lib/skillTree';
import { useSocial } from '@/hooks/useSocial';
import BootScreen from '@/components/BootScreen';
import CharacterCreator from '@/components/CharacterCreator';
import GameShell from '@/components/GameShell';
import CombatEngine from '@/components/CombatEngine';
import DeathScreen from '@/components/DeathScreen';
import MailboxModal from '@/components/MailboxModal';
import NotificationsDropdown from '@/components/NotificationsDropdown';

export default function GameStateDirector() {
  const { saveData, setSaveData, isLoading, isSignedIn, logout } = usePlayerData();
  const { notifications, messages, unreadNotificationsCount, unreadMessagesCount, fetchMessages, markNotificationsRead, fetchNotifications } = useSocial();
  
  // UI State Mode
  const [showMailbox, setShowMailbox] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const stage = saveData?.stage || 'BOOT';

  // Wait for player data to finish loading
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#030303] text-stone-300 font-serif flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-red-700 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-600 font-mono uppercase tracking-widest text-xs">Loading save data...</p>
        </div>
      </main>
    );
  }

  // If not signed in and not on BOOT, reset
  if (stage !== 'BOOT' && !isSignedIn) {
    setSaveData({ stage: 'BOOT', heroData: null });
    return null;
  }

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/social/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const { results } = await res.json();
        setSearchResults(results);
      }
    } catch(err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleStartBoot = () => {
    if (saveData.heroData) {
      setSaveData({ ...saveData, stage: 'EXPLORATION' });
    } else {
      setSaveData({ ...saveData, stage: 'CREATOR' });
    }
  };

  const handleCreateCharacter = (username) => {
    setSaveData({
      ...saveData,
      stage: 'EXPLORATION',
      heroData: {
        name: username,
        hp: 100,
        maxHp: 100,
        mana: 50,
        maxMana: 50,
        dmg: 12,
        baseDmg: 12,
        gold: 0,
        bankedGold: 0,
        level: 1,
        xp: 0,
        flasks: 3,
        kills: 0,
        artifacts: [],
        equipped: {
          mainHand: null,
          offHand: null,
          body: null,
          head: null,
          ring1: null,
          ring2: null,
          amulet: null,
          boots: null
        },
        essence: 100,
        essence_last_regen: new Date().toISOString(),
        daily_quests: getDailyQuests(),
        skillPoints: {},
        skillPointsUnspent: 0,
        learnedTomes: [],
      }
    });
  };

  const updateHero = (newHeroData) => {
    setSaveData(prev => ({ ...prev, heroData: newHeroData }));
  };

  const handleEnterCombat = (combatConfig) => {
    setSaveData({ ...saveData, stage: 'COMBAT', combatZone: combatConfig?.zone || null });
  };

  const handleVictory = (updatedHero) => {
    setSaveData({ ...saveData, stage: 'EXPLORATION', heroData: updatedHero });
  };

  const handleDeath = () => {
    setSaveData(prev => ({ 
      ...prev, 
      stage: 'DEATH', 
      heroData: {
        ...prev.heroData,
        gold: Math.floor((prev.heroData.gold || 0) / 2),
        hp: 1
      }
    }));
  };

  const handleRestart = () => {
    setSaveData(prev => ({ ...prev, stage: 'EXPLORATION' }));
  };

  // Enforce bypass of BOOT if character exists (1 Account = 1 Permanent Character)
  if (stage === 'BOOT' && saveData?.heroData) {
     
     // Automatic Schema Migration: 2-slot legacy to 8-slot modern
     let migratedHero = { ...saveData.heroData };
     if (!migratedHero.equipped) {
       migratedHero.equipped = {
          mainHand: migratedHero.equippedWeapon || null,
          offHand: null,
          body: migratedHero.equippedArmor || null,
          head: null,
          ring1: null,
          ring2: null,
          amulet: null,
          boots: null
       };
       // optional: clean up legacy properties
       delete migratedHero.equippedWeapon;
       delete migratedHero.equippedArmor;
     }

     setSaveData(prev => ({ ...prev, stage: 'EXPLORATION', heroData: migratedHero }));
     return null; // Let the next render handle it
  }

  const showGameNav = stage !== 'BOOT' && isSignedIn;

  return (
    <main className="min-h-screen bg-[#030303] text-stone-300 font-serif relative overflow-hidden flex flex-col">
      {/* Universal Gothic Atmosphere */}
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/5 via-black to-black pointer-events-none z-0"></div>

      {/* PERSISTENT GAME NAV — MMO Social Style */}
      {showGameNav && (
        <nav className="w-full bg-black/80 backdrop-blur-md border-b-2 border-red-900/30 px-6 py-4 flex justify-between items-center relative z-30 font-mono shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
          <div className="flex items-center gap-8">
            <span className="text-red-700 font-serif font-black text-xl uppercase tracking-[0.2em] shadow-red-900 drop-shadow-md">BlackWorld</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex relative group">
              <input 
                type="text" 
                placeholder="Lookup Player/Coven" 
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="bg-black border border-neutral-800 focus:border-red-900 focus:outline-none text-stone-300 px-4 py-2 text-xs uppercase tracking-widest w-64 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-red-700">
                {searching ? '...' : '⌕'}
              </span>
              
              {/* Search Dropdown */}
              {(searchResults.length > 0 || searchQuery.length >= 2) && (
                <div className="absolute top-full mt-2 w-full bg-[#050505] border border-neutral-800 shadow-xl z-50 animate-in slide-in-from-top-2">
                   {searchResults.length > 0 ? (
                     searchResults.map(res => (
                        <div key={res.clerk_user_id} className="p-3 border-b border-neutral-900 flex justify-between items-center hover:bg-neutral-900 transition-colors cursor-default">
                          <div>
                            <div className="text-stone-300 font-bold uppercase tracking-wider">{res.username}</div>
                            <div className="text-[9px] text-stone-600 uppercase tracking-widest">ID: {res.clerk_user_id.split('_')[1]}</div>
                          </div>
                          <span className="text-xs text-red-700 font-bold bg-red-950/20 px-2 py-0.5 border border-red-900/30">Lv {res.level}</span>
                        </div>
                     ))
                   ) : !searching ? (
                     <div className="p-4 text-center text-stone-600 text-xs italic">No players found.</div>
                   ) : null}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 text-xl">
               <button onClick={() => setShowMailbox(true)} className="text-stone-500 hover:text-stone-200 transition-colors relative">
                 💬
                 {unreadMessagesCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]"></span>}
               </button>
               
               <div className="relative">
                 <button onClick={() => setShowNotifications(true)} className="text-stone-500 hover:text-stone-200 transition-colors relative">
                   ⚠
                   {unreadNotificationsCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]"></span>}
                 </button>
                 {showNotifications && (
                   <NotificationsDropdown 
                     notifications={notifications}
                     onMarkRead={markNotificationsRead}
                     onFlushRead={fetchNotifications}
                     onClose={() => setShowNotifications(false)} 
                   />
                 )}
               </div>
            </div>
            
            <div className="pl-4 border-l border-neutral-800">
               <button
                 onClick={logout}
                 className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hover:text-red-500 border border-neutral-800 hover:border-red-900 px-3 py-1.5 transition-all"
               >
                 Sign Out
               </button>
            </div>
          </div>
        </nav>
      )}

      <div className="w-full relative z-10 flex flex-col items-center justify-center flex-1">
        {stage === 'BOOT' && <BootScreen onStart={handleStartBoot} />}
        {stage === 'CREATOR' && <CharacterCreator onCreateCharacter={handleCreateCharacter} />}
        {stage === 'EXPLORATION' && <GameShell hero={saveData.heroData} updateHero={updateHero} onFindCombat={handleEnterCombat} />}
        {stage === 'COMBAT' && <CombatEngine heroDef={saveData.heroData} zone={saveData.combatZone} onVictory={handleVictory} onHeroDeath={handleDeath} />}
        {stage === 'DEATH' && <DeathScreen onRestart={handleRestart} />}
        
        {/* Modals placed outside main flow layout but within the page */}
        {showMailbox && <MailboxModal onClose={() => setShowMailbox(false)} messages={messages} onRefresh={fetchMessages} />}
      </div>
    </main>
  );
}
