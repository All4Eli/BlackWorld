/**
 * ═══════════════════════════════════════════════════════════════════
 * BLACKWORLD — Server-Authoritative Combat Engine
 * ═══════════════════════════════════════════════════════════════════
 * Pure mathematical logic mapping directly to the GDD equations.
 * No DB I/O happens in this file. It receives raw DB structs,
 * applies equations, and returns a deterministic result and log.
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Compile raw hero DB stats + equipment into effective combat stats.
 *
 * Math (from GDD):
 *   MaxHP      = 100 + (VIT * 5) + (Level * 5) + gear.hp + skills.maxHp
 *   AttackDMG  = 12 + STR + gear.dmg + skills.baseDmg
 *   DmgReduct  = DEF * 0.5 + gear.def + skills.damageReduction
 *   CritChance = DEX * 1.5 + gear.crit + skills.critChance
 *   MaxMana    = 50 + (INT * 3) + gear.maxMana + skills.maxMana
 *   MagicPower = INT + gear.magicDmg + skills.magicDmg
 */
export function compileHeroStats(heroStats, equipment) {
  let gearParams = { dmg: 0, def: 0, hp: 0, crit: 0, maxMana: 0, magicDmg: 0 };

  // Aggregate equipment rolled stats (from inventory JSON object) + base stats
  for (const eq of equipment) {
    const stats = eq.rolled_stats || eq.base_stats || {};
    gearParams.dmg += (stats.dmg || 0);
    gearParams.def += (stats.def || 0);
    gearParams.hp += (stats.hp || 0);
    gearParams.crit += (stats.crit || 0);
    gearParams.maxMana += (stats.mana || 0);
    gearParams.magicDmg += (stats.magicDmg || 0);
  }

  // TODO: Add skill tree stats when implemented in a future phase
  const skills = { maxHp: 0, baseDmg: 0, damageReduction: 0, critChance: 0, maxMana: 0, magicDmg: 0 };
  
  // Also check learned_tomes for permanent passive bonuses
  if (heroStats.learned_tomes?.includes('tome_of_the_blood_pact')) skills.baseDmg += 5;
  if (heroStats.learned_tomes?.includes('tome_of_iron_will')) skills.maxHp += 30;

  const vit = heroStats.vit || 5;
  const str = heroStats.str || 5;
  const def = heroStats.def || 5;
  const dex = heroStats.dex || 5;
  const intVal = heroStats.int || 5;
  const level = heroStats.level || 1;

  const MaxHP = 100 + (vit * 5) + (level * 5) + gearParams.hp + skills.maxHp;
  const AttackDMG = 12 + str + gearParams.dmg + skills.baseDmg;
  const DmgReduct = (def * 0.5) + gearParams.def + skills.damageReduction;
  const CritChance = (dex * 1.5) + gearParams.crit + skills.critChance;
  const MaxMana = 50 + (intVal * 3) + gearParams.maxMana + skills.maxMana;
  const MagicPower = intVal + gearParams.magicDmg + skills.magicDmg;

  return {
    maxHp: Math.floor(MaxHP),
    attackDmg: Math.floor(AttackDMG),
    dmgReduct: Math.floor(DmgReduct),
    critChance: Math.floor(CritChance),
    maxMana: Math.floor(MaxMana),
    magicPower: Math.floor(MagicPower),
  };
}

/**
 * Roll RNG to see if an attack crits.
 */
function rollCrit(critChance) {
  return (Math.random() * 100) <= critChance;
}

/**
 * Resolves a single turn of combat (Player Action -> Enemy Action).
 *
 * @param {Object} combatSession - The active combat row { player_hp, monster_hp, turn_count, player_statuses, monster_statuses }
 * @param {Object} hero - The player's effective stats + vitals
 * @param {Object} monster - The static monster object from DB { name, is_boss, stats: { dmg, hp, def } }
 * @param {string} action - Intent: 'ATTACK', 'USE_FLASK', 'FLEE'
 *
 * @returns {Object} { newSessionState, log, isOver, result: null|'VICTORY'|'DEFEAT'|'FLED' }
 */
