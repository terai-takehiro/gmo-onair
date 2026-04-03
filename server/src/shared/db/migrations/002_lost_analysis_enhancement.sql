-- ============================================================
-- 失注分析強化: 失注理由マスタ + 教訓フィールド
-- ============================================================

-- 失注理由カテゴリマスタ
CREATE TABLE IF NOT EXISTS lost_reason_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (NOW())
);

-- デフォルト失注理由カテゴリ
INSERT INTO lost_reason_categories (id, name, sort_order) VALUES
  ('lr_01', '予算不足', 1),
  ('lr_02', '競合負け', 2),
  ('lr_03', 'スケジュール不一致', 3),
  ('lr_04', '顧客都合（延期・中止）', 4),
  ('lr_05', '自社リソース不足', 5),
  ('lr_06', '条件不一致', 6),
  ('lr_07', 'その他', 99)
ON CONFLICT DO NOTHING;

-- 教訓フィールド追加
ALTER TABLE projects ADD COLUMN lessons_learned TEXT;

-- 失注日フィールド追加（失注時期の正確な記録）
ALTER TABLE projects ADD COLUMN lost_at TEXT;
