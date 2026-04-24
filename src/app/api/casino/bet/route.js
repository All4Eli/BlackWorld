import { withMiddleware } from '@/lib/middleware';
import { HeroStats, Composite, Logs } from '@/lib/dal';
import { NextResponse } from 'next/server';

async function handlePost(request) {
    const { userId } = await import('@/lib/auth').then(m => m.auth());
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { betAmount, gameType } = await request.json();

        if (!betAmount || betAmount <= 0 || !Number.isInteger(betAmount)) {
            return NextResponse.json({ error: 'Invalid bet amount' }, { status: 400 });
        }

        if (betAmount > 10000) {
            return NextResponse.json({ error: 'Maximum bet is 10,000 gold.' }, { status: 400 });
        }

        // Determine game parameters server-side
        let winChance, multiplier;
        if (gameType === 'coin_flip') {
            winChance = 0.48; // slight house edge
            multiplier = 2;
        } else if (gameType === 'slots') {
            winChance = 0.22;
            multiplier = 4;
        } else if (gameType === 'roulette') {
            winChance = 0.05;
            multiplier = 12;
        } else {
            return NextResponse.json({ error: 'Unknown game type.' }, { status: 400 });
        }

        const { data: composite, error: fetchError } = await Composite.getFullPlayer(userId);

        if (fetchError || !composite || !composite.stats) {
            return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }

        const stats = composite.stats;
        let heroData = stats.hero_data || {};
        const currentGold = stats.gold || 0;

        if (currentGold < betAmount) {
            return NextResponse.json({ error: 'Insufficient gold.' }, { status: 400 });
        }

        // Server-side RNG
        const win = Math.random() < winChance;
        const netChange = win ? (betAmount * multiplier) - betAmount : -betAmount;
        const newBalance = Math.max(0, currentGold + netChange);

        const { error: updateError } = await HeroStats.update(userId, { gold: newBalance });
        if (updateError) throw updateError;
        
        await Logs.casino(userId, gameType, betAmount, win ? betAmount * multiplier : 0, win ? 'win' : 'loss', { netChange });

        // Reconstruct backend payload to match expected structure
        const updatedHero = {
            ...heroData,
            level: stats.level,
            xp: stats.xp,
            str: stats.str,
            def: stats.def,
            dex: stats.dex,
            int: stats.int,
            vit: stats.vit,
            hp: stats.hp,
            max_hp: stats.max_hp,
            unspentStatPoints: stats.unspent_points,
            gold: newBalance
        };

        return NextResponse.json({
            success: true,
            win,
            net_change: netChange,
            updatedHero,
            game_type: gameType
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export const POST = withMiddleware(handlePost, { requireAuth: true, rateLimit: 'casino_bet', idempotency: true });


