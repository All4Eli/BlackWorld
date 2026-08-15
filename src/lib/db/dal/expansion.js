// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — Expansion Features Data Access Layer (DAL)
// ═══════════════════════════════════════════════════════════════════
// Covers Resource Regeneration, Dungeon (Jail) status, Crimes,
// Gym, Education, Player Bazaar, and Stock Market.
// ═══════════════════════════════════════════════════════════════════

import { sql, sqlOne, transaction } from '../pool.js';
import * as InventoryDal from './inventory.js';

// ─────────────────────────────────────────────────────────────────
// 1. RESOURCE REGENERATION & JAIL HELPER
// ─────────────────────────────────────────────────────────────────

/**
 * Checks if hero is currently in jail.
 * @param {Object} hero - Hero record containing jail_until and jail_reason
 * @returns {{ in_jail: boolean, jail_until: string|null, jail_reason: string|null, remaining_seconds: number }}
 */
export function checkJailStatus(hero) {
  if (!hero || !hero.jail_until) {
    return { in_jail: false, jail_until: null, jail_reason: null, remaining_seconds: 0 };
  }
  const jailDate = new Date(hero.jail_until);
  const now = new Date();
  if (jailDate > now) {
    const remaining_seconds = Math.ceil((jailDate.getTime() - now.getTime()) / 1000);
    return {
      in_jail: true,
      jail_until: new Date(hero.jail_until).toISOString(),
      jail_reason: hero.jail_reason || 'In Dungeon',
      remaining_seconds
    };
  }
  return { in_jail: false, jail_until: null, jail_reason: null, remaining_seconds: 0 };
}

