-- ============================================================
-- 246: テロップCG — 発注（テロ原）キュー（graphics_requests）
--
-- docs/design/v4/graphics.md §3・§9 段5「発注（テロ原・スマホ）」の最小実装。
--   ディレクターがスマホから「出したい文言・用途・出すタイミング」だけを書いて
--   投げ込み、デザイナーが「未作画」列（status='requested'）から拾って
--   graphics_pages 化する。手書き指示画像の添付は今回スコープ外。
-- ============================================================

CREATE TABLE IF NOT EXISTS graphics_requests (
  id                 SERIAL PRIMARY KEY,
  project_id         INTEGER NOT NULL REFERENCES graphics_projects(id) ON DELETE CASCADE,
  title              VARCHAR(200) NOT NULL,   -- 出したい文言・要旨
  detail             TEXT,                    -- 用途・補足
  desired_slot       VARCHAR(20)
                     CHECK (desired_slot IN ('fullscreen', 'lower', 'side', 'ticker', 'clock', 'flash')),
  desired_part_key   VARCHAR(40),             -- 希望する部品（graphics_pages.part_key と同じ語彙・任意なので FK/CHECK は張らない）
  desired_timing     VARCHAR(200),            -- 出すタイミングの自由記述（例:「オープニング映像の後」）
  requested_by       VARCHAR(200),            -- 依頼者名（認証ユーザーの表示名）
  status             VARCHAR(20) NOT NULL DEFAULT 'requested'
                     CHECK (status IN ('requested', 'converted', 'dismissed')),
  -- ページ化されたら紐づける。ページが消えても発注の履歴自体は残す（SET NULL）
  converted_page_id  INTEGER REFERENCES graphics_pages(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ハブ画面の「未作画」列（status='requested' 絞り込み）とプロジェクト単位の一覧が主用途
CREATE INDEX IF NOT EXISTS idx_graphics_requests_project_status
  ON graphics_requests (project_id, status, created_at);
