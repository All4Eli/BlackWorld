INSERT INTO world_events (name, description, event_type, modifiers, schedule_cron, duration_minutes, min_participants, max_participants, scaling_enabled, rewards, is_active) VALUES 
('Daily Invasion', 'Desc', 'invasion', '{"xp_mult": 2.0}', '0 12 * * *', 60, 1, 100, true, '{"gold": 100}', true),
('Hollow Invasion', 'Desc', 'invasion', '{"xp_mult": 2.0}', '0 18 * * *', 60, 1, 100, true, '{"gold": 100}', true),
('Crimson Invasion', 'Desc', 'invasion', '{"xp_mult": 2.0}', '0 0 * * *', 60, 1, 100, true, '{"gold": 100}', true),
('Weekly Boss', 'Desc', 'world_boss', '{"xp_mult": 2.0}', '0 20 * * 6', 120, 1, 100, true, '{"gold": 100}', true),
('Double XP', 'Desc', 'double_xp', '{"xp_mult": 2.0}', '0 0 * * 5', 2880, 1, 100, true, '{"gold": 100}', true),
('Void Rift', 'Desc', 'void_rift', '{"xp_mult": 2.0}', '0 21 * * 3', 90, 1, 100, true, '{"gold": 100}', true),
('Contested War', 'Desc', 'contested_war', '{"xp_mult": 2.0}', '0 19 * * 1', 180, 1, 100, true, '{"gold": 100}', true),
('Monthly Tournament', 'Desc', 'pvp_tournament', '{"xp_mult": 2.0}', '0 18 1 * *', 240, 1, 100, true, '{"gold": 100}', true) ON CONFLICT DO NOTHING;