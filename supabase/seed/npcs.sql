INSERT INTO npcs (name, title, zone_id, is_vendor, dialogue) VALUES 
('Malachar', 'The Hollow Keeper', 'Sanctuary', 'true', '{"greeting": "Seek the truth."}'),
('Seraphine', 'Blood Trader', 'Sanctuary', 'true', '{"greeting": "Blood is currency."}'),
('Korrath', 'Scarred Veteran', 'Sanctuary', 'false', '{"greeting": "Watch your flank."}'),
('The Nameless', '???', 'Ashen Wastes', 'false', '{"greeting": "..."}'),
('Vex', 'Shadow Broker', 'Hollow Depths', 'true', '{"greeting": "Got coin?"}'),
('Thornwick', 'Mad Alchemist', 'Blighted Grove', 'true', '{"greeting": "Explosions!"}'),
('Sister Morgana', 'Blood Priestess', 'Crimson Sanctum', 'false', '{"greeting": "The blood calls."}'),
('Orin', 'Relic Hunter', 'Shattered Ruins', 'false', '{"greeting": "Shinies?"}'),
('The Void Oracle', 'Seer of Nothing', 'Void Breach', 'false', '{"greeting": "Inevitability."}'),
('Captain Harken', 'Arena Master', 'Sanctuary', 'false', '{"greeting": "FIGHT!"}'),
('Whisper', 'Information Dealer', 'Sanctuary', 'false', '{"greeting": "I know all."}'),
('Elder Grimm', 'Coven Registrar', 'Sanctuary', 'false', '{"greeting": "Sign here."}') ON CONFLICT DO NOTHING;