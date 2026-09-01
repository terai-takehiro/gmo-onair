-- ============================================================
-- 263: レギュラー回向け標準工程テンプレート（3ブロック）
-- ============================================================
--
-- docs/design/v4/regular-series.md §4・§10-8。
-- 既存の task_column_templates（かんばん列の雛形。087/088）にそのまま乗せる —
-- 新しいテーブルは作らない。ここで作る3列の「名前」が、将来 Kanban 6状態
-- （準備中→収録準備完了→収録済→編集中→確認待ち→納品済）を導入するときの
-- 土台になる（§4「標準工程テンプレートの工程名がそのまま状態になる」）。
--
-- 3ブロックに分けた理由: 6状態を「収録前」「収録当日」「収録後」の3つの塊に
-- まとめた。細かすぎると回ごとにチェックする手間が増え、粗すぎると進み具合が
-- 見えない — 実務のまとまりで3つが妥当と判断した（ご判断）。
--
-- 既存の tpl-production / tpl-sales / tpl-basic（088）はそのまま。
-- 適用のしかたは taskColumnsService.applyToEpisode（サーバー）— 列は
-- 案件で使い回し（同じ回向けテンプレートを別の回に当てても列は増えない）、
-- 列ごとに1件、回（episode_id）に紐づくタスクを作る。

INSERT INTO task_column_templates (id, name, description, is_system, created_at, updated_at)
VALUES (
  'tpl-regular-episode',
  'レギュラー回 標準工程',
  'レギュラー番組の回（エピソード）向け。収録準備・収録当日・編集/納品の3つの塊で進み具合を追う。回のタスクタブから当てる。',
  true, NOW(), NOW()
)
ON CONFLICT DO NOTHING;

INSERT INTO task_column_template_columns (id, template_id, name, color, sort_order)
VALUES
  ('tpl-regular-episode-1', 'tpl-regular-episode', '収録準備',   '#60a5fa', 0),
  ('tpl-regular-episode-2', 'tpl-regular-episode', '収録当日',   '#fb923c', 1),
  ('tpl-regular-episode-3', 'tpl-regular-episode', '編集・納品', '#4ade80', 2)
ON CONFLICT DO NOTHING;
