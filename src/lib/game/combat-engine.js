/**
 * ═══════════════════════════════════════════════════════════════════
 * BLACKWORLD — Server-Authoritative Combat Engine
 * ═══════════════════════════════════════════════════════════════════
 * Pure mathematical logic mapping directly to the GDD equations.
 * No DB I/O happens in this file. It receives raw DB structs,
 * applies equations, and returns a deterministic result and log.
 *
 * ───────────────────────────────────────────────────────────────────
 * SKILL TREE INTEGRATION (Phase 4):
 *
 *   compileHeroStats() now accepts an optional `skillBonuses` object
 *   produced by calculateSkillBonuses() from skillTree.js. This
 *   replaces the hardcoded TODO placeholder.
 *
 *   resolveCombatTurn() reads skill-driven booleans and values
 *   (hasSerratedBlades, hasBloodAegis, hasUndying, lifesteal,
 *   flaskBonus) from the hero object passed in by the caller.
 *   These values are set by the calling route (e.g., /api/pvp/challenge)
 *   BEFORE this engine is invoked.
 *
 *   The engine itself never imports skillTree.js or accesses the DB.
 *   It is a pure math module that trusts its inputs.
 * ═══════════════════════════════════════════════════════════════════
 */


/**
 * Compile raw hero DB stats + equipment + skill bonuses into
 * effective combat stats.
 *
 * Math (from GDD):
 *   MaxHP      = 100 + (VIT * 5) + (Level * 5) + gear.hp + skills.maxHp + tomes.flatHp
 *   AttackDMG  = 12 + STR + gear.dmg + skills.baseDmg + tomes.flatDmg
 *   DmgReduct  = DEF * 0.5 + gear.def + skills.damageReduction
 *   CritChance = DEX * 1.5 + gear.crit + skills.critChance
 *   MaxMana    = 50 + (INT * 3) + gear.maxMana + skills.maxMana
 *   MagicPower = INT + gear.magicDmg + skills.magicDmg
 *
 * @param {Object} heroStats — Row from hero_stats table.
 *   Expected fields: { str, def, dex, int, vit, level, learned_tomes }
 *   All default to safe values if missing (supports legacy saves).
 *
 * @param {Object[]} equipment — Array of equipped item rows.
 *   Each element should have { rolled_stats, base_stats } objects
 *   with numeric stat values (dmg, def, hp, crit, mana, magicDmg).
 *   This comes from InventoryDal.getEquipment() which JOINs:
 *     equipment → inventory → items
 *
 * @param {Object} [skillBonuses={}] — Output of calculateSkillBonuses().
 *   Contains aggregated skill tree stat modifiers:
 *   { maxHp, baseDmg, critChance, damageReduction, maxMana, magicDmg,
 *     lifesteal, flaskBonus, killHeal, maxEssence, enemyVuln, undying }
 *
 *   Each value represents the TOTAL bonus from all skill ranks.
 *   Example: iron_flesh (maxHp: +10/rank) at rank 5 = maxHp: 50
 *
 * @returns {Object} Effective combat stats:
 *   { maxHp, attackDmg, dmgReduct, critChance, maxMana, magicPower,
 *     lifesteal, flaskBonus }
 */
