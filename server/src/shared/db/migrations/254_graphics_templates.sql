-- ============================================================
-- 249: テロップCG — テンプレート層 段6-2（単一部品の設定プリセット）
--
-- docs/design/v4/graphics.md §2「部品→テンプレート→ページ→送出リスト」の4層。
-- 「テンプレート: レイヤーツリー＋In/Outアニメ＋公開フィールド（型・文字数上限つき）。
-- 公開フィールド以外はオペレーターから触れない」の最初の一段。
--
-- フルの「複数部品を1画面にレイアウトするキャンバス」は今回の対象外
-- （graphics-awards-migration-plan.md §2-2 の6番。次のラウンドへ明示的に持ち越す）。
-- 今回作るのは「1部品ぶんの設定プリセット＋公開フィールドの絞り込み」:
--   - graphics_templates: part_key・slot・既定のフィールド値（base_fields）・
--     そのうちオペレーターがページ作成時に編集できるフィールドの一覧（public_fields）を持つ、
--     CGプロジェクト単位の再利用可能なプリセット
--   - graphics_pages.template_id: ページがどのテンプレートから作られたか（NULL許容・
--     既定NULL。従来どおりテンプレートを使わない「部品を選んで自由入力」フローはそのまま残る）
-- ============================================================

CREATE TABLE IF NOT EXISTS graphics_templates (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES graphics_projects(id) ON DELETE CASCADE,
  part_key      VARCHAR(40) NOT NULL,
  slot          VARCHAR(20) NOT NULL
                CHECK (slot IN ('fullscreen', 'lower', 'side', 'ticker', 'clock', 'flash')),
  name          VARCHAR(200) NOT NULL,
  description   VARCHAR(500),
  base_fields   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 文字列配列（base_fields のキーの部分集合）。要素検証はアプリ層（templates.routes.ts）が担う
  -- （slot_exit_rules と同じ理由 — JSONB 配列の要素検証は Postgres の CHECK では素直に書けない）
  public_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graphics_templates_project
  ON graphics_templates (project_id);

-- ページがどのテンプレートから作られたか。NULL許容・既定NULL — テンプレートを使わず
-- 作ったページはNULLのまま。テンプレート削除時はページ側は残り、ただの通常ページとして
-- 触れるようになる（ON DELETE SET NULL＝データを失わない安全側の設計）
ALTER TABLE graphics_pages
  ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES graphics_templates(id) ON DELETE SET NULL;
