-- ============================================================
-- 030: スタジオ・部屋デフォルトデータ (本番用)
-- seed.ts をスキップする本番環境でも部屋マスタが必要
-- ============================================================

-- 用賀スタジオ
INSERT INTO studio_locations (id, name, sort_order)
VALUES ('loc-yoga', '用賀スタジオ', 1)
ON CONFLICT (id) DO NOTHING;

-- 渋谷スタジオ
INSERT INTO studio_locations (id, name, sort_order)
VALUES ('loc-shibuya', '渋谷スタジオ', 2)
ON CONFLICT (id) DO NOTHING;

-- 外現場
INSERT INTO studio_locations (id, name, sort_order)
VALUES ('loc-external', '外現場', 3)
ON CONFLICT (id) DO NOTHING;

-- 用賀スタジオの部屋 (パターンA: studio → control → greenroom)
INSERT INTO studio_rooms (id, location_id, name, room_type, color, sort_order) VALUES
  ('room-world',    'loc-yoga', 'WORLD STUDIO',  'studio',    '#2563eb', 1),
  ('room-sky',      'loc-yoga', 'SKY STUDIO',    'studio',    '#7c3aed', 2),
  ('room-lounge',   'loc-yoga', 'LOUNGE STUDIO', 'studio',    '#0891b2', 3),
  ('room-ctrl1',    'loc-yoga', '第1調整室',      'control',   '#4f46e5', 4),
  ('room-ctrl2',    'loc-yoga', '第2調整室',      'control',   '#0284c7', 5),
  ('room-meeting',  'loc-yoga', 'MEETING ROOM',  'greenroom', '#6b7280', 6),
  ('room-a',        'loc-yoga', 'ROOM A',        'greenroom', '#059669', 7),
  ('room-b',        'loc-yoga', 'ROOM B',        'greenroom', '#d97706', 8),
  ('room-c',        'loc-yoga', 'ROOM C',        'greenroom', '#dc2626', 9),
  ('room-vip',      'loc-yoga', 'VIP LOUNGE',    'greenroom', '#9333ea', 10)
ON CONFLICT (id) DO NOTHING;

-- 渋谷スタジオの部屋
INSERT INTO studio_rooms (id, location_id, name, room_type, color, sort_order) VALUES
  ('room-s1', 'loc-shibuya', '第1スタジオ', 'studio', '#e11d48', 1),
  ('room-s2', 'loc-shibuya', '第2スタジオ', 'studio', '#ea580c', 2),
  ('room-s3', 'loc-shibuya', '第3スタジオ', 'studio', '#ca8a04', 3)
ON CONFLICT (id) DO NOTHING;