export function compileHeroStats(heroStats, equipment, skillBonuses = {}) {

  // ── Step A: Aggregate equipment stats ───────────────────────
  //
  // We iterate over the `equipment` array and sum up each stat
  // across all equipped items.
  //
  // JAVASCRIPT DETAIL — Mutable accumulator object:
  //   `gearParams` is an object with initial values of 0.
  //   The for...of loop mutates it IN PLACE with the += operator.
  //   This is intentional and safe because `gearParams` is a local
  //   variable that never escapes this function scope.
  //
  // JAVASCRIPT DETAIL — Logical OR (||) for null safety:
  //   (stats.dmg || 0) returns stats.dmg if it's truthy (non-zero,
  //   non-null, non-undefined), otherwise returns 0. This handles:
  //     • stats.dmg is undefined → 0
  //     • stats.dmg is null → 0
  //     • stats.dmg is 0 → 0 (this is fine — 0 + 0 = 0)
  //
  //   CAVEAT: || also catches false, '', and NaN. For stat values
  //   (which are always numbers or missing), this is acceptable.
  //   For booleans, use ?? (nullish coalescing) instead.
  let gearParams = { dmg: 0, def: 0, hp: 0, crit: 0, maxMana: 0, magicDmg: 0, lifesteal: 0 };

  for (const eq of (equipment || [])) {
    // ADDITIVE aggregation: both rolled_stats AND base_stats contribute.
    // rolled_stats are per-item randomized stats (set when item drops).
    // base_stats are catalog-defined base stats for the item type.
    // Both should ADD to the total, not one replacing the other.
    //
    // PREVIOUS BUG: `const stats = eq.rolled_stats || eq.base_stats || {}`
    //   → This picked ONE source, discarding base_stats if rolled_stats existed.
    //   → An item with rolled_stats: { dmg: 5 } and base_stats: { dmg: 10 }
    //     would contribute only 5 instead of 15.
    const bs = eq.base_stats || {};
    const rs = eq.rolled_stats || {};
    gearParams.dmg      += (bs.dmg || 0) + (rs.dmg || 0);
    gearParams.def      += (bs.def || 0) + (rs.def || 0);
    gearParams.hp       += (bs.hp || 0) + (rs.hp || 0);
    gearParams.crit     += (bs.crit || 0) + (rs.crit || 0);
    gearParams.maxMana  += (bs.mana || bs.maxMana || 0) + (rs.mana || rs.maxMana || 0);
    gearParams.magicDmg += (bs.magicDmg || 0) + (rs.magicDmg || 0);
    gearParams.lifesteal += (bs.lifesteal || 0) + (rs.lifesteal || 0);
  }

  // ── Step B: Resolve tome bonuses ────────────────────────────
  //
  // Learned tomes are stored as a TEXT[] (PostgreSQL text array)
  // in hero_stats.learned_tomes. The `pg` driver returns them as
  // a native JS string array: ["tome_of_the_blood_pact", "tome_of_iron_will"]
  //
  // Array.includes() scans the array and returns true if the
  // string is found. This is O(n) but the array is tiny (<10 tomes).
  //
  // These provide flat, permanent stat bonuses that stack with
  // skill tree bonuses.
  const learnedTomes = heroStats.learned_tomes || [];
  let tomeDmg = 0;
  let tomeHp = 0;
  if (learnedTomes.includes('tome_of_the_blood_pact') || learnedTomes.includes('tome_blood_pact')) {
    tomeDmg += 5;
  }
  if (learnedTomes.includes('tome_of_iron_will') || learnedTomes.includes('tome_iron_will')) {
    tomeHp += 30;
  }

  // ── Step C: Read base attributes with safe defaults ─────────
  //
  // The ?? (nullish coalescing) operator returns the right-hand
  // value ONLY if the left-hand is null or undefined.
  // This is different from || which also triggers on 0 and ''.
  //
  // Example: if heroStats.vit is 0 (a valid value):
  //   heroStats.vit || 5 → returns 5 (WRONG — 0 is falsy)
  //   heroStats.vit ?? 5 → returns 0 (CORRECT — 0 is not null)
  //
  // However, for these base stats, 0 should never occur (minimum
  // starting stat is 5), so || is functionally equivalent here.
  // We use || for consistency with the rest of the codebase.
  const vit    = heroStats.vit || 5;
  const str    = heroStats.str || 5;
  const def    = heroStats.def || 5;
  const dex    = heroStats.dex || 5;
  const intVal = heroStats.int || 5;
  const level  = heroStats.level || 1;

  // ── Step D: Apply the GDD formulas ──────────────────────────
  //
  // Each formula adds three layers:
  //   1. Base (from core attributes)
  //   2. Gear (from equipped items)
  //   3. Skills (from skill tree allocations)
  //   4. Tomes (from learned passive tomes)
  //
  // Math.floor() truncates to integer — combat uses whole numbers.
  const MaxHP     = 100 + (vit * 5) + (level * 5) + gearParams.hp
                    + (skillBonuses.maxHp || 0) + tomeHp;
  const AttackDMG = 12 + str + gearParams.dmg
                    + (skillBonuses.baseDmg || 0) + tomeDmg;
  const DmgReduct = (def * 0.5) + gearParams.def
                    + (skillBonuses.damageReduction || 0);
  const CritChance = (dex * 1.5) + gearParams.crit
                    + (skillBonuses.critChance || 0);
  const MaxMana   = 50 + (intVal * 3) + gearParams.maxMana
                    + (skillBonuses.maxMana || 0);
  const MagicPower = intVal + gearParams.magicDmg
                    + (skillBonuses.magicDmg || 0);

  return {
    maxHp:      Math.floor(MaxHP),
    attackDmg:  Math.floor(AttackDMG),
    dmgReduct:  Math.floor(DmgReduct),
    critChance: Math.floor(CritChance),
    maxMana:    Math.floor(MaxMana),
    magicPower: Math.floor(MagicPower),
    lifesteal:  gearParams.lifesteal + (skillBonuses.lifesteal || 0),
    flaskBonus: skillBonuses.flaskBonus || 0,
  };
}


