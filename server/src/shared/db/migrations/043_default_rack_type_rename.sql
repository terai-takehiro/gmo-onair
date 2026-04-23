-- デフォルト種別をグローバルスタジオ想定で「マシンラック」に rename
-- ユーザーが既に rename 済みの場合は触らない
UPDATE equipment_rack_types
  SET name = 'マシンラック'
  WHERE id = 'rt-rack' AND name = 'ラック';

-- 念のため未挿入の場合のフォールバック
INSERT INTO equipment_rack_types (id, name, sort_order) VALUES
  ('rt-rack', 'マシンラック', 0)
ON CONFLICT (id) DO NOTHING;
