import { Covens } from '@/lib/dal';
import { auth } from '@/lib/auth';
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
        const { data: currentCoven } = await Covens.getPlayerCoven(userId);

        if (!currentCoven) {
            return NextResponse.json({ error: 'You are not in a coven.' }, { status: 403 });
        }

        const isLeader = currentCoven.role === 'Leader' || currentCoven.leader_id === userId;
        const isOfficer = currentCoven.role === 'Officer' || currentCoven.role === 'Elder';

        if (!isLeader && !isOfficer) {
             return NextResponse.json({ error: 'Insufficient permissions to kick members.' }, { status: 403 });
        }

        // 2. Fetch target's coven to ensure they belong to the same coven
        const { data: targetCoven } = await Covens.getPlayerCoven(targetUserId);
        
        if (!targetCoven || targetCoven.id !== currentCoven.id) {
             return NextResponse.json({ error: 'Target member is not in your coven.' }, { status: 404 });
        }

        // 3. Prevent kicking the leader
        if (targetUserId === currentCoven.leader_id) {
             return NextResponse.json({ error: 'Cannot kick the Coven leader.' }, { status: 403 });
        }
        
        // 4. Officers cannot kick other Officers
        if (!isLeader && (targetCoven.role === 'Officer' || targetCoven.role === 'Elder')) {
             return NextResponse.json({ error: 'Only the Leader can kick Officers.' }, { status: 403 });
        }

        // 5. Remove member using DAL
        const { error: removeError } = await Covens.removeMember(currentCoven.id, targetUserId);
        if (removeError) throw removeError;

        return NextResponse.json({ success: true, message: 'Member exiled successfully.' });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

