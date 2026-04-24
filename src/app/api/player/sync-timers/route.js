import { HeroStats, sqlOne } from '@/lib/dal';
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

        // 1. Sync Essence
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

        // 2. Sync Daily Quests
        const today = new Date().toISOString().split('T')[0];
        const existingQuests = stats.daily_quests || [];
        let newQuests = existingQuests;
        if (!existingQuests.length || !existingQuests[0]?.id?.includes(today)) {
            newQuests = getDailyQuests();
            updates.daily_quests = newQuests;
            modified = true;
        }

        // 3. Retroactive Level Loop
        let currentXp = stats.xp || 0;
        let currentLevel = stats.level || 1;
        let unspentPoints = stats.unspent_points || 0;
        let skillPointsUnspent = stats.skill_points_unspent || 0;
        
        let requiredXp = calculateXPRequirement(currentLevel);

        if (currentXp >= requiredXp) {
             while (currentXp >= requiredXp) {
                  currentXp -= requiredXp;
                  currentLevel += 1;
                  unspentPoints += 3;
                  skillPointsUnspent += 1;
                  requiredXp = calculateXPRequirement(currentLevel);
             }
             updates.xp = currentXp;
             updates.level = currentLevel;
             updates.unspent_points = unspentPoints;
             updates.skill_points_unspent = skillPointsUnspent;
             modified = true;
        }

        if (modified) {
            const { error: updateError } = await HeroStats.update(userId, updates);
            if (updateError) throw updateError;
        }

        // Reconstruct the legacy 'hero' object for frontend compatibility
        const legacyHeroData = stats.hero_data || {};
        const updatedHero = {
            ...legacyHeroData,
            level: updates.level || stats.level,
            xp: updates.xp ?? stats.xp,
            essence: newEssence,
            essence_last_regen: newRegenAt,
            daily_quests: newQuests,
            unspentStatPoints: updates.unspent_points ?? stats.unspent_points,
            skillPointsUnspent: updates.skill_points_unspent ?? stats.skill_points_unspent,
            max_essence: stats.max_essence
        };

        return NextResponse.json({
            success: true,
            updatedHero
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

