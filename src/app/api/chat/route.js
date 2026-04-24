import { Chat, Players } from '@/lib/dal';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await Chat.getRecent('global', 50);
            
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
        const { data: player } = await Players.getByUserId(userId);

        if (!player) return NextResponse.json({ error: 'Player data not found' }, { status: 404 });

        // Push directly to global_chat bypassing RLS
        const { error } = await Chat.send(
            userId,
            player.username,
            message.substring(0, 250), // Enforce length limit
            channel
        );
           
        if (error) throw error;
        
        return NextResponse.json({ success: true });

    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

