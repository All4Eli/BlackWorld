'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabaseClient';
import { GameIcon } from './icons/GameIcons';

// CONTEXT MIGRATED: hero/updateHero now from usePlayer().
export default function AchievementPanel() {
    const { hero, updateHero } = usePlayer();
    const [achievements, setAchievements] = useState([]);
    const [tab, setTab] = useState('achievements');
    const [loading, setLoading] = useState(true);
    const [justUnlocked, setJustUnlocked] = useState([]);

    useEffect(() => {
        const syncAchvs = async () => {
            setLoading(true);
            try {
                // Trigger backend evaluation logic
                const res = await fetch('/api/achievements/sync', { method: 'POST' });
                const json = await res.json();
                
                if (res.ok) {
                    if (json.newlyUnlocked && json.newlyUnlocked.length > 0) {
                        setJustUnlocked(json.newlyUnlocked);
                        if (json.updatedHero) updateHero(json.updatedHero);
                    }
                }
                
                // Fetch dictionary and player's specific unlocks
                const [{ data: dict }, { data: pAchvs }] = await Promise.all([
                    supabase.from('achievements').select('*'),
                    supabase.from('player_achievements').select('achievement_id, unlocked_at')
                ]);

                if (dict && pAchvs) {
                    const unlockedIds = pAchvs.map(p => p.achievement_id);
                    // Add hardcoded logical dictionary for our custom backend triggers if they aren't in DB yet
                    const fullDict = [
                        ...dict,
                        // Level Milestones
                        { id: 'lvl_5', name: 'Apprentice', description: 'Reach Level 5.', points: 10, category: 'combat', iconKey: 'arsenal' },
                        { id: 'lvl_10', name: 'Adept', description: 'Reach Level 10.', points: 20, category: 'combat', iconKey: 'arsenal' },
                        { id: 'lvl_15', name: 'Veteran', description: 'Reach Level 15.', points: 30, category: 'combat', iconKey: 'arsenal' },
                        { id: 'lvl_25', name: 'Master', description: 'Reach Level 25.', points: 50, category: 'combat', iconKey: 'arsenal' },
                        { id: 'lvl_35', name: 'Grand Master', description: 'Reach Level 35.', points: 75, category: 'combat', iconKey: 'arsenal' },
                        { id: 'lvl_50', name: 'Transcendent', description: 'Reach Level 50.', points: 100, category: 'combat', iconKey: 'arsenal' },
                        // Combat
                        { id: 'kills_10', name: 'First Blood', description: 'Slay 10 enemies.', points: 10, category: 'combat', iconKey: 'skull' },
                        { id: 'kills_50', name: 'Bloodied', description: 'Slay 50 enemies.', points: 25, category: 'combat', iconKey: 'skull' },
                        { id: 'kills_100', name: 'Slayer', description: 'Slay 100 enemies.', points: 50, category: 'combat', iconKey: 'skull' },
                        { id: 'kills_500', name: 'Executioner', description: 'Slay 500 enemies.', points: 100, category: 'combat', iconKey: 'skull' },
                        { id: 'kills_1000', name: 'Genocide', description: 'Slay 1,000 enemies.', points: 200, category: 'combat', iconKey: 'skull' },
                        { id: 'first_death', name: 'Taste of Death', description: 'Die for the first time.', points: 5, category: 'combat', iconKey: 'skull' },
                        { id: 'boss_slayer', name: 'Boss Slayer', description: 'Defeat a boss enemy.', points: 15, category: 'combat', iconKey: 'crown' },
                        { id: 'boss_hunter', name: 'Boss Hunter', description: 'Defeat 10 boss enemies.', points: 50, category: 'combat', iconKey: 'crown' },
                        { id: 'boss_legend', name: 'Boss Legend', description: 'Defeat 50 boss enemies.', points: 100, category: 'combat', iconKey: 'crown' },
                        // Economy
                        { id: 'gold_1k', name: 'Hoarder', description: 'Bank 1,000 gold.', points: 10, category: 'economy', iconKey: 'gold' },
                        { id: 'gold_10k', name: 'Baron', description: 'Bank 10,000 gold.', points: 50, category: 'economy', iconKey: 'gold' },
                        { id: 'gold_50k', name: 'Magnate', description: 'Bank 50,000 gold.', points: 75, category: 'economy', iconKey: 'gold' },
                        { id: 'gold_100k', name: 'Sovereign of Wealth', description: 'Bank 100,000 gold.', points: 100, category: 'economy', iconKey: 'gold' },
                        { id: 'carried_gold_10k', name: 'Heavy Purse', description: 'Carry 10,000 gold at once.', points: 25, category: 'economy', iconKey: 'gold' },
                        { id: 'blood_stones_100', name: 'Blood Collector', description: 'Accumulate 100 Blood Stones.', points: 30, category: 'economy', iconKey: 'bloodstone' },
                        // Exploration
                        { id: 'explorer_3', name: 'Wanderer', description: 'Explore 3 different zones.', points: 15, category: 'exploration', iconKey: 'explore' },
                        { id: 'explorer_6', name: 'Pathfinder', description: 'Explore 6 different zones.', points: 30, category: 'exploration', iconKey: 'explore' },
                        { id: 'explorer_8', name: 'Cartographer', description: 'Explore all 8 zones.', points: 50, category: 'exploration', iconKey: 'explore' },
                        // PvP
                        { id: 'pvp_first_win', name: 'Arena Debut', description: 'Win your first PvP duel.', points: 10, category: 'pvp', icon: '⚔' },
                        { id: 'pvp_10_wins', name: 'Gladiator', description: 'Win 10 PvP duels.', points: 25, category: 'pvp', icon: '⚔' },
                        { id: 'pvp_50_wins', name: 'Champion', description: 'Win 50 PvP duels.', points: 75, category: 'pvp', icon: '⚔' },
                        { id: 'pvp_100_wins', name: 'Warlord', description: 'Win 100 PvP duels.', points: 150, category: 'pvp', icon: '⚔' },
                        { id: 'pvp_survivor', name: 'Survivor', description: 'Positive W/L ratio after 20+ duels.', points: 50, category: 'pvp', icon: '⚔' },
                        // Social
                        { id: 'joined_coven', name: 'Brotherhood', description: 'Join a coven.', points: 15, category: 'social', iconKey: 'quest' },
                        // Quests
                        { id: 'quests_5', name: 'Errand Runner', description: 'Complete 5 quests.', points: 15, category: 'exploration', iconKey: 'scroll' },
                        { id: 'quests_20', name: 'Quest Master', description: 'Complete 20 quests.', points: 50, category: 'exploration', iconKey: 'scroll' },
                        // Crafting
                        { id: 'crafter_1', name: 'Apprentice Smith', description: 'Craft your first item.', points: 10, category: 'crafting', iconKey: 'gathering' },
                        { id: 'crafter_10', name: 'Master Artisan', description: 'Craft 10 items.', points: 30, category: 'crafting', iconKey: 'gathering' },
                        // Dungeons
                        { id: 'dungeon_1', name: 'Delver', description: 'Clear a dungeon.', points: 15, category: 'exploration', iconKey: 'cathedral' },
                        { id: 'dungeon_10', name: 'Dungeon Master', description: 'Clear 10 dungeons.', points: 50, category: 'exploration', iconKey: 'cathedral' },
                    ];

                    // Merge uniqueness
                    const uniqueDict = Array.from(new Map(fullDict.map(item => [item.id, item])).values());
                    
                    const processed = uniqueDict.map(a => ({
                        ...a,
                        isUnlocked: unlockedIds.includes(a.id),
                        unlockedAt: pAchvs.find(p => p.achievement_id === a.id)?.unlocked_at
                    }));
                    setAchievements(processed);
                }
            } catch (err) {
                console.error("Failed to sync achievements", err);
            } finally {
                setLoading(false);
            }
        };
        syncAchvs();
    }, []);

    const [filter, setFilter] = useState('all');
    const totalPts = hero.achievement_points || 0;
    const progressCount = achievements.filter(a => a.isUnlocked).length;
    
    const categories = [
      { id: 'all', label: 'All', iconKey: 'legacy' },
      { id: 'combat', label: 'Combat', iconKey: 'arsenal' },
      { id: 'economy', label: 'Economy', iconKey: 'gold' },
      { id: 'exploration', label: 'Explore', iconKey: 'explore' },
      { id: 'pvp', label: 'PvP', iconKey: 'arsenal' },
      { id: 'social', label: 'Social', iconKey: 'quest' },
      { id: 'crafting', label: 'Craft', iconKey: 'gathering' },
    ];

    const filtered = filter === 'all' ? achievements : achievements.filter(a => a.category === filter);

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 pb-10">
            {justUnlocked.length > 0 && (
                <div className="bg-yellow-950/40 border border-yellow-900 shadow-[0_0_20px_rgba(202,138,4,0.2)] p-4 text-center font-mono animate-pulse">
                    <span className="text-yellow-500 font-bold uppercase tracking-widest text-sm">Monument Established</span>
                    <div className="text-xs text-stone-400 mt-1">You have unlocked {justUnlocked.length} new achievements.</div>
                </div>
            )}
            
            <div className="border border-stone-800 bg-[#050505] shadow-[0_0_50px_rgba(255,255,255,0.02)]">
                <div className="flex border-b border-stone-800 font-mono text-xs text-stone-500 tracking-widest uppercase">
                    <button onClick={() => setTab('achievements')} className={`flex-1 py-4 ${tab === 'achievements' ? 'bg-stone-900 border-b-2 border-stone-400 text-stone-200' : 'bg-black hover:bg-neutral-900'}`}>Achievements</button>
                    <button onClick={() => setTab('titles')} className={`flex-1 py-4 ${tab === 'titles' ? 'bg-stone-900 border-b-2 border-stone-400 text-stone-200' : 'bg-black hover:bg-neutral-900'}`}>Titles</button>
                </div>

                <div className="p-8 min-h-[400px]">
                    {loading ? (
                        <div className="text-center font-mono text-stone-600 py-20 uppercase tracking-widest text-xs animate-pulse">Reading the stones...</div>
                    ) : tab === 'achievements' ? (
                        <div className="flex flex-col gap-8">
                            <div className="flex justify-between items-end border-b border-neutral-900 pb-4">
                                <div>
                                     <div className="text-stone-500 font-mono text-xs uppercase tracking-widest mb-1">Total Score</div>
                                     <div className="text-4xl font-black font-serif text-yellow-600">{totalPts} <span className="text-sm font-mono text-stone-600">PTS</span></div>
                                </div>
                                <div className="text-right">
                                    <div className="text-stone-500 text-xs font-mono uppercase">Completion</div>
                                    <div className="text-[10px] text-stone-600 font-mono mt-1">{progressCount} / {achievements.length} Unlocked</div>
                                </div>
                            </div>

                            {/* Category Filters */}
                            <div className="flex flex-wrap gap-2">
                              {categories.map(c => (
                                <button key={c.id} onClick={() => setFilter(c.id)}
                                  className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border transition-colors ${
                                    filter === c.id
                                      ? 'border-yellow-900/50 bg-yellow-950/20 text-yellow-500'
                                      : 'border-neutral-800 text-stone-600 hover:text-stone-400 hover:border-neutral-700'
                                  }`}>
                                  <GameIcon name={c.iconKey} size={12} className="inline-block mr-1" /> {c.label}
                                </button>
                              ))}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filtered.map(a => (
                                    <div key={a.id} className={`border p-4 flex flex-col justify-between transition-colors ${a.isUnlocked ? 'border-yellow-900/30 bg-yellow-950/10 shadow-[0_0_15px_rgba(202,138,4,0.02)]' : 'border-neutral-900 bg-black opacity-60 grayscale'}`}>
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h3 className={`font-bold font-serif uppercase tracking-widest ${a.isUnlocked ? 'text-yellow-500' : 'text-stone-500'}`}>
                                                  {a.iconKey && <span className="mr-2"><GameIcon name={a.iconKey} size={14} className="inline-block" /></span>}{a.name}
                                                </h3>
                                                <span className={`text-[9px] font-mono px-2 uppercase ${a.isUnlocked ? 'text-yellow-400 border border-yellow-900/50' : 'text-stone-600 border border-stone-800'}`}>{a.points} PTS</span>
                                            </div>
                                            <p className="text-stone-500 text-xs mt-2 font-mono h-8">{a.description}</p>
                                        </div>
                                        {a.isUnlocked && (
                                            <div className="text-[9px] font-mono text-stone-400 mt-4 border-t border-neutral-800/50 pt-2 text-right uppercase tracking-widest">
                                                Unlocked: {new Date(a.unlockedAt).toLocaleDateString()}
                                            </div>
                                        )}
                                        {!a.isUnlocked && (
                                            <div className="text-[9px] font-mono text-stone-600 mt-4 border-t border-neutral-900 pt-2 text-right uppercase tracking-widest">
                                                Locked
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-10">
                            <h3 className="font-serif text-stone-300 text-xl tracking-widest uppercase">Eminent Domain</h3>
                            <p className="font-mono text-xs text-stone-500 mt-2">Titles earned through glory, suffering, and repetition.</p>
                            
                            <div className="mt-8 flex flex-col items-center gap-4">
                                <div className="px-6 py-3 border border-yellow-900/50 text-yellow-500 font-serif uppercase tracking-widest shadow-[0_0_20px_rgba(202,138,4,0.1)] bg-yellow-950/20">The Limitless</div>
                                <div className="px-6 py-3 border border-red-900/50 text-red-500 font-serif uppercase tracking-widest shadow-[0_0_20px_rgba(220,38,38,0.1)] bg-red-950/20">Blood Baron</div>
                                <div className="px-6 py-3 border border-neutral-800 text-stone-400 font-serif uppercase tracking-widest bg-black">Wanderer</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
