'use client';
import { useState, useEffect } from 'react';
import { GameIcon } from './icons/GameIcons';

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to BlackWorld',
    body: 'You have descended into a brutal dark fantasy realm. Survive, grow powerful, and dominate.',
    iconKey: 'cross',
    tip: 'Your character is permanent — death costs gold, not your soul.',
  },
  {
    title: 'The Dashboard',
    body: 'This is your command center. View stats, allocate attribute points, and manage your equipment.',
    iconKey: 'home',
    tip: 'Level up to earn attribute points. Invest wisely — there are no resets.',
  },
  {
    title: 'Exploration & Combat',
    body: 'Visit zones, encounter monsters, and fight for gold and XP. Each zone has unique enemies and loot.',
    iconKey: 'explore',
    tip: 'Combat costs Blood Essence. It regenerates over time — manage it carefully.',
  },
  {
    title: 'The City of the Damned',
    body: 'Visit the Merchant, Healer, Casino, Arena, and more. The city is your hub between expeditions.',
    iconKey: 'city',
    tip: 'Bank your gold! Death takes 50% of carried gold but your bank is safe.',
  },
  {
    title: 'Blood Covens',
    body: 'Join a player guild for social gameplay. Found your own coven for 1,000 gold.',
    iconKey: 'quest',
    tip: 'Coven members share a treasury and can participate in wars together.',
  },
  {
    title: 'The Arena & PvP',
    body: 'Challenge other players to duels. Win ELO, climb the seasonal ladder, and earn titles.',
    iconKey: 'arsenal',
    tip: 'Enable your PvP flag to appear on the challenger board.',
  },
  {
    title: 'Premium — Blood Stones',
    body: 'Blood Stones unlock cosmetics, boosters, and convenience items. Earn them in-game or purchase packs.',
    iconKey: 'gem',
    tip: 'The Dark Pact subscription gives 450 BS/month plus exclusive perks.',
  },
];

export default function TutorialOverlay({ onComplete }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay for entrance animation
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const progress = ((step + 1) / TUTORIAL_STEPS.length) * 100;

  const handleNext = () => {
    if (isLast) {
      setVisible(false);
      setTimeout(() => onComplete(), 300);
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    setVisible(false);
    setTimeout(() => onComplete(), 300);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-500 ${
      visible ? 'bg-black/90 backdrop-blur-md opacity-100' : 'bg-black/0 opacity-0 pointer-events-none'
    }`}>
      <div className={`w-full max-w-lg transition-all duration-500 ${
        visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
      }`}>
        {/* Progress bar */}
        <div className="w-full h-0.5 bg-neutral-900 mb-6 rounded-full overflow-hidden">
          <div className="h-full bg-red-700 transition-all duration-500 rounded-full"
            style={{ width: `${progress}%` }} />
        </div>

        {/* Card */}
        <div className="bg-[#050505] border border-red-900/30 shadow-[0_0_60px_rgba(153,27,27,0.15)] p-8 md:p-10">
          {/* Icon */}
          <div className="text-5xl text-red-700 text-center mb-4 flex justify-center"><GameIcon name={current.iconKey} size={48} /></div>

          {/* Title */}
          <h2 className="text-2xl font-black font-serif text-stone-200 text-center uppercase tracking-[0.2em] mb-3">
            {current.title}
          </h2>

          {/* Body */}
          <p className="text-stone-400 font-mono text-sm text-center leading-relaxed mb-6">
            {current.body}
          </p>

          {/* Tip */}
          <div className="bg-red-950/20 border border-red-900/20 px-4 py-3 mb-8 rounded">
            <div className="text-[10px] text-red-700 font-mono uppercase tracking-widest mb-1">Tip</div>
            <div className="text-stone-500 text-xs font-mono">{current.tip}</div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-stone-600 hover:text-stone-400 text-[10px] font-mono uppercase tracking-widest transition-colors"
            >
              Skip Tutorial
            </button>

            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="px-4 py-2 border border-neutral-800 text-stone-500 text-xs font-mono uppercase tracking-widest hover:border-stone-600 transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-red-900/30 border border-red-900/50 text-red-300 text-xs font-mono uppercase tracking-widest hover:bg-red-800/40 transition-colors"
              >
                {isLast ? 'Enter the Dark' : 'Next'}
              </button>
            </div>
          </div>

          {/* Step counter */}
          <div className="text-center mt-6">
            <span className="text-stone-700 text-[10px] font-mono uppercase tracking-widest">
              {step + 1} / {TUTORIAL_STEPS.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
