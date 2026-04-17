INSERT INTO boss_monsters (name, zone_id, tier, base_hp, base_damage_min, base_damage_max, dodge_chance, loot_table) VALUES 
('Crypt Guardian', 'Hollow Depths', 'Common', 500, 20, 35, 0.05, '{}'),
('Hollow Shade', 'Hollow Depths', 'Uncommon', 800, 35, 55, 0.08, '{}'),
('Corrupted Treant', 'Blighted Grove', 'Uncommon', 1000, 40, 60, 0.05, '{}'),
('Blood Sentinel', 'Crimson Sanctum', 'Rare', 1500, 55, 80, 0.10, '{}'),
('Hollow Wraith', 'Ashen Wastes', 'Rare', 2000, 70, 100, 0.15, '{}'),
('Abyssal Sentinel', 'Shattered Ruins', 'Epic', 3500, 100, 150, 0.12, '{}'),
('Crimson Lich', 'Crimson Sanctum', 'Epic', 4000, 120, 180, 0.10, '{}'),
('Void Harbinger', 'Void Breach', 'Legendary', 6000, 180, 280, 0.15, '{}'),
('Elder Nightmare', 'Void Breach', 'Legendary', 8000, 220, 350, 0.18, '{}'),
('The Hollow King', 'Celestial Spire', 'Celestial', 15000, 400, 600, 0.20, '{}'),
('Void Titan', 'Celestial Spire', 'Celestial', 20000, 500, 800, 0.15, '{}'),
('Celestial Warden', 'Celestial Spire', 'Celestial', 25000, 600, 900, 0.25, '{}') ON CONFLICT DO NOTHING;