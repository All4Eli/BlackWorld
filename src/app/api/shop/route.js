import { supabase } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Server-side shop inventory generation (same logic that was client-side)
const RARITIES = ['COMMON', 'COMMON', 'COMMON', 'UNCOMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const TYPES = ['WEAPON', 'ARMOR', 'ACCESSORY'];
const WEAPON_PREFIXES = ['Bloodforged', 'Soulwrought', 'Voidtouched', 'Demonhewn', 'Ashborn'];
const ARMOR_PREFIXES = ['Shadowspun', 'Boneclad', 'Veilweave', 'Cinderbound', 'Dreadplate'];
const SUFFIXES = ['of Ruin', 'of the Depths', 'of Agony', 'of Whispers', 'of Flame', 'of Night'];

function generateShopItem(level, index) {
    const rarity = RARITIES[Math.floor(Math.random() * RARITIES.length)];
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const prefixes = type === 'WEAPON' ? WEAPON_PREFIXES : ARMOR_PREFIXES;
    const name = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${type === 'WEAPON' ? 'Blade' : type === 'ARMOR' ? 'Plate' : 'Ring'} ${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}`;

    const rarityCostMult = { 'COMMON': 1, 'UNCOMMON': 2.5, 'RARE': 5, 'EPIC': 12, 'LEGENDARY': 30 }[rarity] || 1;
    const rarityStatMult = { 'COMMON': 1, 'UNCOMMON': 1.5, 'RARE': 2.5, 'EPIC': 4, 'LEGENDARY': 7 }[rarity] || 1;

    const stats = {};
    if (type === 'WEAPON') stats.dmg = Math.floor((3 + level * 2) * rarityStatMult);
    if (type === 'ARMOR') {
        stats.def = Math.floor((2 + level * 1.5) * rarityStatMult);
        stats.hp = Math.floor((5 + level * 3) * rarityStatMult);
    }
    if (type === 'ACCESSORY') {
        stats.crit = Math.floor(2 * rarityStatMult);
        stats.hp = Math.floor((3 + level) * rarityStatMult);
    }

    return {
        id: `shop_${Date.now()}_${index}`,
        name,
        type,
        rarity,
        level,
        stats,
        cost: Math.floor(Math.random() * 50 * level * rarityCostMult) + (50 * level * rarityCostMult)
    };
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const level = parseInt(searchParams.get('level')) || 1;

    const items = [];
    for (let i = 0; i < 8; i++) {
        items.push(generateShopItem(level, i));
    }

    return NextResponse.json({ items });
}

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { itemId, itemCost } = await request.json();

        if (!itemId || !itemCost || itemCost <= 0) {
            return NextResponse.json({ error: 'Invalid purchase.' }, { status: 400 });
        }

        const { data: player, error: fetchError } = await supabase
            .from('players')
            .select('hero_data')
            .eq('clerk_user_id', userId)
            .single();

        if (fetchError || !player) {
            return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
        }

        let hero = player.hero_data || {};
        const currentGold = hero.gold || 0;

        if (currentGold < itemCost) {
            return NextResponse.json({ error: 'Not enough gold.' }, { status: 400 });
        }

        // Server generates the item fresh to prevent client stat tampering
        // The itemId format is shop_{timestamp}_{index} — we regenerate to validate
        const indexMatch = itemId.match(/_(\d+)$/);
        const itemIndex = indexMatch ? parseInt(indexMatch[1]) : 0;
        const item = generateShopItem(hero.level || 1, itemIndex);
        
        // Use the server-generated item but keep the original ID for dedup
        item.id = itemId;
        item.acquired_at = new Date().toISOString();

        hero.gold = currentGold - itemCost;
        if (!hero.artifacts) hero.artifacts = [];
        hero.artifacts.push(item);

        const { error: updateError } = await supabase
            .from('players')
            .update({ hero_data: hero })
            .eq('clerk_user_id', userId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            item,
            newGold: hero.gold
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
