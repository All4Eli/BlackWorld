// Zone definitions — each with themed enemies, loot tables, and level requirements
export const ZONES = [
  {
    id: 'bone_crypts',
    name: 'The Bone Crypts',
    description: 'Shallow graves stretch endlessly. The dead here are restless.',
    icon: '🦴',
    levelReq: 1,
    essenceCost: 8,
    enemies: [
      { name: 'Skeletal Archer', baseHp: 35, baseDmg: 8, isBoss: false },
      { name: 'Lich Initiate', baseHp: 45, baseDmg: 12, isBoss: false },
      { name: 'Grave Shambler', baseHp: 55, baseDmg: 7, isBoss: false },
    ],
    bosses: [
      { name: 'The Crypt Warden', baseHp: 180, baseDmg: 18, isBoss: true },
    ],
    lootTable: [
      { name: 'Bone Shard Dagger', type: 'WEAPON', stat: 6 },
      { name: 'Dusty Burial Shroud', type: 'ARMOR', stat: 20 },
    ],
    goldMultiplier: 1.0,
    xpMultiplier: 1.0,
  },
  {
    id: 'ashen_wastes',
    name: 'The Ashen Wastes',
    description: 'A scorched plain where demons drag the damned into cinders.',
    icon: '🌋',
    levelReq: 5,
    essenceCost: 12,
    enemies: [
      { name: 'Ash Wraith', baseHp: 60, baseDmg: 18, isBoss: false },
      { name: 'Cinder Golem', baseHp: 100, baseDmg: 10, isBoss: false },
      { name: 'Smoldering Fiend', baseHp: 75, baseDmg: 22, isBoss: false },
    ],
    bosses: [
      { name: 'The Ember Sovereign', baseHp: 280, baseDmg: 28, isBoss: true },
      { name: 'Ashen Colossus', baseHp: 350, baseDmg: 22, isBoss: true },
    ],
    lootTable: [
      { name: 'Cinderforged Blade', type: 'WEAPON', stat: 14 },
      { name: 'Ashen Aegis', type: 'ARMOR', stat: 40 },
    ],
    goldMultiplier: 1.5,
    xpMultiplier: 1.4,
  },
  {
    id: 'hollow_cathedral',
    name: 'The Hollow Cathedral',
    description: 'God abandoned this place. What remains worships something far older.',
    icon: '⛪',
    levelReq: 10,
    essenceCost: 18,
    enemies: [
      { name: 'Fallen Paladin', baseHp: 110, baseDmg: 25, isBoss: false },
      { name: 'Soul Reaper', baseHp: 90, baseDmg: 30, isBoss: false },
      { name: 'Void Acolyte', baseHp: 130, baseDmg: 20, isBoss: false },
    ],
    bosses: [
      { name: 'The Nameless Sovereign', baseHp: 500, baseDmg: 40, isBoss: true },
      { name: 'High Priest of Nothing', baseHp: 450, baseDmg: 45, isBoss: true },
    ],
    lootTable: [
      { name: "Heretic's Warblade", type: 'WEAPON', stat: 24 },
      { name: "Sanctified Bone Plate", type: 'ARMOR', stat: 70 },
    ],
    goldMultiplier: 2.2,
    xpMultiplier: 2.0,
  },
  {
    id: 'abyssal_rift',
    name: 'The Abyssal Rift',
    description: 'A tear in reality. Greater demons spill through, screaming.',
    icon: '🌀',
    levelReq: 20,
    essenceCost: 25,
    enemies: [
      { name: 'Void Stalker', baseHp: 180, baseDmg: 38, isBoss: false },
      { name: 'Greater Demon', baseHp: 220, baseDmg: 42, isBoss: false },
      { name: 'Rift Horror', baseHp: 160, baseDmg: 50, isBoss: false },
    ],
    bosses: [
      { name: 'Warden of the Abyss', baseHp: 800, baseDmg: 60, isBoss: true },
      { name: 'The Eternal Devourer', baseHp: 1000, baseDmg: 55, isBoss: true },
    ],
    lootTable: [
      { name: 'Rift-Torn Executioner', type: 'WEAPON', stat: 38 },
      { name: 'Abyssal Carapace', type: 'ARMOR', stat: 110 },
    ],
    goldMultiplier: 3.5,
    xpMultiplier: 3.2,
  },
  {
    id: 'throne_of_nothing',
    name: 'The Throne of Nothing',
    description: 'Where the world ends. The Sovereign sits and waits.',
    icon: '💀',
    levelReq: 35,
    essenceCost: 40,
    enemies: [
      { name: 'Death Aspect', baseHp: 300, baseDmg: 60, isBoss: false },
      { name: 'Void Incarnate', baseHp: 280, baseDmg: 70, isBoss: false },
    ],
    bosses: [
      { name: 'The Throne Sovereign', baseHp: 2000, baseDmg: 90, isBoss: true },
    ],
    lootTable: [
      { name: "The Sovereign's Edge", type: 'WEAPON', stat: 60 },
      { name: 'Crown of Eternal Night', type: 'ARMOR', stat: 200 },
    ],
    goldMultiplier: 6.0,
    xpMultiplier: 5.0,
  },
];

// Daily quest generation — seeded by today's date so everyone gets same quests
export function getDailyQuests(heroClass) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const seed = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);

  return [
    {
      id: `q1_${today}`,
      title: 'Blood Harvest',
      description: 'Slay 5 enemies in any zone.',
      type: 'KILLS',
      target: 5,
      progress: 0,
      reward: { gold: 200, xp: 80 },
      icon: '⚔️',
    },
    {
      id: `q2_${today}`,
      title: 'Essence Expenditure',
      description: 'Spend 40 Blood Essence exploring.',
      type: 'ESSENCE_SPENT',
      target: 40,
      progress: 0,
      reward: { flasks: 2, xp: 50 },
      icon: '🩸',
    },
    {
      id: `q3_${today}`,
      title: 'Dark Tithe',
      description: 'Loot 150 Gold from the Catacombs.',
      type: 'GOLD_LOOTED',
      target: 150,
      progress: 0,
      reward: { gold: 300, xp: 100 },
      icon: '💰',
    },
  ];
}

// Essence regeneration — calculate current essence based on last regen timestamp
export function calculateEssence(lastRegenISO, currentEssence, maxEssence = 100) {
  if (!lastRegenISO) return { essence: maxEssence, newTimestamp: new Date().toISOString() };
  const elapsed = (Date.now() - new Date(lastRegenISO).getTime()) / 1000; // seconds
  const regenRate = 30 / 60; // 0.5 essence per minute = 1 per 2 minutes  
  const gained = Math.floor(elapsed * regenRate);
  const newEssence = Math.min(maxEssence, currentEssence + gained);
  return { essence: newEssence, newTimestamp: new Date().toISOString() };
}
