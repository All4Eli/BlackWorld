-- Run this script in your Supabase SQL Editor

-- 1. Create the covens table
CREATE TABLE IF NOT EXISTS covens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    tag text NOT NULL, -- e.g., 'VOID'
    description text,
    leader_id text NOT NULL, -- Clerk user ID of the coven leader
    member_count integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Enhance players table to link to covens
ALTER TABLE players ADD COLUMN IF NOT EXISTS coven_id uuid REFERENCES covens(id);
ALTER TABLE players ADD COLUMN IF NOT EXISTS coven_role text DEFAULT 'Unpledged'; -- 'Unpledged', 'Member', 'Leader'
ALTER TABLE players ADD COLUMN IF NOT EXISTS coven_name text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS coven_tag text;
