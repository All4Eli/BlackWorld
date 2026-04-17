// Helper to safely get total bonus from equipment
const getEquipBonus = (artifacts = [], property) => {
    return artifacts.reduce((sum, item) => sum + (item?.stats?.[property] || 0), 0);
};

import { calcCombatStats } from '@/lib/gameData';
import { calculateSkillBonuses } from '@/lib/skillTree';

export const calcPlayerStats = (heroData) => {
    // Pipe calculations into the unified modern global solver
    const sb = calculateSkillBonuses(heroData?.skillPoints || {});
    const unifiedStats = calcCombatStats(heroData, sb);

    // Map unified variables to legacy combat loop format expected by Explore Engine
    // (We extrapolate damage constraints linearly for the math sequence)
    return {
        maxHp: unifiedStats.maxHp,
        baseDamageMin: Math.floor(unifiedStats.attackDamage * 0.8), // e.g. 20 base dmg -> 16 min
        baseDamageMax: Math.floor(unifiedStats.attackDamage * 1.2), // e.g. 20 base dmg -> 24 max
        damageReduction: unifiedStats.damageReduction,
        dodgeChance: Math.min(0.5, unifiedStats.critChance * 0.01) // Maps roughly identically
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
        hp: bossData.hp ?? bossData.base_hp ?? bossData.baseHp ?? 1,
        maxHp: bossData.maxHp ?? bossData.base_hp ?? bossData.baseHp ?? 1,
        damageMin: Math.floor((bossData.damageMin ?? bossData.base_damage_min ?? bossData.dmgMin ?? 1) * multiplier),
        damageMax: Math.floor((bossData.damageMax ?? bossData.base_damage_max ?? bossData.dmgMax ?? 2) * multiplier),
        dodgeChance: bossData.dodgeChance ?? bossData.dodge_chance ?? bossData.dodge ?? 0.0,
        baseXp: bossData.hp ?? bossData.base_hp ?? bossData.baseHp ?? 10,

        xpMultiplier: multiplier
    };
};

export const isHitDodged = (dodgeChance) => {
    return Math.random() < dodgeChance;
};
