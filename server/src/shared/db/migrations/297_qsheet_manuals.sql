-- ============================================================
-- 297: 制作技術支援 — 運営マニュアル（ミニアプリ）段A
--
-- 設計: docs/design/v4/production-manual.md §5。制作技術支援の各ミニアプリに
-- もう入っている情報（当日の香盤・体制・機材…）を A4横のページに差し込んで
-- 1冊の PDF に組む道具。この migration は器（表3本）だけ — ブロック（紙面の
-- 中身）の型は段B/C で JSONB の中身として決める（§5-2 は ManualBlock の
-- TypeScript 型のみで、DDL 側の追加列は今回無い）。
--
-- ⚠️ 冊子（qsheet_manuals）は project_id / program_id の**どちらか1つ**
--    （§5-1 の CHECK。qsheet_rental_reservations と同じ作法・228 の
--    qsheet_rental_res_owner_ck を参照）。doc_no は資料単体では持てない
--    レンタル予約と違い、冊子は**必ず**発番する（進行台本・スケジュール表と
--    同じ。document-create.service.ts の「project/program 紐づき時は
--    doc_no を持たない」条件分岐はここには適用しない）。
-- ⚠️ 編集ロック（locked_by/locked_at・§6-2-1・2026-09-12 決定）は
--    冊子まるごと1本の排他。ページ単位のロックは持たない。10分の自動解除は
--    アプリ側が locked_at を見て判定する（DB 側にタイムアウトの仕組みは
--    持たせない）。
-- ⚠️ rev（版）は確定するたびに +1（§6-3・§10-3）。確定を解いても rev は
--    据え置き。下書きのうちは画面に版番号を出さない（status=draft のとき
--    rev は 0 のまま — アプリ側の約束で、DB 側では強制しない）。
-- ============================================================

-- ── 冊子 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qsheet_manuals (
  id                 TEXT PRIMARY KEY,
  doc_no             TEXT,                              -- OM-202609-0001（sequences.prod_doc_om）
  title              TEXT NOT NULL DEFAULT '',
  project_id         TEXT REFERENCES projects(id),
  program_id         TEXT REFERENCES qsheet_programs(id),
  service_date       DATE,
  status             TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'fixed', 'archived')),
  rev                INTEGER NOT NULL DEFAULT 0,         -- 確定するたびに +1（§6-3）
  theme              JSONB NOT NULL DEFAULT '{}'::jsonb, -- 配色・書体・柱の文言
  fixed_at           TIMESTAMPTZ,
  fixed_by           TEXT REFERENCES users(id),
  -- 編集ロック（冊子まるごと・§6-2-1）
  locked_by          TEXT REFERENCES users(id),
  locked_at          TIMESTAMPTZ,
  lock_requested_by  TEXT REFERENCES users(id),
  lock_requested_at  TIMESTAMPTZ,
  created_by         TEXT REFERENCES users(id),
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT qsheet_manuals_owner_ck CHECK (num_nonnulls(project_id, program_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_manuals_doc_no ON qsheet_manuals(doc_no) WHERE doc_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_manuals_project ON qsheet_manuals(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_manuals_program ON qsheet_manuals(program_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_manuals_created_by ON qsheet_manuals(created_by) WHERE deleted_at IS NULL;

-- ── ページ（1枚 = 1行。§5-1 の「なぜページ1枚=1行か」） ──────
CREATE TABLE IF NOT EXISTS qsheet_manual_pages (
  id          TEXT PRIMARY KEY,
  manual_id   TEXT NOT NULL REFERENCES qsheet_manuals(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  chapter     TEXT,                              -- 入っている行が章の先頭（§6 ②）
  title       TEXT NOT NULL DEFAULT '',
  blocks      JSONB NOT NULL DEFAULT '[]'::jsonb, -- ManualBlock[]（段A では空のまま。段B で中身を持たせる）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_manual_pages_manual ON qsheet_manual_pages(manual_id, sort_order);

-- ── ひな形（冊子まるごと／1ページ・組織共通 or 案件） ────────
CREATE TABLE IF NOT EXISTS qsheet_manual_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('org', 'project')),
  project_id  TEXT REFERENCES projects(id),  -- scope='project' のときだけ入る
  pages       JSONB NOT NULL DEFAULT '[]'::jsonb,
  theme       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  TEXT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT qsheet_manual_templates_scope_project_ck
    CHECK ((scope = 'project' AND project_id IS NOT NULL) OR (scope = 'org' AND project_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_qsheet_manual_templates_project ON qsheet_manual_templates(project_id) WHERE project_id IS NOT NULL;
