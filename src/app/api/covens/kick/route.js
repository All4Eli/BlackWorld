import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { targetUserId } = await request.json();
        
        if (!targetUserId) {
            return NextResponse.json({ error: 'Missing target player ID.' }, { status: 400 });
        }

        // 1. Fetch initiator's coven details
        const { data: initiatorPlayer } = await supabase
            .from('players')
            .select('coven_id')
            .eq('clerk_user_id', userId)
            .single();

        if (!initiatorPlayer || !initiatorPlayer.coven_id) {
            return NextResponse.json({ error: 'You are not in a coven.' }, { status: 403 });
        }

        const covenId = initiatorPlayer.coven_id;

        // 2. Fetch Coven rules
        const { data: coven, error: covenError } = await supabase
             .from('covens')
             .select('id, leader_id, officers, member_count')
             .eq('id', covenId)
             .single();

        if (covenError) throw new Error('Coven read failed.');

        const isLeader = coven.leader_id === userId;
        const isOfficer = coven.officers && coven.officers.includes(userId);

        if (!isLeader && !isOfficer) {
             return NextResponse.json({ error: 'Insufficient permissions to kick members.' }, { status: 403 });
        }

        // 3. Prevent kicking the leader
        if (targetUserId === coven.leader_id) {
             return NextResponse.json({ error: 'Cannot kick the Coven leader.' }, { status: 403 });
        }

        // 4. Wipe target user's coven metadata
        const { error: resetError } = await supabase
             .from('players')
             .update({
                 coven_id: null,
                 coven_role: 'Unpledged',
                 coven_name: null,
                 coven_tag: null
             })
             .eq('clerk_user_id', targetUserId)
             .eq('coven_id', covenId); // Ensure they were actually in THIS coven

        if (resetError) throw resetError;

        // 5. Decrement coven roster count
        await supabase
             .from('covens')
             .update({ member_count: Math.max(0, coven.member_count - 1) })
             .eq('id', covenId);


        return NextResponse.json({ success: true, message: 'Member exiled successfully.' });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
