import { supabase } from '@/lib/supabase';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (error) throw error;
      return NextResponse.json({ notifications: data });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { notificationIds } = body; // Array of IDs to mark as read

        if (!notificationIds || notificationIds.length === 0) {
           // Default to marking all as read for this user
           const { error } = await supabase
             .from('notifications')
             .update({ is_read: true })
             .eq('user_id', userId)
             .eq('is_read', false);
             
           if (error) throw error;
           return NextResponse.json({ success: true });
        }

        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .in('id', notificationIds)
          .eq('user_id', userId);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('user_id', userId)
            .eq('is_read', true);

        if (error) throw error;
        return NextResponse.json({ success: true, message: 'Cleared read notifications.' });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
