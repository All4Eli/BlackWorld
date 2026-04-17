// Helper to safely get total bonus from equipment
const getEquipBonus = (artifacts = [], property) => {
    return artifacts.reduce((sum, item) => sum + (item?.stats?.[property] || 0), 0);
};

export const calcPlayerStats = (heroData) => {
    // Use the same stat model as gameData.js: hero.str, hero.def, hero.dex, hero.vit
    const str = heroData?.str ?? 5;
    const def = heroData?.def ?? 5;
    const dex = heroData?.dex ?? 5;
    const vit = heroData?.vit ?? 5;
    const level = heroData?.level || 1;
    const artifacts = heroData?.artifacts || [];

    const hpBonus = getEquipBonus(artifacts, 'hp');
    const dmgBonus = getEquipBonus(artifacts, 'dmg');
    const dodgeBonus = getEquipBonus(artifacts, 'dodge') / 100;

    // Match gameData.js HP formula: 100 + (vit * 5) + gear HP
    const maxHp = 100 + (vit * 5) + (level * 5) + hpBonus;

    // Equipped gear damage
    let equipDmg = 0;
    if (heroData?.equipped) {
        Object.values(heroData.equipped).forEach(item => {
            if (item?.stats?.dmg) equipDmg += item.stats.dmg;
        });
    }

    const baseDamageMin = 1 + (str * 1) + equipDmg + dmgBonus;
    const baseDamageMax = 3 + (str * 2) + equipDmg + dmgBonus;

    return {
        maxHp,
        baseDamageMin,
        baseDamageMax,
        damageReduction: Math.floor(def * 0.5),
        dodgeChance: Math.min(0.5, (dex * 0.015) + dodgeBonus)
    };
};

export const rollDamage = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const calcMonsterStats = (bossData) => {
    const tierMultipliers = {
        'Common': 1.0,
        'Uncommon': 1.2,
        'Rare': 1.5,
        'Epic': 2.0,
        'Legendary': 2.5,
        'Celestial': 3.5
    };

    const multiplier = tierMultipliers[bossData.tier] || 1.0;

    return {
        hp: bossData.base_hp,
        maxHp: bossData.base_hp,
        damageMin: Math.floor(bossData.base_damage_min * multiplier),
        damageMax: Math.floor(bossData.base_damage_max * multiplier),
        dodgeChance: bossData.dodge_chance || 0.0,
        baseXp: bossData.base_hp, // Use base HP as a proxy for base XP
        xpMultiplier: multiplier
    };
};

export const isHitDodged = (dodgeChance) => {
    return Math.random() < dodgeChance;
};
