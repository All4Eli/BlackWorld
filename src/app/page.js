'use client';
import { usePlayerData } from '@/hooks/usePlayerData';
import { useUser, UserButton, SignOutButton } from '@clerk/nextjs';
import { getDailyQuests } from '@/lib/gameData';
import BootScreen from '@/components/BootScreen';
import CharacterCreator from '@/components/CharacterCreator';
import ExplorationEngine from '@/components/ExplorationEngine';
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
    setSaveData({ ...saveData, stage: 'DEATH', heroData: null });
  };

  const handleRestart = () => {
    setSaveData({ ...saveData, stage: 'CREATOR', heroData: null });
  };

  const handleMainMenu = () => {
    setSaveData({ stage: 'BOOT', heroData: null });
  };

  const showGameNav = stage !== 'BOOT' && isSignedIn;

  return (
    <main className="min-h-screen bg-[#030303] text-stone-300 font-serif relative overflow-hidden flex flex-col">
      {/* Universal Gothic Atmosphere */}
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/5 via-black to-black pointer-events-none z-0"></div>

      {/* PERSISTENT GAME NAV — visible on all screens except BOOT */}
      {showGameNav && (
        <nav className="w-full bg-black/60 backdrop-blur-sm border-b border-neutral-900 px-6 py-3 flex justify-between items-center relative z-30 font-mono">
          <div className="flex items-center gap-6">
            <span className="text-red-700 font-serif font-black text-lg uppercase tracking-[0.2em]">BlackWorld</span>
            
            {saveData.heroData && (
              <div className="hidden md:flex gap-6 text-xs uppercase tracking-widest text-stone-500">
                <span>{saveData.heroData.name} <span className="text-red-700">Lvl {saveData.heroData.level}</span></span>
                <span className="text-yellow-600">{saveData.heroData.gold}g</span>
                <span className="text-red-500">{saveData.heroData.hp}/{saveData.heroData.maxHp} HP</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-xs uppercase tracking-widest">
            <button onClick={handleMainMenu} className="text-stone-600 hover:text-stone-300 transition-colors">
              Main Menu
            </button>
            <SignOutButton>
              <button className="text-stone-600 hover:text-red-500 transition-colors">Sign Out</button>
            </SignOutButton>
            <UserButton />
          </div>
        </nav>
      )}

      <div className="w-full relative z-10 flex flex-col items-center justify-center flex-1">
        {stage === 'BOOT' && <BootScreen onStart={handleStartBoot} />}
        {stage === 'CREATOR' && <CharacterCreator onCreateCharacter={handleCreateCharacter} />}
        {stage === 'EXPLORATION' && <ExplorationEngine hero={saveData.heroData} updateHero={updateHero} onFindCombat={handleEnterCombat} />}
        {stage === 'COMBAT' && <CombatEngine heroDef={saveData.heroData} zone={saveData.combatZone} onVictory={handleVictory} onHeroDeath={handleDeath} />}
        {stage === 'DEATH' && <DeathScreen onRestart={handleRestart} />}
      </div>
    </main>
  );
}
