// ═══════════════════════════════════════════════════════════════════
// GET /api/auction — Fetch active auction listings
// ═══════════════════════════════════════════════════════════════════
//
// TABLE FIX: This route previously queried the legacy `auctions` table.
// It now queries `auction_listings` (the normalized table used by
// list and buy routes). The status check uses lowercase 'active'
// to match the CHECK constraint.
//
// JSONB EXTRACTION: item_data is a JSONB column storing item metadata
// (name, type, tier, enhancement, rolled_stats). We extract these
// into flat columns for the frontend with ->> JSON accessors.
// ═══════════════════════════════════════════════════════════════════

import { sql } from '@/lib/db/pool';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
      // ── Fetch active listings from auction_listings ──────────────
      //
      // item_data JSONB contains: { name, type, tier, enhancement, rolled_stats }
      // We extract these into flat columns so the frontend can read
      // auction.item_name, auction.item_type, etc. directly.
      const { data, error } = await sql(`
          SELECT
            al.id,
            al.seller_id,
            al.seller_name,
            al.inventory_id,
            al.price,
            al.buyout_price,
            al.status,
            al.buyer_id,
            al.created_at,
            al.expires_at,
            -- Extract item metadata from JSONB for frontend display
            al.item_data->>'name'         AS item_name,
            al.item_data->>'type'         AS item_type,
            al.item_data->>'tier'         AS item_rarity,
            (al.item_data->'rolled_stats') AS item_stats,
            COALESCE((al.item_data->>'enhancement')::integer, 0) AS enhancement
          FROM auction_listings al
          WHERE al.status = 'active'
            AND al.expires_at >= NOW()
          ORDER BY al.created_at DESC
          LIMIT 100
      `);
      
      if (error) throw error;

      return NextResponse.json({ auctions: data || [] });
  } catch(err) {
      console.error('[GET /api/auction]', err);
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
