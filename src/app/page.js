'use client';
import { usePlayerData } from '@/hooks/usePlayerData';
import { useUser, UserButton, SignOutButton } from '@clerk/nextjs';
import { getDailyQuests, calcCombatStats } from '@/lib/gameData';
import { calculateSkillBonuses } from '@/lib/skillTree';
import BootScreen from '@/components/BootScreen';
import CharacterCreator from '@/components/CharacterCreator';
import GameShell from '@/components/GameShell';
import CombatEngine from '@/components/CombatEngine';
import DeathScreen from '@/components/DeathScreen';

export default function GameStateDirector() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { saveData, setSaveData, isLoading } = usePlayerData();

  const stage = saveData?.stage || 'BOOT';

  // Wait for both Clerk and the database to finish loading
  if (!isLoaded || (isSignedIn && isLoading)) {
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
        equippedWeapon: null,
        equippedArmor: null,
        essence: 100,
        essence_last_regen: new Date().toISOString(),
        daily_quests: getDailyQuests(),
        skillPoints: {},
        unspentSkillPoints: 0,
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
     setSaveData(prev => ({ ...prev, stage: 'EXPLORATION' }));
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
            
            {saveData.heroData && (
              <div className="hidden lg:flex gap-6 text-xs uppercase tracking-widest text-stone-500 bg-[#050505] border border-neutral-800 px-4 py-2">
                <span>{saveData.heroData.name} <span className="text-red-700 font-bold ml-2">Lvl {saveData.heroData.level}</span></span>
                <span className="text-yellow-600 font-bold ml-2">{(saveData.heroData.gold || 0).toLocaleString()}g</span>
                <span className="text-red-500 font-bold ml-2">{saveData.heroData.hp}/{calcCombatStats(saveData.heroData, calculateSkillBonuses(saveData.heroData.skillPoints || {})).maxHp} HP</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex relative group">
              <input 
                type="text" 
                placeholder="Lookup Player/Coven" 
                className="bg-black border border-neutral-800 focus:border-red-900 focus:outline-none text-stone-300 px-4 py-2 text-xs uppercase tracking-widest w-64 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-red-700">⌕</span>
            </div>

            <div className="flex items-center gap-4 text-xl">
               <button className="text-stone-500 hover:text-stone-200 transition-colors relative">
                 💬
               </button>
               <button className="text-stone-500 hover:text-stone-200 transition-colors relative">
                 🔔
                 <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]"></span>
               </button>
            </div>
            
            <div className="pl-4 border-l border-neutral-800">
               <UserButton 
                 appearance={{
                   elements: {
                     userButtonAvatarBox: "w-8 h-8 rounded-sm border border-neutral-700 shadow-md hover:border-red-800 transition-colors"
                   }
                 }}
               />
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
      </div>
    </main>
  );
}
