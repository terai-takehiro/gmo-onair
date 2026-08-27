-- ============================================================
-- 243: 案件台帳の Phase B（ユーザー判断）で削除を選んだ列3本
--   — docs/project-ledger-simplification-plan.md §5 / Phase B
--
-- いずれも「棚卸しの結果、育てるより削除を選んだ」列（ユーザー判断・2026-08-27）:
--
--   - logo_permission: 案件を直す画面にスイッチはあったが、値を読む処理が
--     どこにも無かった（`application_form` と違い請求発行の gate にもならない）
--   - tags: v3 の置き土産のカンマ区切り TEXT。v4 は入力欄も絞り込む口も持たず、
--     編集は台帳の一括編集だけだった。MCP list_projects の tag 絞り込みも
--     この列に依存していたため、削除と同時に MCP 側の tag 引数・フィルタも撤去した
--   - lessons_learned: 失注ダイアログが値を送らなくなって以来 Web 画面からは
--     永久に空欄。営業レビューの「教訓・学び」パネルは列ごと削除し、
--     失注の振り返りは KPT・イベントレポートに一本化した
--
-- サーバーの SQL・MCP・クライアント表示は同じ PR で先に全て削除済み
-- （shared/tests/droppedColumns.test.ts が検査する）。
-- ============================================================

ALTER TABLE projects DROP COLUMN IF EXISTS logo_permission;
ALTER TABLE projects DROP COLUMN IF EXISTS tags;
ALTER TABLE projects DROP COLUMN IF EXISTS lessons_learned;
