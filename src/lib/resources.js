// No supabase import needed for pure functions.

const RES_CONFIG = {
  vitae: { base: 100, regen: 300, max_stat: 'vit', per_stat: 2, per_lvl: 1, cost: 50 },
  resolve: { base: 50, regen: 600, max_stat: 'cun', per_stat: 1, per_lvl: 0.5, cost: 25 },
  essence: { base: 75, regen: 180, max_stat: 'int', per_stat: 1.5, per_lvl: 0.75, cost: 75 }
};

export const calculateMaxResource = (resourceType, hero) => {
  const cfg = RES_CONFIG[resourceType];
  const statVal = hero?.[cfg.max_stat] ?? 5;
  const lvl = hero?.level ?? 1;
  const equipBonus = hero?.equip_resource_bonus?.[resourceType] ?? 0;
  return Math.floor(cfg.base + (statVal * cfg.per_stat) + (lvl * cfg.per_lvl) + equipBonus);
};

export const calculateCurrentResource = (resourceRecord, resourceType, maxVal) => {
  if (!resourceRecord) return { current: 0, max: maxVal, next_tick: 0 };
  
  const current = resourceRecord[`${resourceType}_current`];
  if (current >= maxVal) return { current: maxVal, max: maxVal, next_tick: 0 };

  const lastUpdate = new Date(resourceRecord[`${resourceType}_last_update`]).getTime();
  const now = new Date().getTime();
  const elapsedSec = Math.floor((now - lastUpdate) / 1000);
  
  // Assuming multiplier applies to regen speed (divides regen wait time)
  // Or multiplies amount. Standard approach: multiplies amount per tick or reduces tick time.
  const mult = resourceRecord.bonus_regen_multiplier || 1.0;
  // If active, we consider elapsedSec artificially higher:
  const effElapsedSec = elapsedSec * mult;

  const cfg = RES_CONFIG[resourceType];
  const regenAmount = Math.floor(effElapsedSec / cfg.regen);
  const remainderSec = Math.floor((effElapsedSec % cfg.regen) / mult);

  const newCurrent = Math.min(maxVal, current + regenAmount);
  return { 
      current: newCurrent, 
      max: maxVal, 
      next_tick: newCurrent < maxVal ? cfg.regen - remainderSec : 0,
      regen_amount: regenAmount
  };
};

// Frontend consumptions helper
// It checks offline regen FIRST before deduction.
export const validateAndConsume = (hero, limits, requiredCost, resourceType) => {
    // Limits is the hero.resources object
    if (!limits) return { success: false, error: 'NO_RESOURCE_STATE' };
    
    const maxVal = calculateMaxResource(resourceType, hero);
    const { current } = calculateCurrentResource(limits, resourceType, maxVal);

    if (current < requiredCost) {
       return { 
           success: false, 
           error: 'INSUFFICIENT_RESOURCE',
           current,
           required: requiredCost,
           deficit: requiredCost - current,
           resource_type: resourceType,
           refillCost: RES_CONFIG[resourceType].cost
       };
    }

    return {
        success: true,
        new_current: current - requiredCost,
        resource_type: resourceType
    };
};
