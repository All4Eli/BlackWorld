-- Run this script in your Supabase SQL Editor

-- 1. Create the auctions table for the Player Trading Economy
CREATE TABLE IF NOT EXISTS auctions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id text NOT NULL, -- Clerk user ID of the seller
    seller_name text NOT NULL,
    item_id text NOT NULL,
    item_name text NOT NULL,
    item_type text NOT NULL,
    item_rarity text NOT NULL,
    item_stats jsonb NOT NULL,
    buyout_price integer NOT NULL,
    status text DEFAULT 'ACTIVE', -- 'ACTIVE', 'SOLD', 'CANCELLED'
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + interval '48 hours')
);

-- Note: Ensure that your players table from earlier migrations has the banked_gold column. 
-- It was established in local State naturally, but the backend script will inject gold into the hero_data json or we can extract banked_gold.
-- For maximum safety, we will alter the players table to pull out 'gold' and 'banked_gold' as top-level columns so we can securely transact.

ALTER TABLE players ADD COLUMN IF NOT EXISTS bank_balance integer DEFAULT 0;
