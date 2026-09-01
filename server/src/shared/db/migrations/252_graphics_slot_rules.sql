-- ============================================================
-- 247: テロップCG — スロット間の自動退出ルール（CGプロジェクト単位）
--
-- docs/design/v4/graphics.md §2「スロット間ルール（例: フルスクリーンが来たら
-- 下部テロップを自動 OUT）はテンプレート側に宣言的な表で持つ。衝突の解決を
-- オペレーターの注意力に任せない」・§9 段6-4 の最小実装。
--
-- テンプレート層（段6-2）はまだ無いため、今回は「CGプロジェクト単位」の設定
-- として持つ（graphics-awards-migration-plan.md §2-2 の5番。テンプレート層が
-- できたらそちらへ移設する前提）。
--
-- 形: [{"whenSlot": "fullscreen", "autoOutSlots": ["lower", "side"]}, ...]
--   whenSlot のページが TAKE されたら、autoOutSlots に列挙されたスロットを
--   自動 OUT する、というルールの配列。
--
-- 既定値は空配列（既存プロジェクトの挙動を変えない。ルールはオプトインで、
-- 設定した人だけが使う）。whenSlot / autoOutSlots の値がスロット名6種の
-- いずれかであること・whenSlot が自分自身を autoOutSlots に含まないことは
-- アプリ層（server/src/contexts/graphics/routes/projects.routes.ts）で検証する
-- （CHECK 制約は付けない — JSONB 配列の要素検証は Postgres の CHECK では
-- 素直に書けないため）。
-- ============================================================

ALTER TABLE graphics_projects
  ADD COLUMN IF NOT EXISTS slot_exit_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
