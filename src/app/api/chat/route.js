import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('global_chat')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (error) throw error;
        
        return NextResponse.json({ messages: data.reverse() });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { message, channel = 'global' } = await request.json();

        if (!message || message.trim().length === 0) {
            return NextResponse.json({ error: 'Message empty' }, { status: 400 });
        }

        // Fetch user data directly to prevent local spoofing
        const { data: player } = await supabase
           .from('players')
           .select('username')
           .eq('clerk_user_id', userId)
           .single();

        if (!player) return NextResponse.json({ error: 'Player data not found' }, { status: 404 });

        // Push directly to global_chat bypassing RLS
        const { error } = await supabase
           .from('global_chat')
           .insert([{
               player_id: userId,
               username: player.username,
               message: message.substring(0, 250), // Enforce length limit
               channel: channel
           }]);
           
        if (error) throw error;
        
        return NextResponse.json({ success: true });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
