import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/pool';

export async function GET() {
    try {
        // ── Fetch all active recipes ──────────────────────────────────
        //
        // crafting_recipes columns (from schema):
        //   id, key, name, description, category, ingredients (JSONB),
        //   result_item_key, result_data (JSONB), level_required,
        //   craft_time_sec, gathering_skill, gathering_level,
        //   is_active, sort_order
        //
        // NOTE: gold_cost, success_chance, tier, and rarity do NOT exist
        // as columns — they live inside the result_data JSONB blob.
        // We extract them here using PostgreSQL's ->> JSON accessor.
        const { data, error } = await sql(
          `SELECT
             id,
             key,
             name,
             description,
             category,
             ingredients,
             result_item_key,
             result_data,
             level_required,
             craft_time_sec,
             gathering_skill,
             gathering_level,
             sort_order,
             -- Extract commonly-needed values from result_data JSONB
             -- for the frontend, casting to appropriate types.
             -- ->> returns text, so we CAST to numeric types.
             COALESCE((result_data->>'gold_cost')::integer, 0)       AS gold_cost,
             COALESCE((result_data->>'success_chance')::real, 1.0)   AS success_chance,
             COALESCE(result_data->>'tier', 'COMMON')                AS tier,
             COALESCE(result_data->>'rarity', 'common')              AS rarity
           FROM crafting_recipes
           WHERE is_active = true
           ORDER BY sort_order, level_required, name`
        );
        if (error) {
            console.error('[CRAFTING RECIPES]', error.message);
            return NextResponse.json({ recipes: [] });
        }

        return NextResponse.json({ recipes: data || [] });
    } catch (err) {
        console.error('[CRAFTING RECIPES ERROR]', err.message);
        return NextResponse.json({ recipes: [] });
    }
}
