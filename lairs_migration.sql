CREATE TABLE IF NOT EXISTS lair_types (
  type VARCHAR(50) PRIMARY KEY,
  base_cost INTEGER NOT NULL,
  essence_bonus INTEGER DEFAULT 0,
  bank_bonus INTEGER DEFAULT 0
);

INSERT INTO lair_types (type, base_cost, essence_bonus, bank_bonus)
VALUES 
  ('Crypt', 10000, 10, 10000),
  ('Manor', 50000, 50, 50000),
  ('Castle', 250000, 250, 250000)
ON CONFLICT (type) DO NOTHING;

CREATE TABLE IF NOT EXISTS player_lairs (
  player_id VARCHAR(128) PRIMARY KEY,
  lair_type VARCHAR(50) REFERENCES lair_types(type),
  tier INTEGER DEFAULT 1,
  custom_name VARCHAR(100)
);
