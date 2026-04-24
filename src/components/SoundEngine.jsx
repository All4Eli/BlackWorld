'use client';
import { useEffect, useRef, useState, createContext, useContext } from 'react';

// Sound URLs - using royalty-free web audio synthesis
const SoundContext = createContext(null);

export function useSounds() {
  return useContext(SoundContext);
}

// WebAudio synthesizer for game sounds (no external files needed)
function createAudioEngine() {
  if (typeof window === 'undefined') return null;
  
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let ambientOsc = null;
  let ambientPlaying = false;

  const init = () => {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.15;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);
  };

  const playNote = (freq, duration, type = 'sine', gainNode = sfxGain, volume = 0.3) => {
    if (!ctx) init();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(gainNode);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  };

  const sounds = {
    // UI click
    click: () => {
      playNote(800, 0.05, 'square', sfxGain, 0.1);
    },

    // Tab switch
    navigate: () => {
      playNote(600, 0.08, 'sine', sfxGain, 0.1);
      setTimeout(() => playNote(900, 0.06, 'sine', sfxGain, 0.08), 50);
    },

    // Combat hit
    hit: () => {
      if (!ctx) init();
      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.2;
      source.connect(gain);
      gain.connect(sfxGain);
      source.start();
    },

    // Critical hit
    crit: () => {
      sounds.hit();
      setTimeout(() => {
        playNote(1200, 0.15, 'sawtooth', sfxGain, 0.15);
        playNote(1500, 0.2, 'sine', sfxGain, 0.1);
      }, 50);
    },

    // Victory
    victory: () => {
      playNote(523, 0.2, 'sine', sfxGain, 0.2);
      setTimeout(() => playNote(659, 0.2, 'sine', sfxGain, 0.2), 150);
      setTimeout(() => playNote(784, 0.3, 'sine', sfxGain, 0.25), 300);
      setTimeout(() => playNote(1047, 0.5, 'sine', sfxGain, 0.2), 450);
    },

    // Defeat / death
    death: () => {
      playNote(300, 0.4, 'sawtooth', sfxGain, 0.15);
      setTimeout(() => playNote(200, 0.5, 'sawtooth', sfxGain, 0.12), 200);
      setTimeout(() => playNote(100, 0.8, 'sawtooth', sfxGain, 0.1), 500);
    },

    // Level up
    levelUp: () => {
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        setTimeout(() => playNote(freq, 0.25, 'sine', sfxGain, 0.2), i * 100);
      });
    },

    // Loot drop
    loot: () => {
      playNote(1200, 0.1, 'sine', sfxGain, 0.15);
      setTimeout(() => playNote(1500, 0.15, 'sine', sfxGain, 0.12), 80);
    },

    // Gold sound
    gold: () => {
      playNote(2000, 0.05, 'square', sfxGain, 0.08);
      setTimeout(() => playNote(2400, 0.08, 'square', sfxGain, 0.06), 40);
    },

    // Error / denied
    error: () => {
      playNote(200, 0.15, 'square', sfxGain, 0.15);
      setTimeout(() => playNote(150, 0.2, 'square', sfxGain, 0.12), 100);
    },

    // Equip item
    equip: () => {
      playNote(400, 0.1, 'triangle', sfxGain, 0.15);
      setTimeout(() => playNote(600, 0.08, 'triangle', sfxGain, 0.12), 60);
      setTimeout(() => playNote(800, 0.12, 'triangle', sfxGain, 0.1), 120);
    },

    // Start ambient drone
    startAmbient: () => {
      if (!ctx) init();
      if (ambientPlaying) return;

      ambientOsc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 55; // Low A
      lfo.type = 'sine';
      lfo.frequency.value = 0.1; // Very slow modulation
      lfoGain.gain.value = 5;

      lfo.connect(lfoGain);
      lfoGain.connect(ambientOsc.frequency);
      ambientOsc.connect(musicGain);

      ambientOsc.start();
      lfo.start();
      ambientPlaying = true;
    },

    stopAmbient: () => {
      if (ambientOsc && ambientPlaying) {
        try { ambientOsc.stop(); } catch (e) {}
        ambientPlaying = false;
      }
    },

    setMasterVolume: (v) => {
      if (!ctx) init();
      masterGain.gain.value = Math.max(0, Math.min(1, v));
    },

    setSfxVolume: (v) => {
      if (!ctx) init();
      sfxGain.gain.value = Math.max(0, Math.min(1, v));
    },

    setMusicVolume: (v) => {
      if (!ctx) init();
      musicGain.gain.value = Math.max(0, Math.min(1, v));
    },
  };

  return sounds;
}

export default function SoundEngine({ children }) {
  const [engine, setEngine] = useState(null);
  const [muted, setMuted] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || initialized.current) return;
    
    // Check saved preference
    const savedMuted = localStorage.getItem('bw_muted');
    if (savedMuted === 'true') {
      setMuted(true);
      initialized.current = true;
      return;
    }

    const audioEngine = createAudioEngine();
    setEngine(audioEngine);
    initialized.current = true;
  }, []);

  const toggleMute = () => {
    setMuted(prev => {
      const newMuted = !prev;
      localStorage.setItem('bw_muted', String(newMuted));
      if (newMuted && engine) {
        engine.stopAmbient();
        engine.setMasterVolume(0);
      } else if (engine) {
        engine.setMasterVolume(0.3);
      }
      return newMuted;
    });
  };

  const contextValue = {
    play: (soundName) => {
      if (muted || !engine || !engine[soundName]) return;
      try { engine[soundName](); } catch (e) {}
    },
    muted,
    toggleMute,
    engine,
  };

  return (
    <SoundContext.Provider value={contextValue}>
      {children}
    </SoundContext.Provider>
  );
}
