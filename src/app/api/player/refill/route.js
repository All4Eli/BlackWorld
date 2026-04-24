import { HeroStats, Composite } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { type, cost } = await request.json();

        // Valid resource types to refill
        const validTypes = ['essence'];
        if (!validTypes.includes(type)) {
             return NextResponse.json({ error: 'Invalid resource type.' }, { status: 400 });
        }

        const { data: composite, error: playerError } = await Composite.getFullPlayer(userId);

        if (playerError || !composite || !composite.stats) throw new Error('Player not found');

        const stats = composite.stats;
        let heroData = stats.hero_data || {};
        const currentStones = heroData.blood_stones || 0;

        if (currentStones < cost) {
             return NextResponse.json({ error: 'Not enough Blood Stones. Visit Store.' }, { status: 400 });
        }

        // Deduct stones in the backward-compatible blob since we don't have a column yet
        heroData.blood_stones -= cost;

        const updates = {
            hero_data: heroData
        };

        if (type === 'essence') {
            updates.essence = stats.max_essence;
        }

        const { error: updateError } = await HeroStats.update(userId, updates);
        if (updateError) throw updateError;

        // Rebuild legacy hero payload
        const updatedHero = {
            ...heroData,
            str: stats.str,
            def: stats.def,
            dex: stats.dex,
            int: stats.int,
            vit: stats.vit,
            essence: updates.essence ?? stats.essence,
            max_essence: stats.max_essence,
            level: stats.level,
            xp: stats.xp,
            unspentStatPoints: stats.unspent_points
        };

        return NextResponse.json({ success: true, updatedHero });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

