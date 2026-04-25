// ═══════════════════════════════════════════════════════════════════
// Combat Utility Functions — Shared between exploration & PvP
// ═══════════════════════════════════════════════════════════════════
//
// UNCAPPED PROGRESSION DESIGN:
//   - No stat caps. No level caps.
//   - A high-DEX player CAN dodge 100% of attacks.
//   - A high-DEF player CAN take exactly 0 damage.
//   - No artificial minimum damage (Math.max(0, ...) not Math.max(1, ...)).
//   - Integer overflow is guarded via safeMul/safeAdd clamping at MAX_SAFE_INTEGER.
// ═══════════════════════════════════════════════════════════════════

import { calcCombatStats } from '@/lib/gameData';
import { calculateSkillBonuses } from '@/lib/skillTree';

// ── Safe Integer Arithmetic ─────────────────────────────────────
//
// JavaScript loses precision above Number.MAX_SAFE_INTEGER (2^53 - 1).
// If multiplicative buffs interact with massive base stats, results
// could overflow into Infinity or scientific notation, which PostgreSQL
// integer columns will reject.
//
// These helpers clamp at MAX_SAFE_INTEGER to prevent this.
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function safeAdd(a, b) {
  const result = a + b;
  if (result > MAX_SAFE) return MAX_SAFE;
  if (result < -MAX_SAFE) return -MAX_SAFE;
  return result;
}

function safeMul(a, b) {
  const result = a * b;
  if (!Number.isFinite(result)) return MAX_SAFE;
  if (result > MAX_SAFE) return MAX_SAFE;
  if (result < -MAX_SAFE) return -MAX_SAFE;
  return result;
}

// Helper to safely get total bonus from equipment (legacy fallback)
const getEquipBonus = (artifacts = [], property) => {
    return artifacts.reduce((sum, item) => sum + (item?.stats?.[property] || 0), 0);
};

export const calcPlayerStats = (heroData) => {
    // Pipe calculations into the unified modern global solver
    const sb = calculateSkillBonuses(heroData?.skillPoints || {});
    const unifiedStats = calcCombatStats(heroData, sb);

    // ── Dodge Chance (Uncapped) ─────────────────────────────────
    //
    // DESIGN: Dodge is derived from DEX, NOT from critChance.
    // Each point of DEX gives 0.5% dodge chance.
    // This is intentionally uncapped — a player with 200 DEX gets
    // 100% dodge, and that's the intended power fantasy.
    //
    // The value is stored as a ratio (0.0 to 1.0+) for isHitDodged().
    // Values above 1.0 mean guaranteed dodge (handled gracefully).
    //
    // PREVIOUS BUG: dodge was Math.min(0.5, critChance * 0.01)
    //   → Hardcapped at 50% dodge, and entangled with crit.
    const dex = heroData?.dex ?? 5;
    const dodgeFromDex = dex * 0.005;  // 0.5% per DEX point
    const dodgeFromSkills = (sb.dodgeChance || 0) * 0.01;  // future skill tree support
    const dodgeFromGear = (unifiedStats.dodgeChanceFlat || 0) * 0.01;  // future gear support
    const totalDodge = dodgeFromDex + dodgeFromSkills + dodgeFromGear;

    // Map unified variables to combat loop format expected by Explore Engine
    // baseDamageMin/Max: 80%–120% variance around base attack damage
    return {
        maxHp: unifiedStats.maxHp,
        baseDamageMin: Math.floor(safeMul(unifiedStats.attackDamage, 0.8)),
        baseDamageMax: Math.floor(safeMul(unifiedStats.attackDamage, 1.2)),
        damageReduction: unifiedStats.damageReduction,
        critChance: unifiedStats.critChance,
        dodgeChance: totalDodge,  // Uncapped — values >= 1.0 = guaranteed dodge
        lifesteal: unifiedStats.lifesteal || 0,
        passiveBleed: sb.passiveBleed || 0,
    };
};

export const rollDamage = (min, max) => {
    // Guard: if min > max (shouldn't happen but defensive), swap
    if (min > max) [min, max] = [max, min];
    // Guard: both values should be non-negative
    min = Math.max(0, min);
    max = Math.max(0, max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const calcMonsterStats = (bossData) => {
    const tierMultipliers = {
        'Common': 1.0, 'COMMON': 1.0,
        'Uncommon': 1.2, 'UNCOMMON': 1.2,
        'Rare': 1.5, 'RARE': 1.5,
        'Epic': 2.0, 'EPIC': 2.0,
        'Legendary': 2.5, 'LEGENDARY': 2.5,
        'Celestial': 3.5, 'CELESTIAL': 3.5,
    };

    const multiplier = tierMultipliers[bossData.tier] || 1.0;

    return {
        hp: bossData.hp ?? bossData.base_hp ?? bossData.baseHp ?? 1,
        maxHp: bossData.maxHp ?? bossData.base_hp ?? bossData.baseHp ?? 1,
        damageMin: Math.floor(safeMul((bossData.damageMin ?? bossData.base_damage_min ?? bossData.dmgMin ?? 1), multiplier)),
        damageMax: Math.floor(safeMul((bossData.damageMax ?? bossData.base_damage_max ?? bossData.dmgMax ?? 2), multiplier)),
        dodgeChance: bossData.dodgeChance ?? bossData.dodge_chance ?? bossData.dodge ?? 0.0,
        baseXp: bossData.hp ?? bossData.base_hp ?? bossData.baseHp ?? 10,
        xpMultiplier: multiplier
    };
};

// ── Dodge Resolution (Uncapped) ──────────────────────────────────
//
// dodgeChance is a ratio: 0.0 = never dodge, 1.0 = always dodge.
// Values >= 1.0 are VALID — they mean guaranteed dodge.
// Math.random() returns [0, 1), so if dodgeChance >= 1.0,
// the condition (Math.random() < 1.0+) is always true → guaranteed dodge.
//
// This gracefully handles values > 100% without NaN or logical errors.
export const isHitDodged = (dodgeChance) => {
    // Guard: negative dodge = never dodge
    if (dodgeChance <= 0) return false;
    // Values >= 1.0 = guaranteed dodge (uncapped progression)
    if (dodgeChance >= 1.0) return true;
    return Math.random() < dodgeChance;
};
