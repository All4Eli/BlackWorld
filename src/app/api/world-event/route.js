import { NextResponse } from 'next/server';
import { sqlOne } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await sqlOne(
          `SELECT id, key, title, description, event_type, bonus, starts_at, ends_at
           FROM world_events
           WHERE is_active = true
             AND starts_at <= NOW()
             AND ends_at >= NOW()
           ORDER BY starts_at DESC
           LIMIT 1`
        );

        if (error) throw error;

        return NextResponse.json({ event: data || null });
    } catch (err) {
        return NextResponse.json({ event: null });
    }
}
