-- ============================================================
-- 245: テロップCG（graphics）— techops ミニアプリの器
--
-- docs/design/v4/graphics.md §2 のデータモデルの最小実装（段1）。
--   - graphics_projects: 番組・案件（owner）ごとの「この番組のテロップシステム」。
--     owner は project / program の2種で、device-settings（migration 220）と同じ
--     ポリモーフィックな持ち方のため FK は張らない（owner_id は projects.id
--     または qsheet_programs.id）
--   - graphics_pages: コールアップ番号つきのページ。fields は部品（part_key）ごとに
--     形が違うため JSONB（テンプレート層は段4で足す）
--   - graphics_cue_state: スロットごとの独立 cue（§2「1スロット1枚」を
--     PRIMARY KEY (project_id, slot) で構造として強制する。
--     旧 awards_oneshot_cue_state が全スロットを1行に抱えていた設計負債の解消）
-- ============================================================

CREATE TABLE IF NOT EXISTS graphics_projects (
  id          SERIAL PRIMARY KEY,
  owner_type  VARCHAR(20) NOT NULL CHECK (owner_type IN ('project', 'program')),
  owner_id    VARCHAR(100) NOT NULL,
  name        VARCHAR(200) NOT NULL,
  theme       VARCHAR(40) NOT NULL DEFAULT 'ceremony-gold',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 1 owner = 1 CGプロジェクト（resolve の get-or-create がこの一意性に依存する）
  CONSTRAINT graphics_projects_owner_uq UNIQUE (owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS graphics_pages (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES graphics_projects(id) ON DELETE CASCADE,
  call_no     INTEGER NOT NULL,          -- 呼出番号（テンキー呼出。例: 201）
  slot        VARCHAR(20) NOT NULL
              CHECK (slot IN ('fullscreen', 'lower', 'side', 'ticker', 'clock', 'flash')),
  part_key    VARCHAR(40) NOT NULL,      -- 部品の種類（name/title/list/ticker/countdown/score/flash/side/vote）
  name        VARCHAR(300) NOT NULL,
  fields      JSONB NOT NULL DEFAULT '{}'::jsonb,
  proof_state VARCHAR(20) NOT NULL DEFAULT 'draft'
              CHECK (proof_state IN ('draft', 'unproofed', 'proofed')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 番号呼出（「201出して」）が一意に決まるよう、番号はプロジェクト内で重複禁止
  CONSTRAINT graphics_pages_call_no_uq UNIQUE (project_id, call_no)
);

CREATE INDEX IF NOT EXISTS idx_graphics_pages_project
  ON graphics_pages (project_id, sort_order, call_no);

CREATE TABLE IF NOT EXISTS graphics_cue_state (
  project_id  INTEGER NOT NULL REFERENCES graphics_projects(id) ON DELETE CASCADE,
  slot        VARCHAR(20) NOT NULL
              CHECK (slot IN ('fullscreen', 'lower', 'side', 'ticker', 'clock', 'flash')),
  -- ページ削除時に cue だけ残ると出力画面が消せない絵を参照し続けるため SET NULL
  page_id     INTEGER REFERENCES graphics_pages(id) ON DELETE SET NULL,
  is_live     BOOLEAN NOT NULL DEFAULT FALSE,
  taken_at    TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, slot)
);
