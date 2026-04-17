import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('recipes')
            .select('id, name, category, tier, gold_cost, success_chance, ingredients, required_skill_level, craft_time_seconds, rarity')
            .eq('is_discoverable', true)
            .order('gold_cost', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ recipes: data || [] });
    } catch (err) {
        return NextResponse.json({ recipes: [], error: err.message }, { status: 500 });
    }
}
