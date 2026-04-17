import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .order('tier', { ascending: true })
            .limit(20);

        if (error) throw error;

        return NextResponse.json({ recipes: data || [] });
    } catch (err) {
        return NextResponse.json({ recipes: [], error: err.message }, { status: 200 });
    }
}
