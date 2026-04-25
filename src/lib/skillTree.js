// Universal Skill Tree — no classes, all players share one tree
// Players earn 1 skill point per level-up, spend them on any branch

export const SKILL_TREE = {
  combat: {
    name: 'Combat',
    icon: 'W',
    description: 'Raw physical might and weapon mastery.',
    skills: [
      { id: 'iron_flesh', name: 'Iron Flesh', maxRank: 5, description: '+10 Max HP per rank', effect: { maxHp: 10 } },
      { id: 'sharpened_edge', name: 'Sharpened Edge', maxRank: 5, description: '+3 Base Damage per rank', effect: { baseDmg: 3 } },
      { id: 'berserker', name: 'Berserker', maxRank: 3, description: '+5% Critical Hit chance per rank', effect: { critChance: 5 }, requires: 'sharpened_edge', reqRank: 2 },
      { id: 'executioner', name: 'Executioner', maxRank: 1, description: 'Killing blows restore 20 HP', effect: { killHeal: 20 }, requires: 'berserker', reqRank: 2 },
      { id: 'serrated_blades', name: 'Keystone: Serrated Blades', maxRank: 1, description: 'Your successful physical attacks inflict a stacking Bleed dealing 5 damage per turn.', effect: { passiveBleed: 5 }, requires: 'executioner', reqRank: 1 },
    ]
  },
  blood_magic: {
    name: 'Blood Magic',
    icon: 'M',
    description: 'Dark sorcery drawn from life force.',
    skills: [
      { id: 'mana_well', name: 'Mana Well', maxRank: 5, description: '+10 Max Mana per rank', effect: { maxMana: 10 } },
      { id: 'blood_siphon', name: 'Blood Siphon', maxRank: 3, description: 'Attacks heal 3 HP per rank', effect: { lifesteal: 3 } },
      { id: 'soul_burn', name: 'Soul Burn', maxRank: 3, description: '+6 Magic Damage per rank', effect: { magicDmg: 6 }, requires: 'mana_well', reqRank: 2 },
      { id: 'death_mark', name: 'Death Mark', maxRank: 1, description: 'Enemies take 15% more damage', effect: { enemyVuln: 15 }, requires: 'soul_burn', reqRank: 2 },
      { id: 'blood_aegis', name: 'Keystone: Blood Aegis', maxRank: 1, description: 'Upon dropping below 30% HP, gain a shield absorbing damage equal to your Max HP for one turn.', effect: { criticalAegis: true }, requires: 'death_mark', reqRank: 1 },
    ]
  },
  survival: {
    name: 'Survival',
    icon: 'D',
    description: 'Endurance, recovery, and resource efficiency.',
    skills: [
      { id: 'thick_skin', name: 'Thick Skin', maxRank: 5, description: '-2 Damage taken per rank', effect: { damageReduction: 2 } },
      { id: 'efficient_flasks', name: 'Efficient Flasks', maxRank: 3, description: '+15 Flask heal per rank', effect: { flaskBonus: 15 } },
      { id: 'essence_flow', name: 'Essence Flow', maxRank: 3, description: '+5 Max Blood Essence per rank', effect: { maxEssence: 5 } },
      { id: 'undying', name: 'Undying', maxRank: 1, description: 'Survive a killing blow with 1 HP (once per combat)', effect: { undying: true }, requires: 'thick_skin', reqRank: 3 },
      { id: 'thorns', name: 'Keystone: Barbed Carapace', maxRank: 1, description: 'Reflect 25% of all mitigated damage back at your attacker automatically.', effect: { passiveThorns: 25 }, requires: 'undying', reqRank: 1 },
    ]
  }
};

// Tomes — super rare drops that permanently unlock abilities
// These are NOT skill point purchases — they're found treasures
export const TOMES = [
  { id: 'tome_inferno', name: "Tome of Inferno", rarity: 'LEGENDARY', dropRate: 0.02, description: 'Unlocks Inferno Strike: Deal 2x damage, costs 30 Mana.', ability: { name: 'Inferno Strike', manaCost: 30, damageMulti: 2.0 } },
  { id: 'tome_resurrection', name: "Tome of Resurrection", rarity: 'LEGENDARY', dropRate: 0.01, description: 'On death, revive once with 50% HP.', ability: { name: 'Resurrection', passive: true, reviveHpPct: 50 } },
  { id: 'tome_void_walk', name: "Tome of Void Walk", rarity: 'MYTHIC', dropRate: 0.005, description: 'Unlocks Void Walk: Skip enemy turn entirely, costs 50 Mana.', ability: { name: 'Void Walk', manaCost: 50, skipTurn: true } },
  { id: 'tome_blood_pact', name: "Tome of the Blood Pact", rarity: 'EPIC', dropRate: 0.05, description: '+5 permanent Base Damage. Cannot be unlearned.', ability: { name: 'Blood Pact', passive: true, flatDmg: 5 } },
  { id: 'tome_iron_will', name: "Tome of Iron Will", rarity: 'EPIC', dropRate: 0.04, description: '+30 permanent Max HP. Cannot be unlearned.', ability: { name: 'Iron Will', passive: true, flatHp: 30 } },
  { id: 'tome_essence_mastery', name: "Tome of Essence Mastery", rarity: 'RARE', dropRate: 0.08, description: '+20 Max Blood Essence permanently.', ability: { name: 'Essence Mastery', passive: true, flatEssence: 20 } },
];

// Calculate total stat bonuses from a player's skill allocations
export function calculateSkillBonuses(skillPoints = {}) {
  const bonuses = {
    maxHp: 0,
    maxMana: 0,
    baseDmg: 0,
    magicDmg: 0,
    critChance: 0,
    lifesteal: 0,
    killHeal: 0,
    damageReduction: 0,
    flaskBonus: 0,
    maxEssence: 0,
    enemyVuln: 0,
    undying: false,
  };

  for (const branch of Object.values(SKILL_TREE)) {
    for (const skill of branch.skills) {
      const rank = skillPoints[skill.id] || 0;
      if (rank > 0) {
        for (const [stat, value] of Object.entries(skill.effect)) {
          if (typeof value === 'boolean') {
            bonuses[stat] = value;
          } else {
            bonuses[stat] = (bonuses[stat] || 0) + (value * rank);
          }
        }
      }
    }
  }

  return bonuses;
}

// Calculate tome bonuses
export function calculateTomeBonuses(learnedTomes = []) {
  const bonuses = { flatDmg: 0, flatHp: 0, flatEssence: 0, revive: false, abilities: [] };
  for (const tomeId of learnedTomes) {
    const tome = TOMES.find(t => t.id === tomeId);
    if (!tome) continue;
    if (tome.ability.flatDmg) bonuses.flatDmg += tome.ability.flatDmg;
    if (tome.ability.flatHp) bonuses.flatHp += tome.ability.flatHp;
    if (tome.ability.flatEssence) bonuses.flatEssence += tome.ability.flatEssence;
    if (tome.ability.reviveHpPct) bonuses.revive = true;
    if (tome.ability.manaCost) bonuses.abilities.push(tome.ability);
  }
  return bonuses;
}

// Roll for tome drop after a boss kill
export function rollForTomeDrop(learnedTomes = []) {
  for (const tome of TOMES) {
    if (learnedTomes.includes(tome.id)) continue; // already learned
    if (Math.random() < tome.dropRate) {
      return tome;
    }
  }
  return null;
}
