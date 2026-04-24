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
          setSaveData({
            stage: player.stage || 'BOOT',
            heroData: player.hero_data || null
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
