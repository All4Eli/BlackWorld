import { NextResponse } from 'next/server';

// Server-authoritative deterministic seed (Rotates every 1 hour)
export async function GET() {
    try {
        const hourSeed = Math.floor(Date.now() / 3600000);
        
        const possibleZones = [
            'bone_crypts', 'ashen_wastes', 'hollow_cathedral', 
            'abyssal_rift', 'throne_of_nothing'
        ];

        // Pseudo-random selection based on hour
        const idx1 = (hourSeed * 7) % possibleZones.length;
        let idx2 = (hourSeed * 11) % possibleZones.length;
        if (idx1 === idx2) idx2 = (idx2 + 1) % possibleZones.length;

        const activeBounties = [possibleZones[idx1], possibleZones[idx2]];

        return NextResponse.json({ activeBounties });
    } catch(err) {
        return NextResponse.json({ error: err.message, activeBounties: [] }, { status: 500 });
    }
}
