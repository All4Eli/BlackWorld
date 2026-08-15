CREATE TABLE IF NOT EXISTS blood_stone_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT REFERENCES players(clerk_user_id),
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  source TEXT,
  description TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS premium_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT REFERENCES players(clerk_user_id),
  pack_type TEXT,
  amount_paid INT,
  blood_stones INT,
  donator_days INT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
