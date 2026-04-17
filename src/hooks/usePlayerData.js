'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';

const DEFAULT_SAVE = { stage: 'BOOT', heroData: null };

export function usePlayerData() {
  const { isLoaded, isSignedIn } = useAuth();
  const [saveData, setSaveData] = useState(DEFAULT_SAVE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const saveTimeout = useRef(null);

  // Load player data from the database on mount
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setIsLoading(false);
      return;
    }

    async function loadPlayer() {
      try {
        const res = await fetch('/api/player');
        if (!res.ok) throw new Error('Failed to load');
        const { player } = await res.json();

        if (player) {
          setSaveData({
            stage: player.stage || 'BOOT',
            heroData: player.hero_data || null
          });
        }
      } catch (err) {
        console.error('Failed to load player data:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    loadPlayer();
  }, [isLoaded, isSignedIn]);

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

      // Debounce the cloud save so we don't fire on every rapid state change
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => saveToCloud(newData), 500);

      return newData;
    });
  }, [saveToCloud]);

  return { saveData, setSaveData: updateSaveData, isLoading, error };
}
