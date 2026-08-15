-- Run this script in your Supabase SQL Editor

-- 1. Enhance players table for searching
ALTER TABLE players ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS level integer DEFAULT 1;

-- 2. Create the messages table for Mailbox functionality
CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id text NOT NULL, -- Clerk user ID of sender
    receiver_id text NOT NULL, -- Clerk user ID of receiver
    subject text,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- 3. Create the notifications table for server alerts
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL, -- Clerk user ID
    type text NOT NULL, -- e.g., 'SYSTEM', 'TRADE', 'COMBAT'
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Note: In a production environment, you should also establish Row Level Security (RLS) policies
-- to ensure users can only SELECT and INSERT messages/notifications relevant to their clerk_user_id.
