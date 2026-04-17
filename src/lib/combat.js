// Helper to safely get total bonus from equipment
const getEquipBonus = (artifacts = [], property) => {
    return artifacts.reduce((sum, item) => sum + (item?.stats?.[property] || 0), 0);
};

export const calcPlayerStats = (heroData) => {
    const strength = heroData?.attributes?.strength || 1;
    const cunning = heroData?.attributes?.cunning || 1;
    const agility = heroData?.attributes?.agility || 1;
    const level = heroData?.level || 1;
    const artifacts = heroData?.artifacts || [];

    const hpBonus = getEquipBonus(artifacts, 'hp');
    const dmgBonus = getEquipBonus(artifacts, 'dmg');
    const dodgeBonus = getEquipBonus(artifacts, 'dodge') / 100; // if dodge is stored as integer %

    const maxHp = 50 + (strength * 10) + (level * 5) + hpBonus;
    
    // We assume base unarmed damage is 1-3 if no weapons exist, but equations asked for: 
    // Player Damage Roll = rand(base_min, base_max) + (Cunning × 2) + Σ(equipment.damage_bonus)
    // We'll treat the min-max broadly.
    const baseDamageMin = 1;
    const baseDamageMax = 3;

    return {
        maxHp,
        baseDamageMin: baseDamageMin + (cunning * 2) + dmgBonus,
        baseDamageMax: baseDamageMax + (cunning * 2) + dmgBonus,
        cunning,
        dodgeChance: Math.min(0.5, (agility * 0.02) + dodgeBonus)
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
