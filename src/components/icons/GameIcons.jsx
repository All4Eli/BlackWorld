'use client';

// Dark, gritty SVG icon library for BlackWorld
// All icons are inline SVGs styled to match the game's aesthetic

const defaultSize = 20;
const defaultClass = '';

function Icon({ children, size = defaultSize, className = defaultClass, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

// ── Navigation Icons ────────────────────────────────────────

export function IconHome({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V13h6v8" />
    </Icon>
  );
}

export function IconCity({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 21V8l5-5 5 5v13" />
      <path d="M13 21V11l4-3 4 3v10" />
      <line x1="6" y1="11" x2="6" y2="11.01" />
      <line x1="6" y1="14" x2="6" y2="14.01" />
      <line x1="6" y1="17" x2="6" y2="17.01" />
      <line x1="10" y1="11" x2="10" y2="11.01" />
      <line x1="10" y1="14" x2="10" y2="14.01" />
      <line x1="10" y1="17" x2="10" y2="17.01" />
      <line x1="17" y1="14" x2="17" y2="14.01" />
      <line x1="17" y1="17" x2="17" y2="17.01" />
    </Icon>
  );
}

export function IconExplore({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="M16.24 7.76l-2.12 2.12M9.88 14.12l-2.12 2.12" />
      <path d="M7.76 7.76l2.12 2.12M14.12 14.12l2.12 2.12" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </Icon>
  );
}

export function IconQuest({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </Icon>
  );
}

export function IconGathering({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94L6.73 20.15a2.1 2.1 0 01-2.83-.08 2.1 2.1 0 01-.08-2.83l6.73-6.73A6 6 0 0114.7 6.3z" />
    </Icon>
  );
}

// ── Combat & Equipment Icons ────────────────────────────────

export function IconSword({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
      <line x1="14.5" y1="17.5" x2="3" y2="6" strokeWidth="2" />
    </Icon>
  );
}

export function IconSkull({ size, className }) {
  return (
    <Icon size={size} className={className} fill="none">
      <circle cx="12" cy="10" r="7" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      <circle cx="15" cy="9" r="1.5" fill="currentColor" />
      <path d="M9 17v4M15 17v4M12 14v2" />
      <path d="M8 17h8" />
    </Icon>
  );
}

export function IconShield({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  );
}

export function IconSkills({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none" />
    </Icon>
  );
}

export function IconLegacy({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7" />
      <path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0012 0V2z" />
    </Icon>
  );
}

export function IconShop({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </Icon>
  );
}

// ── Zone Icons ──────────────────────────────────────────────

export function IconCross({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7V2z" fill="none" />
    </Icon>
  );
}

export function IconFlame({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 22c4-3 7-7 7-11a7 7 0 00-14 0c0 4 3 8 7 11z" />
      <path d="M12 22c-1.5-2-3-4-3-6a3 3 0 016 0c0 2-1.5 4-3 6z" fill="currentColor" opacity="0.3" />
    </Icon>
  );
}

export function IconCathedral({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2L8 6v4l-5 3v8h18v-8l-5-3V6l-4-4z" />
      <path d="M12 2v6M9 14v7M15 14v7" />
      <circle cx="12" cy="11" r="2" />
    </Icon>
  );
}

export function IconPortal({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </Icon>
  );
}

export function IconThrone({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M5 21h14" />
      <path d="M5 21V11l3-3v6" />
      <path d="M19 21V11l-3-3v6" />
      <path d="M9 21V8l3-5 3 5v13" />
      <circle cx="12" cy="10" r="1.5" fill="currentColor" />
    </Icon>
  );
}

// ── Resource & Status Icons ─────────────────────────────────

export function IconBloodStone({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" fill="none" />
      <polygon points="12 6 17 9 17 15 12 18 7 15 7 9 12 6" fill="currentColor" opacity="0.2" />
    </Icon>
  );
}

export function IconGold({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9a2.5 2 0 015 0c0 2-2.5 2-2.5 4" />
      <line x1="12" y1="17" x2="12" y2="17.01" strokeWidth="2" />
    </Icon>
  );
}

export function IconFlask({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M9 2h6" />
      <path d="M10 2v6.5L5 17a2 2 0 001.85 2.76h10.3A2 2 0 0019 17l-5-8.5V2" />
      <path d="M6 15h12" />
    </Icon>
  );
}

export function IconBlood({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2c0 0-6 7-6 11a6 6 0 0012 0c0-4-6-11-6-11z" fill="currentColor" opacity="0.3" />
      <path d="M12 2c0 0-6 7-6 11a6 6 0 0012 0c0-4-6-11-6-11z" />
    </Icon>
  );
}

export function IconCombat({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 2l6 6 6-6" />
      <path d="M12 8v6" />
      <circle cx="12" cy="18" r="4" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </Icon>
  );
}

export function IconMining({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94L6.73 20.15a2.1 2.1 0 01-2.83-.08 2.1 2.1 0 01-.08-2.83l6.73-6.73A6 6 0 0114.7 6.3z" />
    </Icon>
  );
}

export function IconHerb({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 22V12" />
      <path d="M12 12C12 12 6 8 6 4c3 0 6 2 6 4" />
      <path d="M12 12c0 0 6-4 6-8c-3 0-6 2-6 4" />
      <path d="M12 16c-2 0-4-1-5-3" />
      <path d="M12 16c2 0 4-1 5-3" />
    </Icon>
  );
}

export function IconAxe({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M14 12l-8.5 8.5a2.12 2.12 0 01-3-3L11 9" />
      <path d="M15 13L9.6 7.6a2 2 0 010-2.83l.28-.28A8 8 0 0118 2l2 2a8 8 0 01-2.46 8.12l-.28.28a2 2 0 01-2.83 0z" />
    </Icon>
  );
}

export function IconGem({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 3h12l4 6-10 13L2 9z" />
      <path d="M6 3l6 19 6-19" />
      <path d="M2 9h20" />
    </Icon>
  );
}

export function IconKnife({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M4 20l12-12" />
      <path d="M16 4l4 4-12 12-4-4z" fill="none" />
    </Icon>
  );
}

export function IconTrophy({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7" />
      <path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0012 0V2z" />
    </Icon>
  );
}

export function IconBag({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </Icon>
  );
}

export function IconScroll({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M8 21h12a2 2 0 002-2v-2H10v2a2 2 0 01-4 0V5a2 2 0 012-2h10a2 2 0 012 2v10" />
      <path d="M6 3a2 2 0 00-2 2v14a2 2 0 004 0" />
    </Icon>
  );
}

export function IconPotion({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M10 2h4" />
      <path d="M10 2v5l-5 9a2 2 0 001.76 3h10.48A2 2 0 0019 16l-5-9V2" />
      <path d="M6 15h12" />
    </Icon>
  );
}

export function IconCandle({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="9" y="10" width="6" height="12" rx="1" />
      <path d="M12 10V6" />
      <path d="M12 2c0 0-2 2-2 4s2 4 2 4c0 0 2-2 2-4s-2-4-2-4z" fill="currentColor" opacity="0.3" />
    </Icon>
  );
}

export function IconClover({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 12a4 4 0 01-4-4c0-2 2-4 4-4s4 2 4 4a4 4 0 01-4 4z" />
      <path d="M12 12a4 4 0 00-4 4c0 2 2 4 4 4s4-2 4-4a4 4 0 00-4-4z" />
      <path d="M12 12a4 4 0 01-8 0c0-2 2-2 4-2" />
      <path d="M12 12a4 4 0 008 0c0-2-2-2-4-2" />
      <path d="M12 20v2" />
    </Icon>
  );
}

export function IconCircle({ size, className, color }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="12" r="8" fill={color || 'currentColor'} opacity="0.5" />
      <circle cx="12" cy="12" r="8" />
    </Icon>
  );
}

export function IconSpider({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9l-4-6M12 9l4-6" />
      <path d="M9 12l-6-2M9 12l-6 2" />
      <path d="M15 12l6-2M15 12l6 2" />
      <path d="M12 15l-4 6M12 15l4 6" />
    </Icon>
  );
}

export function IconCrown({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M2 17l3-11 5 5 2-8 2 8 5-5 3 11z" />
      <path d="M2 17h20v3H2z" />
    </Icon>
  );
}

export function IconVortex({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c0 6-3 9-9 9" />
      <path d="M21 12c-6 0-9 3-9 9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
    </Icon>
  );
}

export function IconMail({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 4L12 13 2 4" />
    </Icon>
  );
}

export function IconAlert({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" />
      <line x1="12" y1="17" x2="12" y2="17.01" strokeWidth="2" />
    </Icon>
  );
}

// ── Icon Map — maps string keys to components ───────────────

const ICON_MAP = {
  // Nav
  'home': IconHome,
  'city': IconCity,
  'explore': IconExplore,
  'quest': IconQuest,
  'gathering': IconGathering,
  'arsenal': IconSword,
  'skills': IconSkills,
  'legacy': IconLegacy,
  'shop': IconShop,
  // Zones
  'cross': IconCross,
  'flame': IconFlame,
  'cathedral': IconCathedral,
  'portal': IconPortal,
  'throne': IconThrone,
  'skull': IconSkull,
  // Resources
  'bloodstone': IconBloodStone,
  'gold': IconGold,
  'flask': IconFlask,
  'blood': IconBlood,
  'combat': IconCombat,
  'shield': IconShield,
  // Gathering
  'mining': IconMining,
  'herb': IconHerb,
  'axe': IconAxe,
  'gem': IconGem,
  'knife': IconKnife,
  // Misc
  'trophy': IconTrophy,
  'bag': IconBag,
  'scroll': IconScroll,
  'potion': IconPotion,
  'candle': IconCandle,
  'clover': IconClover,
  'spider': IconSpider,
  'crown': IconCrown,
  'vortex': IconVortex,
  'mail': IconMail,
  'alert': IconAlert,
};

export function GameIcon({ name, size = 20, className = '' }) {
  const Component = ICON_MAP[name];
  if (!Component) return <span className={className}>{name}</span>;
  return <Component size={size} className={className} />;
}

export default ICON_MAP;