/**
 * Roll RNG to see if an attack crits.
 *
 * @param {number} critChance — A percentage (e.g., 15 = 15% chance).
 *   Math.random() returns [0, 1), multiply by 100 → [0, 100).
 *   If the result is <= critChance, it's a crit.
 *
 *   Example: critChance = 15
 *     Math.random() * 100 = 12.3 → 12.3 <= 15 → true (crit!)
 *     Math.random() * 100 = 72.8 → 72.8 <= 15 → false (no crit)
 */
function rollCrit(critChance) {
  return (Math.random() * 100) <= critChance;
}


/**
 * Resolves a single turn of combat (Player Action -> Enemy Action).
 *
 * This function is PURE — it has no side effects, no DB calls, no
 * network requests. It receives the current state, applies math,
 * and returns the new state. The calling route is responsible for
 * persisting the result to the database.
 *
 * @param {Object} combatSession — The active combat row from combat_sessions:
 *   { player_hp, monster_hp, turn_count, player_statuses, monster_statuses }
 *
 * @param {Object} hero — The player's effective stats (output of compileHeroStats):
 *   { maxHp, attackDmg, dmgReduct, critChance, lifesteal, flaskBonus,
 *     hasSerratedBlades, hasBloodAegis, hasUndying, killHeal, enemyVuln }
 *
 *   SKILL TREE FLAGS (set by the calling route, NOT by this engine):
 *     hero.hasSerratedBlades — If true, attacks apply bleed stacks
 *     hero.hasBloodAegis    — If true, one-time damage absorb at <30% HP
 *     hero.hasUndying       — If true, survive lethal blow at 1 HP once
 *     hero.lifesteal        — Numeric: heal this much HP on each hit
 *     hero.flaskBonus       — Numeric: extra HP when using a flask
 *     hero.killHeal         — Numeric: heal this much HP on killing blow
 *     hero.enemyVuln        — Numeric: enemies take X% more damage
 *
 * @param {Object} monster — The static monster object from DB:
 *   { name, is_boss, stats: { dmg, hp, def } }
 *
 * @param {string} action — Player intent: 'ATTACK', 'USE_FLASK', 'FLEE'
 *
 * @returns {Object} { newSessionState, log, isOver, result: null|'VICTORY'|'DEFEAT'|'FLED' }
 */
