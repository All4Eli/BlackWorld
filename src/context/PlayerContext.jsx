// ═══════════════════════════════════════════════════════════════════
// PlayerContext — Global Player State via React Context
// ═══════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS (THE PROP-DRILLING PROBLEM):
//
//   Before this Context, every component that needed the player's HP,
//   Gold, or any hero data had to receive it as a prop from its parent.
//   The chain looked like this:
//
//     page.js  →  GameShell({ hero, updateHero })
//                   →  TownView({ hero, updateHero })
//                        →  HealerView({ hero, updateHero })
//                             →  (finally uses hero.hp)
//
//   PROBLEM 1 — UNNECESSARY RE-RENDERS:
//     When updateHero() is called (e.g., after healing), React works
//     like this with props:
//       1. page.js state changes → page.js re-renders
//       2. GameShell receives new `hero` prop → GameShell re-renders
//       3. TownView receives new `hero` prop → TownView re-renders
//       4. HealerView receives new `hero` prop → HealerView re-renders
//
//     Steps 2 and 3 are WASTED WORK. TownView doesn't USE hero —
//     it only passes it through. But React re-renders it anyway because
//     its parent (GameShell) re-rendered and passed it a new prop reference.
//
//   PROBLEM 2 — MAINTENANCE NIGHTMARE:
//     Adding a new field (e.g., blood_stones) means updating the prop
//     signature in page.js, GameShell, TownView, AND HealerView —
//     even though only HealerView actually needs it.
//
// HOW REACT CONTEXT SOLVES THIS:
//
//   Context creates a "broadcast channel" that any descendant component
//   can tune into, regardless of how deep it is in the tree.
//
//     page.js
//       └── <PlayerProvider hero={...} updateHero={...}>
//             └── GameShell  ← does NOT receive hero as a prop
//                   └── TownView  ← does NOT receive hero as a prop
//                        └── HealerView  ← calls usePlayer()
//                                           and gets hero directly
//
//   Now when updateHero() fires:
//     1. page.js state changes → page.js re-renders
//     2. PlayerProvider receives new hero → updates context value
//     3. ONLY components that called usePlayer() re-render
//     4. GameShell and TownView SKIP the re-render (if they don't
//        consume the context and are wrapped in React.memo)
//
//   This is called "subscribing" to context. Components OPT IN to
//   re-renders by calling usePlayer(). Components that don't call it
//   are invisible to the context system.
//
// ═══════════════════════════════════════════════════════════════════

'use client';

import { createContext, useContext, useMemo } from 'react';

// ── Step 1: Create the Context object ───────────────────────────
//
// createContext(null) creates a "container" that can hold a value.
// The `null` is the default value — what you get if you try to
// read the context WITHOUT a Provider above you in the tree.
//
// Think of this as creating a radio frequency. It doesn't hold any
// data yet — it just defines the channel that providers will
// broadcast on and consumers will listen to.
const PlayerContext = createContext(null);


// ── Step 2: The Provider Component ──────────────────────────────
//
// The Provider is the "radio tower." It takes a value and broadcasts
// it to every descendant that's listening (via useContext).
//
// PROPS:
//   hero       — The player's full hero data object (HP, gold, stats, etc.)
//   updateHero — A function that replaces the hero object with new data.
//                This is called by child components after API responses:
//                  updateHero(data.updatedHero)
//   children   — React's special prop: whatever JSX is nested inside
//                <PlayerProvider>...</PlayerProvider>
//
// IMPORTANT — useMemo OPTIMIZATION:
//   Every time PlayerProvider re-renders, it creates a new object:
//     { hero, updateHero }
//
//   In JavaScript, {} !== {} even if the contents are identical.
//   React uses Object.is() (similar to ===) to compare context values.
//   If the value is a "new" object, React assumes it changed and
//   re-renders ALL consumers — even if hero and updateHero are the same.
//
//   useMemo prevents this. It caches the object and only creates a
//   new one when hero or updateHero actually change (checked by the
//   dependency array [hero, updateHero]).
//
//   Without useMemo:
//     Parent re-renders for ANY reason → new {} created → all
//     usePlayer() consumers re-render (even if hero didn't change)
//
//   With useMemo:
//     Parent re-renders for ANY reason → useMemo checks dependencies →
//     hero didn't change? → return SAME object → consumers SKIP re-render
//
export function PlayerProvider({ hero, updateHero, children }) {

  // Cache the context value. Only rebuild when hero or updateHero changes.
  // The dependency array [hero, updateHero] tells React:
  //   "Only recompute this value if one of these variables changed
  //    since the last render."
  const value = useMemo(
    () => ({ hero, updateHero }),
    [hero, updateHero]
  );

  // <PlayerContext.Provider value={...}> wraps {children} and makes
  // the value available to any descendant that calls useContext(PlayerContext).
  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}


// ── Step 3: The Consumer Hook ───────────────────────────────────
//
// usePlayer() is a custom hook that reads from PlayerContext.
//
// CUSTOM HOOKS — WHY?
//   You could call useContext(PlayerContext) directly in every
//   component, but that means:
//     1. Every component needs to import both useContext AND PlayerContext
//     2. Every component needs to handle the null case (no Provider)
//     3. If we rename the context, we update 40 files instead of 1
//
//   usePlayer() wraps all of this into a single import:
//     import { usePlayer } from '@/context/PlayerContext';
//     const { hero, updateHero } = usePlayer();
//
// HOW useContext WORKS:
//   1. React walks UP the component tree from the calling component
//   2. It finds the nearest <PlayerContext.Provider> ancestor
//   3. It returns whatever `value` that Provider is currently holding
//   4. It SUBSCRIBES the calling component to future value changes
//
//   "Subscribes" means: whenever the Provider's value changes,
//   React will re-render this component automatically. The component
//   doesn't need to poll or check — React handles it.
//
// SAFETY GUARD:
//   If someone calls usePlayer() in a component that is NOT inside
//   a <PlayerProvider>, context will be null (the default from
//   createContext(null)). Instead of silently returning null and
//   causing a cryptic "Cannot read property 'hp' of null" error
//   somewhere else, we throw immediately with a clear message.
//
export function usePlayer() {
  const context = useContext(PlayerContext);

  if (!context) {
    throw new Error(
      'usePlayer() was called outside of <PlayerProvider>. ' +
      'Make sure your component is a descendant of <PlayerProvider>.'
    );
  }

  // Returns: { hero, updateHero }
  // Destructured by consumers: const { hero, updateHero } = usePlayer();
  return context;
}