/**
 * Lazy regeneration for nerve (+1 per 5 min) and energy (+5 per 15 min).
 * Updates hero_stats nerve, energy, last_nerve_tick, last_energy_tick if ticks elapsed.
 * @param {string} playerId
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export async function tickPlayerResources(playerId) {
  const { data: hero, error } = await sqlOne(
    `SELECT player_id, nerve, max_nerve, last_nerve_tick,
            energy, max_energy, last_energy_tick,
            jail_until, jail_reason, str, def, spd, dex, gold, xp, level
     FROM hero_stats WHERE player_id = $1`,
    [playerId]
  );
  if (error || !hero) return { data: hero, error };

  const now = new Date();
  let updated = false;

  let nerve = hero.nerve ?? 10;
  let max_nerve = hero.max_nerve ?? 10;
  let last_nerve_tick = hero.last_nerve_tick ? new Date(hero.last_nerve_tick) : now;

  let energy = hero.energy ?? 100;
  let max_energy = hero.max_energy ?? 100;
  let last_energy_tick = hero.last_energy_tick ? new Date(hero.last_energy_tick) : now;

  // Nerve tick: +1 per 5 minutes (300,000 ms) up to max_nerve
  const NERVE_INTERVAL_MS = 5 * 60 * 1000;
  if (nerve < max_nerve) {
    const elapsedMs = now.getTime() - last_nerve_tick.getTime();
    if (elapsedMs >= NERVE_INTERVAL_MS) {
      const ticks = Math.floor(elapsedMs / NERVE_INTERVAL_MS);
      if (ticks > 0) {
        nerve = Math.min(max_nerve, nerve + ticks * 1);
        if (nerve >= max_nerve) {
          last_nerve_tick = now;
        } else {
          last_nerve_tick = new Date(last_nerve_tick.getTime() + ticks * NERVE_INTERVAL_MS);
        }
        updated = true;
      }
    }
  } else {
    last_nerve_tick = now;
  }

  // Energy tick: +5 per 15 minutes (900,000 ms) up to max_energy
  const ENERGY_INTERVAL_MS = 15 * 60 * 1000;
  if (energy < max_energy) {
    const elapsedMs = now.getTime() - last_energy_tick.getTime();
    if (elapsedMs >= ENERGY_INTERVAL_MS) {
      const ticks = Math.floor(elapsedMs / ENERGY_INTERVAL_MS);
      if (ticks > 0) {
        energy = Math.min(max_energy, energy + ticks * 5);
        if (energy >= max_energy) {
          last_energy_tick = now;
        } else {
          last_energy_tick = new Date(last_energy_tick.getTime() + ticks * ENERGY_INTERVAL_MS);
        }
        updated = true;
      }
    }
  } else {
    last_energy_tick = now;
  }

  if (updated) {
    const { data: refreshed, error: updateErr } = await sqlOne(
      `UPDATE hero_stats SET
         nerve = $2,
         last_nerve_tick = $3,
         energy = $4,
         last_energy_tick = $5,
         updated_at = NOW()
       WHERE player_id = $1
       RETURNING *`,
      [playerId, nerve, last_nerve_tick.toISOString(), energy, last_energy_tick.toISOString()]
    );
    if (updateErr) return { data: null, error: updateErr };
    return { data: refreshed, error: null };
  }

  return { data: hero, error: null };
}


// ─────────────────────────────────────────────────────────────────
// 2. CRIMES API DAL
// ─────────────────────────────────────────────────────────────────

export async function getCrimes() {
  return sql(`SELECT * FROM crimes ORDER BY min_level, nerve_cost`);
}

export async function getCrimeById(crimeId) {
  return sqlOne(`SELECT * FROM crimes WHERE id = $1`, [crimeId]);
}

export async function commitCrime(playerId, crimeId) {
  // 1. Tick resources to get fresh nerve and state
  const { data: hero, error: heroErr } = await tickPlayerResources(playerId);
  if (heroErr || !hero) return { data: null, error: heroErr || new Error('Hero not found') };

  // 2. Check jail
  const jailStatus = checkJailStatus(hero);
  if (jailStatus.in_jail) {
    return {
      data: null,
      error: { code: 'IN_DUNGEON', message: 'You are currently in the Dungeon (Jail)!', jail_until: jailStatus.jail_until, jail_reason: jailStatus.jail_reason, remaining_seconds: jailStatus.remaining_seconds },
      status: 403
    };
  }

  // 3. Fetch crime
  const { data: crime, error: crimeErr } = await getCrimeById(crimeId);
  if (crimeErr || !crime) {
    return { data: null, error: new Error('Crime not found'), status: 404 };
  }

  // 4. Validate nerve
  const nerveCost = Number(crime.nerve_cost);
  if ((hero.nerve ?? 0) < nerveCost) {
    return { data: null, error: new Error('Insufficient Nerve'), status: 400 };
  }

  // 5. Roll success vs success_rate
  const successRate = Number(crime.success_rate);
  const roll = Math.random();
  const isSuccess = roll <= successRate;

  const newNerve = hero.nerve - nerveCost;

  if (isSuccess) {
    const minGold = Number(crime.gold_reward_min);
    const maxGold = Number(crime.gold_reward_max);
    const xpReward = Number(crime.xp_reward);
    const goldReward = Math.floor(Math.random() * (maxGold - minGold + 1)) + minGold;

    // Update hero stats & log
    await sql(
      `UPDATE hero_stats SET
         nerve = $2,
         gold = gold + $3,
         xp = xp + $4,
         updated_at = NOW()
       WHERE player_id = $1`,
      [playerId, newNerve, goldReward, xpReward]
    );

    await sql(
      `INSERT INTO crime_logs (player_id, crime_id, success, xp_gained, gold_gained, jail_seconds)
       VALUES ($1, $2, true, $3, $4, 0)`,
      [playerId, crimeId, xpReward, goldReward]
    );

    return {
      data: {
        success: true,
        xp_gained: xpReward,
        gold_gained: goldReward,
        nerve_remaining: newNerve
      },
      error: null
    };
  } else {
    const jailTimeSec = Number(crime.jail_time_seconds);
    const jailUntil = new Date(Date.now() + jailTimeSec * 1000).toISOString();

    await sql(
      `UPDATE hero_stats SET
         nerve = $2,
         jail_until = $3,
         jail_reason = $4,
         updated_at = NOW()
       WHERE player_id = $1`,
      [playerId, newNerve, jailUntil, crime.name]
    );

    await sql(
      `INSERT INTO crime_logs (player_id, crime_id, success, xp_gained, gold_gained, jail_seconds)
       VALUES ($1, $2, false, 0, 0, $3)`,
      [playerId, crimeId, jailTimeSec]
    );

    return {
      data: {
        success: false,
        in_jail: true,
        jail_until: jailUntil,
        jail_seconds: jailTimeSec,
        message: `Failed to commit ${crime.name}! You were captured and sentenced to ${jailTimeSec} seconds in the Dungeon.`
      },
      error: null
    };
  }
}


// ─────────────────────────────────────────────────────────────────
// 3. GYM API DAL
// ─────────────────────────────────────────────────────────────────

export async function getGymTrainings() {
  return sql(`SELECT * FROM gym_trainings ORDER BY name`);
}

export async function trainGym(playerId, { trainingId, statType }) {
  // 1. Tick resources
  const { data: hero, error: heroErr } = await tickPlayerResources(playerId);
  if (heroErr || !hero) return { data: null, error: heroErr || new Error('Hero not found') };

  // 2. Check jail
  const jailStatus = checkJailStatus(hero);
  if (jailStatus.in_jail) {
    return {
      data: null,
      error: { code: 'IN_DUNGEON', message: 'You are currently in the Dungeon (Jail)!', jail_until: jailStatus.jail_until, jail_reason: jailStatus.jail_reason, remaining_seconds: jailStatus.remaining_seconds },
      status: 403
    };
  }

  // 3. Resolve training option
  let training = null;
  if (trainingId) {
    const { data: found } = await sqlOne(`SELECT * FROM gym_trainings WHERE id = $1`, [trainingId]);
    training = found;
  } else if (statType) {
    const { data: found } = await sqlOne(`SELECT * FROM gym_trainings WHERE stat_type = $1 LIMIT 1`, [statType]);
    training = found;
  }

  const validStatTypes = ['str', 'def', 'spd', 'dex'];
  const targetStat = training ? training.stat_type : (validStatTypes.includes(statType) ? statType : 'str');
  const energyCost = training ? Number(training.energy_cost) : 10;
  const statGain = training ? Number(training.stat_gain) : 1;

  if ((hero.energy ?? 0) < energyCost) {
    return { data: null, error: new Error('Insufficient Energy'), status: 400 };
  }

  const newEnergy = hero.energy - energyCost;

  // Increment stat atomically
  const { data: updatedHero, error: updateErr } = await sqlOne(
    `UPDATE hero_stats SET
       energy = $2,
       "${targetStat}" = "${targetStat}" + $3,
       updated_at = NOW()
     WHERE player_id = $1
     RETURNING *`,
    [playerId, newEnergy, statGain]
  );

  if (updateErr) return { data: null, error: updateErr };

  return {
    data: {
      success: true,
      stat_type: targetStat,
      stat_gain: statGain,
      new_stat_val: updatedHero[targetStat],
      energy_remaining: newEnergy
    },
    error: null
  };
}


// ─────────────────────────────────────────────────────────────────
// 4. EDUCATION API DAL
// ─────────────────────────────────────────────────────────────────

export async function getEducationCourses() {
  return sql(`SELECT * FROM education_courses ORDER BY duration_seconds`);
}

export async function getPlayerEducation(playerId) {
  return sql(
    `SELECT pe.*, ec.title, ec.description, ec.duration_seconds, ec.cost_gold,
            ec.stat_boost_type, ec.stat_boost_val, ec.perk_code
     FROM player_education pe
     JOIN education_courses ec ON pe.course_id = ec.id
     WHERE pe.player_id = $1
     ORDER BY pe.started_at DESC`,
    [playerId]
  );
}

export async function enrollCourse(playerId, courseId) {
  // Check jail status first
  const { data: hero } = await sqlOne(`SELECT jail_until, jail_reason, gold FROM hero_stats WHERE player_id = $1`, [playerId]);
  const jailStatus = checkJailStatus(hero);
  if (jailStatus.in_jail) {
    return {
      data: null,
      error: { code: 'IN_DUNGEON', message: 'You are currently in the Dungeon (Jail)!', jail_until: jailStatus.jail_until, jail_reason: jailStatus.jail_reason, remaining_seconds: jailStatus.remaining_seconds },
      status: 403
    };
  }

  // Check active course
  const { data: active } = await sqlOne(
    `SELECT id FROM player_education WHERE player_id = $1 AND is_completed = false`,
    [playerId]
  );
  if (active) {
    return { data: null, error: new Error('You are already enrolled in an ongoing course.'), status: 400 };
  }

  // Fetch course
  const { data: course, error: cErr } = await sqlOne(`SELECT * FROM education_courses WHERE id = $1`, [courseId]);
  if (cErr || !course) {
    return { data: null, error: new Error('Education course not found.'), status: 404 };
  }

  const costGold = Number(course.cost_gold);
  if ((hero?.gold ?? 0) < costGold) {
    return { data: null, error: new Error('Insufficient gold to enroll in this course.'), status: 400 };
  }

  const durationSec = Number(course.duration_seconds);

  return transaction(async (client) => {
    // Deduct gold
    await client.query(`UPDATE hero_stats SET gold = gold - $2 WHERE player_id = $1`, [playerId, costGold]);

    // Insert education record
    const completesAt = new Date(Date.now() + durationSec * 1000).toISOString();
    const insRes = await client.query(
      `INSERT INTO player_education (player_id, course_id, started_at, completes_at, is_completed)
       VALUES ($1, $2, NOW(), $3, false)
       RETURNING *`,
      [playerId, courseId, completesAt]
    );

    return {
      success: true,
      enrollment: insRes.rows[0],
      completes_at: completesAt
    };
  });
}

export async function claimCourse(playerId, courseId) {
  // Query active course for player
  const { data: enrollment, error: eErr } = await sqlOne(
    `SELECT pe.*, ec.title, ec.stat_boost_type, ec.stat_boost_val, ec.perk_code
     FROM player_education pe
     JOIN education_courses ec ON pe.course_id = ec.id
     WHERE pe.player_id = $1 AND pe.course_id = $2 AND pe.is_completed = false`,
    [playerId, courseId]
  );

  if (eErr || !enrollment) {
    return { data: null, error: new Error('No ongoing course found to claim.'), status: 404 };
  }

  const now = new Date();
  const completesAt = new Date(enrollment.completes_at);

  if (now < completesAt) {
    return { data: null, error: new Error('Course is not completed yet.'), status: 400 };
  }

  return transaction(async (client) => {
    // Mark as completed
    await client.query(
      `UPDATE player_education SET is_completed = true, claimed_at = NOW() WHERE id = $1`,
      [enrollment.id]
    );

    // Apply stat boost / perk to hero_stats if applicable
    const boostType = enrollment.stat_boost_type;
    const boostVal = Number(enrollment.stat_boost_val || 0);

    const validBoostColumns = ['str', 'def', 'spd', 'dex', 'max_energy', 'max_nerve'];
    if (boostType && validBoostColumns.includes(boostType) && boostVal > 0) {
      await client.query(
        `UPDATE hero_stats SET "${boostType}" = "${boostType}" + $2 WHERE player_id = $1`,
        [playerId, boostVal]
      );
    }

    return {
      success: true,
      perk_unlocked: enrollment.perk_code,
      stat_boost: {
        type: boostType,
        val: boostVal
      }
    };
  });
}


// ─────────────────────────────────────────────────────────────────
// 5. PLAYER BAZAAR API DAL
// ─────────────────────────────────────────────────────────────────

export async function getBazaarListings() {
  return sql(
    `SELECT pb.*, p.username AS seller_username,
            i.name AS item_name, i.type AS item_type, i.tier AS item_tier, i.icon AS item_icon
     FROM player_bazaar pb
     JOIN players p ON pb.seller_id = p.clerk_user_id
     JOIN items i ON pb.item_id = i.id
     WHERE pb.quantity > 0
     ORDER BY pb.created_at DESC`
  );
}

export async function getPlayerBazaarListings(sellerId) {
  return sql(
    `SELECT pb.*, i.name AS item_name, i.type AS item_type, i.tier AS item_tier, i.icon AS item_icon
     FROM player_bazaar pb
     JOIN items i ON pb.item_id = i.id
     WHERE pb.seller_id = $1 AND pb.quantity > 0
     ORDER BY pb.created_at DESC`,
    [sellerId]
  );
}

export async function listItemBazaar(sellerId, inventoryId, price, quantity = 1) {
  const { data: hero } = await sqlOne(`SELECT jail_until, jail_reason FROM hero_stats WHERE player_id = $1`, [sellerId]);
  const jailStatus = checkJailStatus(hero);
  if (jailStatus.in_jail) {
    return {
      data: null,
      error: { code: 'IN_DUNGEON', message: 'You are currently in the Dungeon (Jail)!', jail_until: jailStatus.jail_until, jail_reason: jailStatus.jail_reason, remaining_seconds: jailStatus.remaining_seconds },
      status: 403
    };
  }

  if (price < 0 || quantity <= 0) {
    return { data: null, error: new Error('Invalid price or quantity'), status: 400 };
  }

  return transaction(async (client) => {
    // 1. Fetch inventory item FOR UPDATE
    const { rows: invRows } = await client.query(
      `SELECT * FROM inventory WHERE id = $1 AND player_id = $2 FOR UPDATE`,
      [inventoryId, sellerId]
    );
    if (invRows.length === 0) {
      throw new Error('Inventory item not found');
    }
    const invItem = invRows[0];
    if (invItem.quantity < quantity) {
      throw new Error(`Insufficient inventory quantity (have ${invItem.quantity}, want ${quantity})`);
    }

    // 2. Reduce inventory quantity (keep row for FK reference)
    await client.query(`UPDATE inventory SET quantity = quantity - $2 WHERE id = $1`, [inventoryId, quantity]);

    // 3. Create bazaar listing
    const { rows: listRows } = await client.query(
      `INSERT INTO player_bazaar (seller_id, inventory_id, item_id, price, quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sellerId, inventoryId, invItem.item_id, price, quantity]
    );

    return {
      success: true,
      listing: listRows[0]
    };
  });
}

export async function buyItemBazaar(buyerId, listingId, buyQuantity = 1) {
  const { data: hero } = await sqlOne(`SELECT jail_until, jail_reason FROM hero_stats WHERE player_id = $1`, [buyerId]);
  const jailStatus = checkJailStatus(hero);
  if (jailStatus.in_jail) {
    return {
      data: null,
      error: { code: 'IN_DUNGEON', message: 'You are currently in the Dungeon (Jail)!', jail_until: jailStatus.jail_until, jail_reason: jailStatus.jail_reason, remaining_seconds: jailStatus.remaining_seconds },
      status: 403
    };
  }

  return transaction(async (client) => {
    // 1. Lock listing
    const { rows: listRows } = await client.query(
      `SELECT pb.*, i.key as item_key FROM player_bazaar pb
       JOIN items i ON pb.item_id = i.id
       WHERE pb.id = $1 FOR UPDATE`,
      [listingId]
    );
    if (listRows.length === 0) {
      throw new Error('Listing not found');
    }
    const listing = listRows[0];

    if (listing.seller_id === buyerId) {
      throw new Error('You cannot buy your own bazaar listing');
    }

    const availableQty = listing.quantity;
    const qtyToBuy = Math.min(buyQuantity, availableQty);
    if (qtyToBuy <= 0) {
      throw new Error('Listing is sold out');
    }

    const totalCost = Number(listing.price) * qtyToBuy;

    // 2. Lock buyer gold
    const { rows: buyerRows } = await client.query(
      `SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`,
      [buyerId]
    );
    if (buyerRows.length === 0) throw new Error('Buyer hero not found');
    if (buyerRows[0].gold < totalCost) {
      throw new Error(`Insufficient gold to buy listing (requires ${totalCost} gold)`);
    }

    // 3. Transfer gold (buyer -> seller)
    await client.query(`UPDATE hero_stats SET gold = gold - $2 WHERE player_id = $1`, [buyerId, totalCost]);
    await client.query(`UPDATE hero_stats SET gold = gold + $2 WHERE player_id = $1`, [listing.seller_id, totalCost]);

    // 4. Update or delete bazaar listing
    if (listing.quantity === qtyToBuy) {
      await client.query(`DELETE FROM player_bazaar WHERE id = $1`, [listingId]);
    } else {
      await client.query(`UPDATE player_bazaar SET quantity = quantity - $2 WHERE id = $1`, [listingId, qtyToBuy]);
    }

    // 5. Transfer item to buyer's inventory using client directly
    const { rows: itemRows } = await client.query(`SELECT id, is_stackable, max_stack FROM items WHERE id = $1`, [listing.item_id]);
    if (itemRows.length > 0) {
      const item = itemRows[0];
      if (item.is_stackable) {
        const { rows: existing } = await client.query(
          `SELECT id, quantity FROM inventory WHERE player_id = $1 AND item_id = $2 FOR UPDATE`,
          [buyerId, item.id]
        );
        if (existing.length > 0) {
          const newQty = Math.min(existing[0].quantity + qtyToBuy, item.max_stack || 99);
          await client.query(`UPDATE inventory SET quantity = $1 WHERE id = $2`, [newQty, existing[0].id]);
        } else {
          await client.query(`INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, $3)`, [buyerId, item.id, qtyToBuy]);
        }
      } else {
        await client.query(`INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, $3)`, [buyerId, item.id, qtyToBuy]);
      }
    }

    return {
      success: true,
      listing_id: listingId,
      quantity_bought: qtyToBuy,
      total_cost: totalCost
    };
  });
}

export async function removeListingBazaar(sellerId, listingId) {
  const { data: hero } = await sqlOne(`SELECT jail_until, jail_reason FROM hero_stats WHERE player_id = $1`, [sellerId]);
  const jailStatus = checkJailStatus(hero);
  if (jailStatus.in_jail) {
    return {
      data: null,
      error: { code: 'IN_DUNGEON', message: 'You are currently in the Dungeon (Jail)!', jail_until: jailStatus.jail_until, jail_reason: jailStatus.jail_reason, remaining_seconds: jailStatus.remaining_seconds },
      status: 403
    };
  }

  return transaction(async (client) => {
    const { rows: listRows } = await client.query(
      `SELECT pb.*, i.key as item_key FROM player_bazaar pb
       JOIN items i ON pb.item_id = i.id
       WHERE pb.id = $1 AND pb.seller_id = $2 FOR UPDATE`,
      [listingId, sellerId]
    );
    if (listRows.length === 0) {
      throw new Error('Listing not found or unauthorized');
    }
    const listing = listRows[0];

    // Delete listing
    await client.query(`DELETE FROM player_bazaar WHERE id = $1`, [listingId]);

    // Return item to seller inventory
    const { rows: itemRows } = await client.query(`SELECT id, is_stackable, max_stack FROM items WHERE id = $1`, [listing.item_id]);
    if (itemRows.length > 0) {
      const item = itemRows[0];
      if (item.is_stackable) {
        const { rows: existing } = await client.query(
          `SELECT id, quantity FROM inventory WHERE player_id = $1 AND item_id = $2 FOR UPDATE`,
          [sellerId, item.id]
        );
        if (existing.length > 0) {
          const newQty = Math.min(existing[0].quantity + listing.quantity, item.max_stack || 99);
          await client.query(`UPDATE inventory SET quantity = $1 WHERE id = $2`, [newQty, existing[0].id]);
        } else {
          await client.query(`INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, $3)`, [sellerId, item.id, listing.quantity]);
        }
      } else {
        await client.query(`INSERT INTO inventory (player_id, item_id, quantity) VALUES ($1, $2, $3)`, [sellerId, item.id, listing.quantity]);
      }
    }

    return {
      success: true,
      listing_id: listingId,
      quantity_returned: listing.quantity
    };
  });
}


// ─────────────────────────────────────────────────────────────────
// 6. STOCK MARKET API DAL
// ─────────────────────────────────────────────────────────────────

export async function getStocks() {
  return sql(`SELECT * FROM stocks ORDER BY symbol`);
}

export async function getPlayerInvestments(playerId) {
  return sql(
    `SELECT pi.*, s.symbol, s.name, s.share_price, s.dividend_rate_per_hour, s.description
     FROM player_investments pi
     JOIN stocks s ON pi.stock_id = s.id
     WHERE pi.player_id = $1`,
    [playerId]
  );
}

export async function buyStock(playerId, stockId, shares = 1) {
  if (shares <= 0) return { data: null, error: new Error('Shares must be positive'), status: 400 };

  const { data: stock, error: sErr } = await sqlOne(`SELECT * FROM stocks WHERE id = $1`, [stockId]);
  if (sErr || !stock) return { data: null, error: new Error('Stock not found'), status: 404 };

  const totalCost = Number(stock.share_price) * shares;

  return transaction(async (client) => {
    const { rows: heroRows } = await client.query(`SELECT gold FROM hero_stats WHERE player_id = $1 FOR UPDATE`, [playerId]);
    if (heroRows.length === 0) throw new Error('Hero not found');
    if (heroRows[0].gold < totalCost) {
      throw new Error(`Insufficient gold: need ${totalCost}, have ${heroRows[0].gold}`);
    }

    // Deduct gold
    await client.query(`UPDATE hero_stats SET gold = gold - $2 WHERE player_id = $1`, [playerId, totalCost]);

    // Check existing investment
    const { rows: invRows } = await client.query(
      `SELECT * FROM player_investments WHERE player_id = $1 AND stock_id = $2 FOR UPDATE`,
      [playerId, stockId]
    );

    let updatedInv;
    if (invRows.length > 0) {
      const { rows } = await client.query(
        `UPDATE player_investments SET shares_owned = shares_owned + $2 WHERE id = $1 RETURNING *`,
        [invRows[0].id, shares]
      );
      updatedInv = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO player_investments (player_id, stock_id, shares_owned, last_dividend_claim)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [playerId, stockId, shares]
      );
      updatedInv = rows[0];
    }

    return {
      success: true,
      stock_symbol: stock.symbol,
      shares_bought: shares,
      total_cost: totalCost,
      investment: updatedInv
    };
  });
}

export async function sellStock(playerId, stockId, shares = 1) {
  if (shares <= 0) return { data: null, error: new Error('Shares must be positive'), status: 400 };

  const { data: stock, error: sErr } = await sqlOne(`SELECT * FROM stocks WHERE id = $1`, [stockId]);
  if (sErr || !stock) return { data: null, error: new Error('Stock not found'), status: 404 };

  return transaction(async (client) => {
    const { rows: invRows } = await client.query(
      `SELECT * FROM player_investments WHERE player_id = $1 AND stock_id = $2 FOR UPDATE`,
      [playerId, stockId]
    );
    if (invRows.length === 0) throw new Error('No investments found for this stock');
    const investment = invRows[0];

    if (investment.shares_owned < shares) {
      throw new Error(`Insufficient shares owned (have ${investment.shares_owned}, want to sell ${shares})`);
    }

    const revenue = Number(stock.share_price) * shares;

    // Add gold
    await client.query(`UPDATE hero_stats SET gold = gold + $2 WHERE player_id = $1`, [playerId, revenue]);

    // Update investment
    let updatedInv;
    if (investment.shares_owned === shares) {
      await client.query(`DELETE FROM player_investments WHERE id = $1`, [investment.id]);
      updatedInv = null;
    } else {
      const { rows } = await client.query(
        `UPDATE player_investments SET shares_owned = shares_owned - $2 WHERE id = $1 RETURNING *`,
        [investment.id, shares]
      );
      updatedInv = rows[0];
    }

    return {
      success: true,
      stock_symbol: stock.symbol,
      shares_sold: shares,
      revenue,
      investment: updatedInv
    };
  });
}

export async function claimDividends(playerId) {
  return transaction(async (client) => {
    const { rows: invs } = await client.query(
      `SELECT pi.*, s.dividend_rate_per_hour, s.symbol
       FROM player_investments pi
       JOIN stocks s ON pi.stock_id = s.id
       WHERE pi.player_id = $1 FOR UPDATE`,
      [playerId]
    );

    let totalDividends = 0;
    const now = new Date();
    const updatedInvestments = [];

    for (const inv of invs) {
      const lastClaim = inv.last_dividend_claim ? new Date(inv.last_dividend_claim) : new Date(inv.created_at || now);
      const hoursElapsed = Math.floor((now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60));

      if (hoursElapsed > 0) {
        const payout = inv.shares_owned * Number(inv.dividend_rate_per_hour) * hoursElapsed;
        totalDividends += payout;

        // Advance last_dividend_claim by hoursElapsed hours
        const newClaimTime = new Date(lastClaim.getTime() + hoursElapsed * 60 * 60 * 1000).toISOString();
        const { rows } = await client.query(
          `UPDATE player_investments SET last_dividend_claim = $2 WHERE id = $1 RETURNING *`,
          [inv.id, newClaimTime]
        );
        updatedInvestments.push({ symbol: inv.symbol, payout, hoursElapsed, record: rows[0] });
      }
    }

    if (totalDividends > 0) {
      await client.query(`UPDATE hero_stats SET gold = gold + $2 WHERE player_id = $1`, [playerId, totalDividends]);
    }

    return {
      success: true,
      total_dividends_claimed: totalDividends,
      investments_claimed: updatedInvestments
    };
  });
}
