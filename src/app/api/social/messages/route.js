import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'inbox'; // 'inbox' or 'outbox'

  try {
      if (type === 'inbox') {
          // Fetch messages where this user is the receiver, join to get sender's username
          // Note: To join on players table without explicit full foreign keys in Supabase sometimes requires raw manual matching, 
          // but for now, we just select raw and we map usernames to it if needed, or rely on frontend to fetch them.
          const { data, error } = await supabase
            .from('messages')
            .select(`*`)
            .eq('receiver_id', userId)
            .order('created_at', { ascending: false });
            
          if (error) throw error;

          // To make it pretty, we fetch all relevant sender usernames
          const senderIds = [...new Set(data.map(m => m.sender_id))];
          if (senderIds.length > 0) {
              const { data: players } = await supabase.from('players').select('clerk_user_id, username').in('clerk_user_id', senderIds);
              data.forEach(m => {
                  const p = players?.find(x => x.clerk_user_id === m.sender_id);
                  m.sender_name = p ? p.username : 'Unknown';
              });
          }

          return NextResponse.json({ messages: data });
      } else {
          const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('sender_id', userId)
            .order('created_at', { ascending: false });

          if (error) throw error;
          
          const receiverIds = [...new Set(data.map(m => m.receiver_id))];
          if (receiverIds.length > 0) {
              const { data: players } = await supabase.from('players').select('clerk_user_id, username').in('clerk_user_id', receiverIds);
              data.forEach(m => {
                  const p = players?.find(x => x.clerk_user_id === m.receiver_id);
                  m.receiver_name = p ? p.username : 'Unknown';
              });
          }

          return NextResponse.json({ messages: data });
      }
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { receiver_id, subject, content } = body;

        const { data, error } = await supabase
          .from('messages')
          .insert({
              sender_id: userId,
              receiver_id,
              subject,
              content
          })
          .select()
          .single();

        if (error) throw error;

        // Optionally, create a notification for the receiver
        await supabase.from('notifications').insert({
            user_id: receiver_id,
            type: 'MAIL',
            message: `You have new mail: ${subject}`
        });

        return NextResponse.json({ message: data });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