export function resolveCombatTurn(combatSession, hero, monster, action) {
  const log = [];
  let isOver = false;
  let result = null;

  // Clone mutable state
  let playerHp = combatSession.player_hp;
  let monsterHp = combatSession.monster_hp;
  let playerStatuses = { ...combatSession.player_statuses };
  let monsterStatuses = { ...combatSession.monster_statuses };
  
  // ── 1. PRE-TURN EFFECTS (Bleed, HoT, etc) ──
  if (monsterStatuses.bleed && monsterStatuses.bleed > 0) {
    const bleedDmg = monsterStatuses.bleed * 5; // Serrated Blades GDD rule
    monsterHp = Math.max(0, monsterHp - bleedDmg);
    log.push({ actor: 'monster', type: 'status_damage', source: 'bleed', value: bleedDmg, message: `${monster.name} bleeds for ${bleedDmg} damage.` });
  }

  if (monsterHp <= 0) {
    return endCombat(combatSession, playerHp, 0, playerStatuses, monsterStatuses, log, 'VICTORY');
  }

  // ── 2. PLAYER ACTION ──
  if (action === 'FLEE') {
    // 50% chance to flee successfully
    if (Math.random() > 0.5) {
      log.push({ actor: 'player', type: 'flee_success', message: `You successfully fled from the battle.` });
      return endCombat(combatSession, playerHp, monsterHp, playerStatuses, monsterStatuses, log, 'FLED');
    } else {
      log.push({ actor: 'player', type: 'flee_fail', message: `You tried to flee, but failed!` });
    }
  } 
  else if (action === 'USE_FLASK') {
    // Requires a flask validation at the DAL level before calling this engine
    const healAmount = 50; // TODO: Pull from config or Efficient Flasks skill
    const oldHp = playerHp;
    playerHp = Math.min(hero.maxHp, playerHp + healAmount);
    const actualHeal = playerHp - oldHp;
    log.push({ actor: 'player', type: 'heal', value: actualHeal, message: `You drank a Blood Flask and recovered ${actualHeal} HP.` });
  } 
  else if (action === 'ATTACK') {
    const isCrit = rollCrit(hero.critChance);
    let grossDmg = hero.attackDmg;
    if (isCrit) grossDmg *= 1.5;
    
    let netDmg = Math.max(1, Math.floor(grossDmg - (monster.stats.def || 0)));
    monsterHp = Math.max(0, monsterHp - netDmg);

    log.push({ 
      actor: 'player', 
      type: 'attack', 
      value: netDmg, 
      isCrit, 
      message: `You struck ${monster.name} for ${netDmg} damage${isCrit ? ' (Critical Hit!)' : '.'}` 
    });

    // Check Lifesteal
    if (hero.lifesteal) {
        const healAmt = hero.lifesteal;
        playerHp = Math.min(hero.maxHp, playerHp + healAmt);
        log.push({ actor: 'player', type: 'heal', source: 'lifesteal', value: healAmt, message: `You siphoned ${healAmt} HP.`});
    }

    // Check Serrated Blades (Bleed Stacking)
    if (hero.hasSerratedBlades) {
        monsterStatuses.bleed = (monsterStatuses.bleed || 0) + 1;
        log.push({ actor: 'monster', type: 'status_apply', source: 'bleed', message: `${monster.name} is bleeding from your Serrated Blade.` });
    }
  }

  // ── 3. EVALUATE MONSTER DEATH ──
  if (monsterHp <= 0) {
    return endCombat(combatSession, playerHp, 0, playerStatuses, monsterStatuses, log, 'VICTORY');
  }

  // ── 4. MONSTER ACTION (Counter-Attack) ──
  if (action !== 'FLEE' || Math.random() < 0.5) { // If player fled and failed, they get hit
    let mDmg = monster.stats.dmg || 5;
    
    // Bosses might have a 10% chance to cast a special
    if (monster.is_boss && Math.random() < 0.1) {
        mDmg *= 2; 
        log.push({ actor: 'monster', type: 'special', message: `${monster.name} used a devastating special attack!`});
    }

    let netDmg = Math.max(1, Math.floor(mDmg - hero.dmgReduct));

    // Blood Aegis calculation
    if (playerHp - netDmg <= (hero.maxHp * 0.3) && !playerStatuses.aegis_triggered && hero.hasBloodAegis) {
        playerStatuses.aegis_triggered = true;
        log.push({ actor: 'player', type: 'buff', message: `Blood Aegis triggered! You block the blow completely.`});
        netDmg = 0;
    }

    playerHp -= netDmg;

    if (netDmg > 0) {
       log.push({ actor: 'monster', type: 'attack', value: netDmg, message: `${monster.name} hits you for ${netDmg} damage.` });
    }

    // Check Undying
    if (playerHp <= 0 && hero.hasUndying && !playerStatuses.undying_triggered) {
        playerHp = 1;
        playerStatuses.undying_triggered = true;
        log.push({ actor: 'player', type: 'buff', message: `Your Undying will prevents you from falling!`});
    }
  }

  // ── 5. EVALUATE PLAYER DEATH ──
  if (playerHp <= 0) {
     playerHp = 0;
     return endCombat(combatSession, playerHp, monsterHp, playerStatuses, monsterStatuses, log, 'DEFEAT');
  }

  // Combat Continues
  return {
    isOver: false,
    result: null,
    log,
    newSessionState: {
        player_hp: playerHp,
        monster_hp: monsterHp,
        turn_count: combatSession.turn_count + 1,
        player_statuses: playerStatuses,
        monster_statuses: monsterStatuses
    }
  };
}

function endCombat(combatSession, playerHp, monsterHp, playerStatuses, monsterStatuses, log, result) {
    return {
        isOver: true,
        result,
        log,
        newSessionState: {
            player_hp: playerHp,
            monster_hp: monsterHp,
            turn_count: combatSession.turn_count + 1,
            player_statuses: playerStatuses,
            monster_statuses: monsterStatuses
        }
    };
}
