export const RARITIES = {
  COMMON: { label: 'Common', color: 'text-stone-400 border-stone-800', weight: 600, power: 1 },
  UNCOMMON: { label: 'Uncommon', color: 'text-green-500 border-green-900', weight: 250, power: 1.5 },
  RARE: { label: 'Rare', color: 'text-blue-500 border-blue-900', weight: 100, power: 2.5 },
  EPIC: { label: 'Epic', color: 'text-purple-500 border-purple-900', weight: 40, power: 4 },
  LEGENDARY: { label: 'Legendary', color: 'text-yellow-500 border-yellow-600', weight: 9, power: 7 },
  CELESTIAL: { label: 'Celestial', color: 'text-cyan-400 border-cyan-800', weight: 1, power: 15 },
};

export const ITEM_TYPES = [
  'MAIN_HAND',
  'OFF_HAND',
  'BODY',
  'HEAD',
  'RING',
  'AMULET',
  'BOOTS'
];

const PREFIXES = {
  WEAPON: ['Blood', 'Void', 'Shattered', 'Forsaken', 'Cursed', 'Ethereal', 'Sovereign', 'Abyssal'],
  ARMOR: ['Rusted', 'Plated', 'Bone', 'Phantom', 'Hollow', 'Obsidian', 'Sacred', 'Damned'],
  ACCESSORY: ['Gleaming', 'Chipped', 'Enchanted', 'Whispering', 'Crimson', 'Tearful', 'Lost', 'Ascendant']
};

const NOUNS = {
  MAIN_HAND: ['Longsword', 'Axe', 'Cleaver', 'Dagger', 'Scythe', 'Mace', 'Rapier'],
  OFF_HAND: ['Shield', 'Tome', 'Buckler', 'Ward', 'Orb', 'Lantern', 'Chalice'],
  BODY: ['Chainmail', 'Breastplate', 'Robes', 'Carapace', 'Tunic', 'Shroud', 'Vestment'],
  HEAD: ['Helm', 'Crown', 'Visage', 'Hood', 'Circlet', 'Mask', 'Veil'],
  RING: ['Band', 'Signet', 'Loop', 'Coil', 'Seal'],
  AMULET: ['Pendant', 'Charm', 'Talisman', 'Locket', 'Relic'],
  BOOTS: ['Greaves', 'Treads', 'Sabatons', 'Wraps', 'Striders']
};

const SUFFIXES = ['of the Void', 'of Agony', 'of the King', 'of Despair', 'of Shadows', 'X', 'Prime', 'of the Eclipse'];

function generateName(type, isHighRarity) {
  const nounType = type === 'MAIN_HAND' ? 'MAIN_HAND' : 
                   type === 'OFF_HAND' ? 'OFF_HAND' :
                   type === 'BODY' ? 'BODY' :
                   type === 'HEAD' ? 'HEAD' :
                   type === 'RING' ? 'RING' :
                   type === 'AMULET' ? 'AMULET' : 'BOOTS';
                   
  const prefixPool = ['MAIN_HAND', 'OFF_HAND'].includes(type) ? PREFIXES.WEAPON :
                     ['BODY', 'HEAD', 'BOOTS'].includes(type) ? PREFIXES.ARMOR : PREFIXES.ACCESSORY;

  const pre = prefixPool[Math.floor(Math.random() * prefixPool.length)];
  const noun = NOUNS[nounType][Math.floor(Math.random() * NOUNS[nounType].length)];
  
  if (isHighRarity && Math.random() > 0.5) {
      const suf = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
      return `${pre} ${noun} ${suf}`;
  }
  return `${pre} ${noun}`;
}

export function generateLoot(tierLevel = 1) {
  // Determine Rarity
  const totalWeight = Object.values(RARITIES).reduce((acc, r) => acc + r.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  let rarityKey = 'COMMON';
  for (const [key, value] of Object.entries(RARITIES)) {
      if (roll < value.weight) {
          rarityKey = key;
          break;
      }
      roll -= value.weight;
  }
  
  const rarity = RARITIES[rarityKey];
  const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  
  const isHighRarity = ['EPIC', 'LEGENDARY', 'CELESTIAL'].includes(rarityKey);
  const name = generateName(type, isHighRarity);

  // Generate Stats dynamically based on power multiplier and tier
  const baseStatPool = Math.floor((10 * tierLevel) * rarity.power);
  const stats = {};

  if (type === 'MAIN_HAND') {
      stats.dmg = baseStatPool;
      if (isHighRarity) stats.crit = Math.floor(Math.random() * 5 * rarity.power);
  } else if (type === 'OFF_HAND') {
      if (Math.random() > 0.5) {
          stats.def = baseStatPool; // Shield
      } else {
          stats.magicDmg = Math.floor(baseStatPool * 0.5); // Tome
          stats.maxMana = baseStatPool;
      }
  } else if (['BODY', 'HEAD', 'BOOTS'].includes(type)) {
      stats.def = baseStatPool;
      stats.hp = Math.floor(baseStatPool * 2.5);
  } else if (['RING', 'AMULET'].includes(type)) {
      // Accessories have hybrid stats
      const mix = Math.random();
      if (mix < 0.3) {
          stats.dmg = Math.floor(baseStatPool * 0.5);
          stats.def = Math.floor(baseStatPool * 0.5);
      } else if (mix < 0.6) {
          stats.crit = Math.floor(2 * rarity.power);
          stats.hp = baseStatPool;
      } else {
          stats.lifesteal = Math.max(1, Math.floor(1 * rarity.power));
          stats.magicDmg = Math.floor(baseStatPool * 0.5);
      }
  }

  return {
      id: `item_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      rarity: rarityKey,
      stats,
      level: tierLevel
  };
}
