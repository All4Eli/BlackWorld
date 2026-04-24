import { Composite, sql } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { flag } = await request.json();

        const { data: composite, error: fetchError } = await Composite.getFullPlayer(userId);
        if (fetchError || !composite) throw new Error('Player not found.');

        // Upsert into pvp_stats to update is_active flag
        const { error: upsertError } = await sql(
            `INSERT INTO pvp_stats (player_id, is_active) 
             VALUES ($1, $2)
             ON CONFLICT (player_id) DO UPDATE SET is_active = EXCLUDED.is_active`,
            [userId, flag]
        );

        if (upsertError) throw upsertError;

        // Rebuild legacy frontend payload
        const updatedHero = {
            ...(composite.stats?.hero_data || {}),
            coven_id: composite.coven?.id,
            coven_name: composite.coven?.name,
            coven_tag: composite.coven?.tag,
            coven_role: composite.coven?.role,
            bankedGold: composite.stats?.bank_balance,
            pvp_flag: flag
        };

        return NextResponse.json({ success: true, flag, updatedHero });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

