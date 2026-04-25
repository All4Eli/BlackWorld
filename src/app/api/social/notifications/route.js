import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/pool';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { data, error } = await sql(
        `SELECT id, type, message, is_read, metadata, created_at
         FROM notifications
         WHERE player_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      );
      if (error) throw error;
      return NextResponse.json({ notifications: data || [] });
  } catch(err) {
      console.error('[NOTIFICATIONS GET]', err.message);
      // Return empty array instead of 500 to prevent polling spam
      return NextResponse.json({ notifications: [] });
  }
}

export async function PATCH(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { notificationIds } = body;

        if (!notificationIds || notificationIds.length === 0) {
           await sql(
             `UPDATE notifications SET is_read = true WHERE player_id = $1 AND is_read = false`,
             [userId]
           );
           return NextResponse.json({ success: true });
        }

        for (const id of notificationIds) {
          await sql(
            `UPDATE notifications SET is_read = true WHERE id = $1 AND player_id = $2`,
            [id, userId]
          );
        }

        return NextResponse.json({ success: true });
    } catch(err) {
        console.error('[NOTIFICATIONS PATCH]', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        await sql(
          `DELETE FROM notifications WHERE player_id = $1 AND is_read = true`,
          [userId]
        );
        return NextResponse.json({ success: true, message: 'Cleared read notifications.' });
    } catch (err) {
        console.error('[NOTIFICATIONS DELETE]', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
