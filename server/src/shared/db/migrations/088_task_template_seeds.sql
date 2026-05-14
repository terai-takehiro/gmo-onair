-- ============================================================
-- 088: タスクテンプレートのシステムシード
-- ============================================================

-- 制作フロー テンプレート（GLS-A スタジオ案件向け）
INSERT INTO task_column_templates (id, name, description, is_system, created_at, updated_at)
VALUES ('tpl-production', '制作フロー', 'スタジオ・番組案件向け標準制作フロー', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO task_column_template_columns (id, template_id, name, color, sort_order)
VALUES
  ('tpl-production-1', 'tpl-production', '未着手',    '#94a3b8', 0),
  ('tpl-production-2', 'tpl-production', '台本作成',  '#a78bfa', 1),
  ('tpl-production-3', 'tpl-production', '素材準備',  '#60a5fa', 2),
  ('tpl-production-4', 'tpl-production', '収録',      '#fb923c', 3),
  ('tpl-production-5', 'tpl-production', '確認中',    '#facc15', 4),
  ('tpl-production-6', 'tpl-production', '完了',      '#4ade80', 5)
ON CONFLICT DO NOTHING;

-- 営業フロー テンプレート（GLS-B ビジネス案件向け）
INSERT INTO task_column_templates (id, name, description, is_system, created_at, updated_at)
VALUES ('tpl-sales', '営業フロー', 'ビジネス案件向け営業タスクフロー', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO task_column_template_columns (id, template_id, name, color, sort_order)
VALUES
  ('tpl-sales-1', 'tpl-sales', 'バックログ',   '#94a3b8', 0),
  ('tpl-sales-2', 'tpl-sales', 'アクション中', '#60a5fa', 1),
  ('tpl-sales-3', 'tpl-sales', 'レビュー待ち', '#facc15', 2),
  ('tpl-sales-4', 'tpl-sales', '完了',          '#4ade80', 3)
ON CONFLICT DO NOTHING;

-- 基本かんばん テンプレート（汎用）
INSERT INTO task_column_templates (id, name, description, is_system, created_at, updated_at)
VALUES ('tpl-basic', '基本かんばん', 'シンプルな3列かんばん', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO task_column_template_columns (id, template_id, name, color, sort_order)
VALUES
  ('tpl-basic-1', 'tpl-basic', 'ToDo',     '#94a3b8', 0),
  ('tpl-basic-2', 'tpl-basic', '進行中',   '#60a5fa', 1),
  ('tpl-basic-3', 'tpl-basic', '完了',     '#4ade80', 2)
ON CONFLICT DO NOTHING;
