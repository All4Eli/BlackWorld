import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { sql, sqlOne } from '@/lib/db/pool';

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'inbox';

  try {
      if (type === 'inbox') {
          const { data, error } = await sql(
            `SELECT m.*, p.username as sender_name
             FROM messages m
             LEFT JOIN players p ON m.sender_id = p.clerk_user_id
             WHERE m.receiver_id = $1
             ORDER BY m.created_at DESC`,
            [userId]
          );
          if (error) throw error;
          return NextResponse.json({ messages: data || [] });
      } else {
          const { data, error } = await sql(
            `SELECT m.*, p.username as receiver_name
             FROM messages m
             LEFT JOIN players p ON m.receiver_id = p.clerk_user_id
             WHERE m.sender_id = $1
             ORDER BY m.created_at DESC`,
            [userId]
          );
          if (error) throw error;
          return NextResponse.json({ messages: data || [] });
      }
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { receiver_id, subject, content } = await request.json();

        const { data, error } = await sqlOne(
          `INSERT INTO messages (sender_id, receiver_id, subject, content)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [userId, receiver_id, subject, content]
        );
        if (error) throw error;

        // Create notification for receiver
        await sql(
          `INSERT INTO notifications (player_id, type, message) VALUES ($1, $2, $3)`,
          [receiver_id, 'MAIL', `You have new mail: ${subject}`]
        );

        return NextResponse.json({ message: data });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
