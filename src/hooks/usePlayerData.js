'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const DEFAULT_SAVE = { stage: 'BOOT', heroData: null };

export function usePlayerData() {
  const [saveData, setSaveData] = useState(DEFAULT_SAVE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [error, setError] = useState(null);
  const saveTimeout = useRef(null);

  // Load player data from the database on mount
  useEffect(() => {
    async function loadPlayer() {
      try {
        const res = await fetch('/api/player');
        if (!res.ok) {
            setIsSignedIn(false);
            return;
        }
        const { player } = await res.json();

        if (player) {
          setIsSignedIn(true);

          // The API now returns normalized data (player.stats, player.equipment, etc.)
          // instead of the legacy player.hero_data JSONB blob.
          // Map the normalized response into the heroData shape the client components expect.
          const stats = player.stats || {};
          const heroData = {
            name: player.username,
            hp: stats.hp,
            maxHp: stats.maxHp,
            mana: stats.mana,
            maxMana: stats.maxMana,
            dmg: stats.baseDmg,
            baseDmg: stats.baseDmg,
            gold: stats.gold,
            bankedGold: stats.bankBalance,
            bloodStones: stats.bloodStones || 0,
            level: stats.level,
            xp: stats.xp,
            flasks: stats.flasks,
            maxFlasks: stats.maxFlasks,
            kills: stats.kills,
            deaths: stats.deaths,
            artifacts: [],
            equipped: {},
            essence: stats.essence,
            maxEssence: stats.maxEssence,
            essence_last_regen: stats.essenceRegenAt,
            skillPoints: stats.skillPoints || {},
            skillPointsUnspent: stats.skillPointsUnspent || 0,
            learnedTomes: stats.learnedTomes || [],
            // Attributes
            str: stats.str,
            def: stats.def,
            dex: stats.dex,
            int: stats.int,
            vit: stats.vit,
            unspentPoints: stats.unspentPoints || 0,
            // Daily
            loginStreak: stats.loginStreak,
            lastDailyClaim: stats.lastDailyClaim,
            // Achievement / progression counters
            pvpWins: stats.pvpWins || 0,
            pvpLosses: stats.pvpLosses || 0,
            bossKills: stats.bossKills || 0,
            questsCompleted: stats.questsCompleted || 0,
            itemsCrafted: stats.itemsCrafted || 0,
            dungeonClears: stats.dungeonClears || 0,
            zonesExplored: stats.zonesExplored || 0,
            // Equipment (map to slot-based object)
            ...((player.equipment || []).length > 0 ? {
              equipped: (player.equipment || []).reduce((acc, e) => {
                acc[e.slot] = {
                  inventoryId: e.inventoryId,
                  key: e.itemKey,
                  name: e.itemName,
                  type: e.itemType,
                  tier: e.itemTier,
                  enhancement: e.enhancement,
                  baseStats: e.baseStats,
                  rolledStats: e.rolledStats,
                };
                return acc;
              }, {})
            } : {}),
            // Coven
            coven: player.coven || null,
            inventoryCount: player.inventoryCount || 0,
          };

          setSaveData({
            stage: player.stage || 'BOOT',
            heroData,
          });
        }
      } catch (err) {
        console.error('Failed to load player data:', err);
        setError(err.message);
        setIsSignedIn(false);
      } finally {
        setIsLoading(false);
      }
    }
    loadPlayer();
  }, []);

  // Debounced save to database (saves 500ms after last state change)
  const saveToCloud = useCallback(async (data) => {
    try {
      await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: data.stage,
          heroData: data.heroData
        })
      });
    } catch (err) {
      console.error('Failed to save player data:', err);
    }
  }, []);

  // Wrapper that updates local state immediately + queues a cloud save
  const updateSaveData = useCallback((newDataOrFn) => {
    setSaveData(prev => {
      const newData = typeof newDataOrFn === 'function' ? newDataOrFn(prev) : newDataOrFn;

      // AUTOMATIC CLOUD SAVES HAVE BEEN DISABLED FOR SECURITY.
      // ALL LOGIC MUST BE AUTHORED VIA SECURE BACKEND ENDPOINTS.

      return newData;
    });
  }, [saveToCloud]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsSignedIn(false);
      setSaveData(DEFAULT_SAVE);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }, []);

  return { saveData, setSaveData: updateSaveData, isLoading, isSignedIn, logout, error };
}