export function resolveCombatTurn(combatSession, hero, monster, action) {
  // ── Initialize log array ──────────────────────────────────────
  //
  // `log` collects all events that happened this turn, in order.
  // The calling route sends this to the client for UI animation.
  // It's a mutable array — we push new entries as events occur.
  const log = [];
  let isOver = false;
  let result = null;

  // ── Clone mutable state ───────────────────────────────────────
  //
  // We copy HP values into local variables so we can mutate them
  // without affecting the original combatSession object. This
  // follows the "functional core" principle — the engine doesn't
  // mutate its inputs.
  //
  // The spread operator { ...obj } creates a SHALLOW copy of the
  // object. For our status objects (which contain only primitives
  // like numbers and booleans), shallow copy is sufficient.
  let playerHp = combatSession.player_hp;
  let monsterHp = combatSession.monster_hp;
  let playerStatuses = { ...combatSession.player_statuses };
  let monsterStatuses = { ...combatSession.monster_statuses };

  // ── 1. PRE-TURN EFFECTS (Bleed, DoTs) ─────────────────────────
  //
  // Bleed is a stacking status applied by Serrated Blades.
  // Each stack deals 5 damage per turn. Stacks are tracked as
  // an integer in monsterStatuses.bleed.
  //
  // Example: 3 bleed stacks → 3 × 5 = 15 damage at start of turn
  if (monsterStatuses.bleed && monsterStatuses.bleed > 0) {
    const bleedDmg = monsterStatuses.bleed * 5;
    // Math.max(0, ...) prevents HP from going negative (cosmetic)
    monsterHp = Math.max(0, monsterHp - bleedDmg);
    log.push({
      actor: 'monster', type: 'status_damage', source: 'bleed',
      value: bleedDmg,
      message: `${monster.name} bleeds for ${bleedDmg} damage.`,
    });
  }

  if (monsterHp <= 0) {
    return endCombat(combatSession, playerHp, 0, playerStatuses, monsterStatuses, log, 'VICTORY', hero);
  }

  // ── 2. PLAYER ACTION ──────────────────────────────────────────
  if (action === 'FLEE') {
    // 50% chance to flee — Math.random() > 0.5 means ~50/50
    if (Math.random() > 0.5) {
      log.push({ actor: 'player', type: 'flee_success', message: `You successfully fled from the battle.` });
      return endCombat(combatSession, playerHp, monsterHp, playerStatuses, monsterStatuses, log, 'FLED', hero);
    } else {
      log.push({ actor: 'player', type: 'flee_fail', message: `You tried to flee, but failed!` });
    }
  }
  else if (action === 'USE_FLASK') {
    // ── Flask healing (Skill Tree: Efficient Flasks) ────────────
    //
    // Base flask heal: 50 HP
    // hero.flaskBonus: additional HP from the efficient_flasks skill
    //   (+15 per rank, max 3 ranks = +45)
    // Total at max rank: 50 + 45 = 95 HP per flask
    //
    // Math.min(hero.maxHp, playerHp + healAmount):
    //   Caps healing at max HP. If the player has 180/200 HP and
    //   heals for 95, they get 200 (not 275).
    const healAmount = 50 + (hero.flaskBonus || 0);
    const oldHp = playerHp;
    playerHp = Math.min(hero.maxHp, playerHp + healAmount);
    const actualHeal = playerHp - oldHp;
    log.push({
      actor: 'player', type: 'heal', value: actualHeal,
      message: `You drank a Blood Flask and recovered ${actualHeal} HP.`,
    });
  }
  else if (action === 'ATTACK') {
    // ── Player attack with crit roll ────────────────────────────
    const isCrit = rollCrit(hero.critChance);
    let grossDmg = hero.attackDmg;
    if (isCrit) grossDmg *= 1.5;

    // ── Enemy Vulnerability (Skill Tree: Death Mark) ────────────
    //
    // hero.enemyVuln is a percentage (e.g., 15 = 15%).
    // We multiply gross damage by (1 + vuln/100):
    //   grossDmg = 30, enemyVuln = 15
    //   30 * 1.15 = 34.5 → Math.floor → 34
    //
    // This modifier applies BEFORE defense reduction, making it
    // more effective against low-defense enemies.
    if (hero.enemyVuln && hero.enemyVuln > 0) {
      grossDmg = Math.floor(grossDmg * (1 + hero.enemyVuln / 100));
    }

    // Net damage = gross minus monster's defense
    // UNCAPPED: 0 damage is valid when player defense is weaker than monster's
    let netDmg = Math.max(0, Math.floor(grossDmg - (monster.stats.def || 0)));
    monsterHp = Math.max(0, monsterHp - netDmg);

    log.push({
      actor: 'player', type: 'attack', value: netDmg, isCrit,
      message: `You struck ${monster.name} for ${netDmg} damage${isCrit ? ' (Critical Hit!)' : '.'}`,
    });

    // ── Lifesteal (Skill Tree: Blood Siphon) ────────────────────
    //
    // hero.lifesteal is a flat value (e.g., 9 at max rank).
    // The player heals this amount ON EVERY successful attack.
    // Math.min caps at maxHp to prevent overhealing.
    if (hero.lifesteal && hero.lifesteal > 0) {
      const healAmt = hero.lifesteal;
      playerHp = Math.min(hero.maxHp, playerHp + healAmt);
      log.push({
        actor: 'player', type: 'heal', source: 'lifesteal',
        value: healAmt,
        message: `You siphoned ${healAmt} HP.`,
      });
    }

    // ── Serrated Blades (Skill Tree: Keystone) ──────────────────
    //
    // hero.hasSerratedBlades is a boolean set by the calling route.
    // It's true when skillPoints.serrated_blades >= 1.
    //
    // Each attack adds 1 bleed stack. Bleed deals 5 × stacks
    // at the START of each subsequent turn (see pre-turn effects).
    // Stacks are unlimited — long fights create escalating damage.
    if (hero.hasSerratedBlades) {
      monsterStatuses.bleed = (monsterStatuses.bleed || 0) + 1;
      log.push({
        actor: 'monster', type: 'status_apply', source: 'bleed',
        message: `${monster.name} is bleeding from your Serrated Blade.`,
      });
    }
  }

  // ── 3. EVALUATE MONSTER DEATH ─────────────────────────────────
  if (monsterHp <= 0) {
    return endCombat(combatSession, playerHp, 0, playerStatuses, monsterStatuses, log, 'VICTORY', hero);
  }

  // ── 4. MONSTER ACTION (Counter-Attack) ────────────────────────
  //
  // The monster attacks UNLESS the player fled and failed (in which
  // case there's a 50% chance the monster still hits).
  if (action !== 'FLEE' || Math.random() < 0.5) {
    let mDmg = monster.stats.dmg || 5;

    // Bosses have a 10% chance to use a devastating special attack
    // that deals double damage. This adds variance to boss fights.
    if (monster.is_boss && Math.random() < 0.1) {
      mDmg *= 2;
      log.push({
        actor: 'monster', type: 'special',
        message: `${monster.name} used a devastating special attack!`,
      });
    }

    // Net damage = monster's gross minus player's damage reduction
    // UNCAPPED: 0 damage is valid — high defense tanks can fully absorb
    let netDmg = Math.max(0, Math.floor(mDmg - hero.dmgReduct));

    // ── Blood Aegis (Skill Tree: Keystone) ──────────────────────
    //
    // Triggers ONCE per combat when the player would drop below
    // 30% of max HP. Completely absorbs the incoming damage.
    //
    // Condition breakdown:
    //   (playerHp - netDmg) <= (hero.maxHp * 0.3)
    //     → The attack WOULD bring us below 30% HP threshold
    //   !playerStatuses.aegis_triggered
    //     → Aegis hasn't been used yet this combat
    //   hero.hasBloodAegis
    //     → Player has the Blood Aegis keystone unlocked
    //
    // All three must be true (&&) for Aegis to activate.
    if ((playerHp - netDmg) <= (hero.maxHp * 0.3) && !playerStatuses.aegis_triggered && hero.hasBloodAegis) {
      playerStatuses.aegis_triggered = true;
      log.push({
        actor: 'player', type: 'buff',
        message: `Blood Aegis triggered! You block the blow completely.`,
      });
      netDmg = 0;
    }

    // ── Thorns (Skill Tree: Barbed Carapace) ────────────────────
    //
    // Reflects 25% of MITIGATED damage back at the monster.
    // Mitigated damage = gross monster damage - net damage.
    // This rewards high-defense builds by turning their tankiness
    // into passive damage output.
    if (hero.hasThorns && hero.dmgReduct > 0 && netDmg > 0) {
      const mitigated = Math.max(0, mDmg - netDmg);
      const thornsDmg = Math.floor(mitigated * 0.25);
      if (thornsDmg > 0) {
        monsterHp = Math.max(0, monsterHp - thornsDmg);
        log.push({
          actor: 'player', type: 'thorns',
          value: thornsDmg,
          message: `Barbed Carapace reflects ${thornsDmg} damage!`,
        });
      }
    }

    playerHp -= netDmg;

    if (netDmg > 0) {
      log.push({
        actor: 'monster', type: 'attack', value: netDmg,
        message: `${monster.name} hits you for ${netDmg} damage.`,
      });
    }

    // ── Undying (Skill Tree: Keystone) ──────────────────────────
    //
    // Triggers ONCE per combat when the player would die.
    // Sets HP to 1 instead of 0. This is the "last stand" mechanic.
    //
    // The ! (logical NOT) operator inverts a boolean:
    //   !false → true, !true → false, !undefined → true
    //
    // playerStatuses.undying_triggered starts as undefined (falsy).
    //   !undefined → true → condition passes → Undying triggers
    //   Then we set it to true.
    //   Next time: !true → false → condition fails → no second trigger
    if (playerHp <= 0 && hero.hasUndying && !playerStatuses.undying_triggered) {
      playerHp = 1;
      playerStatuses.undying_triggered = true;
      log.push({
        actor: 'player', type: 'buff',
        message: `Your Undying will prevents you from falling!`,
      });
    }
  }

  // ── 5. EVALUATE PLAYER DEATH ──────────────────────────────────
  if (playerHp <= 0) {
    playerHp = 0;
    return endCombat(combatSession, playerHp, monsterHp, playerStatuses, monsterStatuses, log, 'DEFEAT', hero);
  }

  // ── 6. Check monster death from thorns ────────────────────────
  if (monsterHp <= 0) {
    return endCombat(combatSession, playerHp, 0, playerStatuses, monsterStatuses, log, 'VICTORY', hero);
  }

  // ── COMBAT CONTINUES ──────────────────────────────────────────
  //
  // Return the new state for the calling route to persist.
  // The engine doesn't write to the DB — it just returns data.
  return {
    isOver: false,
    result: null,
    log,
    newSessionState: {
      player_hp: playerHp,
      monster_hp: monsterHp,
      turn_count: combatSession.turn_count + 1,
      player_statuses: playerStatuses,
      monster_statuses: monsterStatuses,
    },
  };
}


