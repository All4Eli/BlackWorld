// ═══════════════════════════════════════════════════════════════════
// POST /api/player/sync-timers — Tick essence regen, level-ups, dailies
// ═══════════════════════════════════════════════════════════════════
//
// NORMALIZED: No hero_data JSONB read or spread. Returns partial
// updatedHero with only the fields that changed.
//
// DATA FLOW (DB → API → UI):
//   DB columns:  essence, max_essence, essence_regen_at, xp, level,
//                unspent_points, skill_points_unspent, daily_quests
//   API returns: { essence, maxEssence, level, xp, unspentPoints,
//                  skillPointsUnspent, dailyQuests }
//   UI merges:   updateHero(data.updatedHero) → shallow merge
// ═══════════════════════════════════════════════════════════════════

import { HeroStats } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { calculateEssence, getDailyQuests, calculateXPRequirement } from '@/lib/gameData';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: stats, error: playerError } = await HeroStats.get(userId);
        if (playerError || !stats) throw new Error('Player stats not found.');

        let modified = false;
        const updates = {};

        let newEssence = stats.essence;
        let newRegenAt = stats.essence_regen_at;

        // ── 1. Sync Essence Regeneration ───────────────────────────
        const { essence, newTimestamp } = calculateEssence(
            stats.essence_regen_at ? new Date(stats.essence_regen_at).toISOString() : new Date().toISOString(),
            stats.essence ?? 100,
            stats.max_essence ?? 100
        );

        if (essence !== (stats.essence ?? 100)) {
            newEssence = essence;
            newRegenAt = newTimestamp;
            updates.essence = essence;
            updates.essence_regen_at = newTimestamp;
            modified = true;
        }

        // ── 2. Sync Daily Quests ───────────────────────────────────
        const today = new Date().toISOString().split('T')[0];
        const existingQuests = stats.daily_quests || [];
        let newQuests = existingQuests;
        if (!existingQuests.length || !existingQuests[0]?.id?.includes(today)) {
            newQuests = getDailyQuests();
            updates.daily_quests = newQuests;
            modified = true;
        }

        // ── 3. Retroactive Level-Up Loop ───────────────────────────
        //
        // If the player accumulated enough XP across multiple kills
        // without triggering a level-up (e.g., offline or batch combat),
        // this loop processes all pending level-ups atomically.
        let currentXp = stats.xp || 0;
        let currentLevel = stats.level || 1;
        let unspentPoints = stats.unspent_points || 0;
        let skillPointsUnspent = stats.skill_points_unspent || 0;

        let requiredXp = calculateXPRequirement(currentLevel);

        if (currentXp >= requiredXp) {
             while (currentXp >= requiredXp) {
                  currentXp -= requiredXp;
                  currentLevel += 1;
                  unspentPoints += 3;       // +3 attribute points per level
                  skillPointsUnspent += 1;  // +1 skill point per level
                  requiredXp = calculateXPRequirement(currentLevel);
             }
             updates.xp = currentXp;
             updates.level = currentLevel;
             updates.unspent_points = unspentPoints;
             updates.skill_points_unspent = skillPointsUnspent;
             // Recalculate derived stats (formula: 100 + vit*5 + level*5)
             updates.max_hp = 100 + ((stats.vit || 5) * 5) + (currentLevel * 5);
             updates.max_mana = 50 + ((stats.int || 5) * 3);
             modified = true;
        }

        // ── Persist any changes to normalized columns ──────────────
        if (modified) {
            const { error: updateError } = await HeroStats.update(userId, updates);
            if (updateError) throw updateError;
        }

        // ── Return ONLY the changed fields for shallow merge ───────
        //
        // The frontend calls: updateHero(data.updatedHero)
        // which does:          { ...prevHero, ...data.updatedHero }
        //
        // FIELD NAMING CONVENTION:
        //   DB column:        essence_regen_at   (snake_case)
        //   usePlayerData:    essenceRegenAt     (camelCase, used in hydration)
        //   hero context:     essence_last_regen (legacy name kept for compatibility)
        //
        const updatedHero = {
            level: updates.level || stats.level,
            xp: updates.xp ?? stats.xp,
            essence: newEssence,
            maxEssence: stats.max_essence,
            maxHp: updates.max_hp ?? stats.max_hp,
            maxMana: updates.max_mana ?? stats.max_mana,
            essence_last_regen: newRegenAt,
            unspentPoints: updates.unspent_points ?? stats.unspent_points,
            skillPointsUnspent: updates.skill_points_unspent ?? stats.skill_points_unspent,
        };

        return NextResponse.json({
            success: true,
            updatedHero,
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