/**
 * Build the final combat result object.
 *
 * @param {Object} combatSession — Original session data
 * @param {number} playerHp — Final player HP
 * @param {number} monsterHp — Final monster HP
 * @param {Object} playerStatuses — Player status effects
 * @param {Object} monsterStatuses — Monster status effects
 * @param {Array} log — Combat log entries
 * @param {string} result — 'VICTORY' | 'DEFEAT' | 'FLED'
 * @param {Object} hero — Hero stats (for killHeal on victory)
 */
function endCombat(combatSession, playerHp, monsterHp, playerStatuses, monsterStatuses, log, result, hero) {
  // ── Kill Heal (Skill Tree: Executioner) ─────────────────────
  //
  // hero.killHeal is a numeric value (default 0).
  // At rank 1: killHeal = 20 → heal 20 HP on killing blow.
  //
  // Only triggers on VICTORY (the player killed the monster).
  // Math.min caps at maxHp to prevent overhealing.
  if (result === 'VICTORY' && hero && hero.killHeal && hero.killHeal > 0) {
    const healAmt = hero.killHeal;
    playerHp = Math.min(hero.maxHp, playerHp + healAmt);
    log.push({
      actor: 'player', type: 'heal', source: 'executioner',
      value: healAmt,
      message: `Executioner's instinct restores ${healAmt} HP!`,
    });
  }

  return {
    isOver: true,
    result,
    log,
    newSessionState: {
      player_hp: playerHp,
      monster_hp: monsterHp,
      turn_count: combatSession.turn_count + 1,
      player_statuses: playerStatuses,
      monster_statuses: monsterStatuses,
    },
  };
}
