-- ============================================================
-- 304: 制作技術支援 — 技術資料（ミニアプリ）段A
--
-- 設計: docs/design/v4/tech-docs.md §5（表7本）・§9-1（パッチ盤の初期データ）。
-- 映像パッチ（送り→受け）と技術スタッフ（1人の1作業日）を1件の資料にまとめ、
-- 盤（VJP100〜VJP1800）のパッチ番号を組織共通のマスタとして持つ。
-- DDL の書式（TEXT PRIMARY KEY・TIMESTAMPTZ・deleted_at・owner の CHECK・
-- 部分インデックス）は 297（qsheet_manuals）・298（qsheet_venue_layouts）を写す。
--
-- ⚠️ 資料（qsheet_tech_docs）は project_id / program_id の**どちらか1つ**
--    （§5-1 の CHECK。qsheet_manuals・qsheet_venue_layouts と同じ作法）。
--    doc_no は `TD-YYYYMM-0001`（sequences.prod_doc_td）で**必ず**発番する。
-- ⚠️ 編集ロック（locked_by/locked_at・§5-4）は資料まるごと1本の排他（10分で自動解除）。
--    rev（版）は確定するたびに +1。確定を解いても rev は据え置き。
-- ⚠️ 列名が `position`／`row` ではなく `jack_no`／`jack_row` なのは、`ROW` が
--    PostgreSQL の予約語・`POSITION` も予約語で引用符なしに書けないため（§5-1）。
-- ⚠️ パッチ番号（`216B`）は列に持たない。盤の名前と jack_no・jack_row から
--    組み立てる（shared/src/tech/patchNo.ts）。二重に持つと盤の名前を直したときに
--    番号だけ古くなる。
-- ⚠️ 技術人員（qsheet_tech_persons）の実データはここに入れない。氏名は個人情報で、
--    migration に書くと git の履歴に永久に残る（§9-2）。入れるのは管理者が手元で
--    回すスクリプト。
-- ============================================================

-- ── 資料（1件 = 1行） ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS qsheet_tech_docs (
  id                 TEXT PRIMARY KEY,
  doc_no             TEXT,                                -- TD-202610-0001（sequences.prod_doc_td）。必ず発番
  title              TEXT NOT NULL DEFAULT '',
  project_id         TEXT REFERENCES projects(id),
  program_id         TEXT REFERENCES qsheet_programs(id),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'fixed')),
  rev                INTEGER NOT NULL DEFAULT 0,          -- 確定するたびに +1
  copied_from        TEXT REFERENCES qsheet_tech_docs(id),
  fixed_at           TIMESTAMPTZ,
  fixed_by           TEXT REFERENCES users(id),
  locked_by          TEXT REFERENCES users(id),           -- 編集ロック（資料まるごと・§5-4）
  locked_at          TIMESTAMPTZ,
  lock_requested_by  TEXT REFERENCES users(id),
  lock_requested_at  TIMESTAMPTZ,
  created_by         TEXT REFERENCES users(id),
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT qsheet_tech_docs_owner_ck CHECK (num_nonnulls(project_id, program_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_tech_docs_project
  ON qsheet_tech_docs(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_docs_program
  ON qsheet_tech_docs(program_id) WHERE deleted_at IS NULL;

-- ── パッチ盤（組織共通。案件に紐づけない） ─────────────────
-- ⚠️ 映像パッチの行（qsheet_tech_patch_rows）が jack を参照するので、盤・ジャックを先に作る
CREATE TABLE IF NOT EXISTS qsheet_patch_panels (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,                             -- VJP100 … VJP1800
  jack_count   INTEGER NOT NULL CHECK (jack_count IN (32, 48)),
  kind         TEXT NOT NULL DEFAULT 'jack' CHECK (kind IN ('jack', 'trunk')),  -- trunk = TRK1〜32
  location     TEXT NOT NULL DEFAULT '',                  -- 第1調整室 / マシンルーム …
  model        TEXT NOT NULL DEFAULT '',                  -- 48MCK-H / 32MCKA-STS
  note         TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT REFERENCES users(id),
  CONSTRAINT qsheet_patch_panels_name_uq UNIQUE (name)
);

-- ── 盤の1ch（1ch × 段 = 1行。VJP100 なら 48 × 2 = 96 行） ───
CREATE TABLE IF NOT EXISTS qsheet_patch_jacks (
  id           TEXT PRIMARY KEY,
  panel_id     TEXT NOT NULL REFERENCES qsheet_patch_panels(id) ON DELETE CASCADE,
  jack_no      INTEGER NOT NULL,                          -- 盤面の裸の番号 1〜48（または 1〜32）
  jack_row     TEXT NOT NULL CHECK (jack_row IN ('A', 'B')),
  device_name  TEXT NOT NULL DEFAULT '',                  -- CCU1 / 入力ルーター …（空 = 未転記）
  label        TEXT NOT NULL DEFAULT '',                  -- CCU1 OUT / in1 …
  signal       TEXT NOT NULL DEFAULT '',
  area         TEXT NOT NULL DEFAULT '',                  -- マシンルーム / 第1調整室 …
  note         TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT REFERENCES users(id),
  CONSTRAINT qsheet_patch_jacks_pos_uq UNIQUE (panel_id, jack_no, jack_row)
);

-- 機材名で束ねる候補（GET /techops/tech-panels/devices）が毎回なめる列
CREATE INDEX IF NOT EXISTS idx_qsheet_patch_jacks_device
  ON qsheet_patch_jacks(device_name) WHERE device_name <> '';

-- ── 映像パッチの行（1行 = 1つの 送り→受け） ────────────────
CREATE TABLE IF NOT EXISTS qsheet_tech_patch_rows (
  id                TEXT PRIMARY KEY,
  tech_doc_id       TEXT NOT NULL REFERENCES qsheet_tech_docs(id) ON DELETE CASCADE,
  group_label       TEXT NOT NULL DEFAULT '',             -- 系統（増設スイッチャー・客席モニター…）
  sort_order        INTEGER NOT NULL DEFAULT 0,
  from_device_text  TEXT NOT NULL DEFAULT '',             -- 送りの機材名（増設機材もここ）
  from_jack_id      TEXT REFERENCES qsheet_patch_jacks(id),  -- 盤から引いたときだけ入る
  from_jack_text    TEXT NOT NULL DEFAULT '',             -- 101A / PGM OUT（写した値）
  from_is_extra     BOOLEAN NOT NULL DEFAULT false,       -- 送りが増設機材
  to_device_text    TEXT NOT NULL DEFAULT '',
  to_jack_id        TEXT REFERENCES qsheet_patch_jacks(id),
  to_jack_text      TEXT NOT NULL DEFAULT '',
  to_is_extra       BOOLEAN NOT NULL DEFAULT false,
  label             TEXT NOT NULL DEFAULT '',             -- 名称（送り機材の名称を初期値に・行ごとに編集可）
  signal            TEXT NOT NULL DEFAULT '',             -- 3G-SDI / 12G-SDI / HDMI …
  note              TEXT NOT NULL DEFAULT '',             -- 備考
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_patch_rows_doc
  ON qsheet_tech_patch_rows(tech_doc_id, sort_order);

-- ── 会社と人（組織共通。案件に紐づけない） ─────────────────
CREATE TABLE IF NOT EXISTS qsheet_tech_companies (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,                             -- 株式会社ヌーベルバーグ
  short_name   TEXT NOT NULL DEFAULT '',                  -- ヌーベルバーグ
  company_id   TEXT REFERENCES companies(id),             -- 任意参照（§5-2）
  sort_order   INTEGER NOT NULL DEFAULT 0,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS qsheet_tech_persons (
  id                TEXT PRIMARY KEY,
  tech_company_id   TEXT NOT NULL REFERENCES qsheet_tech_companies(id),
  name              TEXT NOT NULL,
  kana              TEXT NOT NULL DEFAULT '',             -- 元の PDF に無いので当面は空（§9-2）
  main_roles        TEXT[] NOT NULL DEFAULT '{}',         -- よく担当する役職（候補。固定属性ではない）
  active            BOOLEAN NOT NULL DEFAULT true,        -- false = 候補に出さない
  partner_id        TEXT REFERENCES partners(id),         -- 任意参照（§5-2）
  note              TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_persons_company
  ON qsheet_tech_persons(tech_company_id) WHERE deleted_at IS NULL;

-- ── 技術スタッフの行（1行 = 1人の1作業日） ─────────────────
CREATE TABLE IF NOT EXISTS qsheet_tech_staff_rows (
  id            TEXT PRIMARY KEY,
  tech_doc_id   TEXT NOT NULL REFERENCES qsheet_tech_docs(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,                            -- 作業日（1行 = 1日。§4-5）
  role          TEXT NOT NULL DEFAULT '',                 -- SW / CAM / CAM-A / MIX …（元の PDF の語）
  person_id     TEXT REFERENCES qsheet_tech_persons(id),  -- 台帳から引いたときだけ入る
  person_name   TEXT NOT NULL DEFAULT '',                 -- 写した名前（手入力もここ）
  company_id    TEXT REFERENCES qsheet_tech_companies(id),
  company_name  TEXT NOT NULL DEFAULT '',                 -- 写した会社名
  note          TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_staff_rows_doc
  ON qsheet_tech_staff_rows(tech_doc_id, work_date, sort_order);
-- 参加回数（COUNT DISTINCT (tech_doc_id, work_date)）を人ごとに数えるときに使う
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_staff_rows_person
  ON qsheet_tech_staff_rows(person_id) WHERE person_id IS NOT NULL;

-- ============================================================
-- 盤18枚と、空のパッチ番号 1,536 行（§9-1）
--
-- 番号と段の存在だけは完成図書から確実に読み取れているので機械で入れてよい。
-- 機材名（device_name）は空のまま——人が⑤の画面で外観図を見て転記する。
--   VJP100〜VJP1200 … 48ch・48MCK-H（12枚 × 48 × 2 = 1,152 行）
--   VJP1300〜VJP1600 … 32ch・32MCKA-STS（4枚 × 32 × 2 = 256 行）
--   VJP1700・VJP1800 … 32ch・多芯トランク（2枚 × 32 × 2 = 128 行）
-- 何度流しても増えないよう ON CONFLICT DO NOTHING で冪等にする。
-- ============================================================

INSERT INTO qsheet_patch_panels (id, name, jack_count, kind, location, model, note, sort_order)
VALUES
  ('pp_vjp100',  'VJP100',  48, 'jack',  '第1調整室', '48MCK-H',     '', 1),
  ('pp_vjp200',  'VJP200',  48, 'jack',  '第1調整室', '48MCK-H',     '', 2),
  ('pp_vjp300',  'VJP300',  48, 'jack',  '第1調整室', '48MCK-H',     '', 3),
  ('pp_vjp400',  'VJP400',  48, 'jack',  '第1調整室', '48MCK-H',     '', 4),
  ('pp_vjp500',  'VJP500',  48, 'jack',  '第1調整室', '48MCK-H',     '', 5),
  ('pp_vjp600',  'VJP600',  48, 'jack',  '第1調整室', '48MCK-H',     '', 6),
  ('pp_vjp700',  'VJP700',  48, 'jack',  '第1調整室', '48MCK-H',     '', 7),
  ('pp_vjp800',  'VJP800',  48, 'jack',  '第1調整室', '48MCK-H',     '', 8),
  ('pp_vjp900',  'VJP900',  48, 'jack',  '第1調整室', '48MCK-H',     '', 9),
  ('pp_vjp1000', 'VJP1000', 48, 'jack',  '第1調整室', '48MCK-H',     '', 10),
  ('pp_vjp1100', 'VJP1100', 48, 'jack',  '第1調整室', '48MCK-H',     '', 11),
  ('pp_vjp1200', 'VJP1200', 48, 'jack',  '第1調整室', '48MCK-H',     '', 12),
  ('pp_vjp1300', 'VJP1300', 32, 'jack',  '第1調整室', '32MCKA-STS',  '', 13),
  ('pp_vjp1400', 'VJP1400', 32, 'jack',  '第1調整室', '32MCKA-STS',  '', 14),
  ('pp_vjp1500', 'VJP1500', 32, 'jack',  '第1調整室', '32MCKA-STS',  '', 15),
  ('pp_vjp1600', 'VJP1600', 32, 'jack',  '第1調整室', '32MCKA-STS',  '', 16),
  ('pp_vjp1700', 'VJP1700', 32, 'trunk', '第1調整室', '32MCK',       'TRK1〜32 多芯トランク（AV-1〜AV-9）', 17),
  ('pp_vjp1800', 'VJP1800', 32, 'trunk', '第1調整室', '32MCK',       'TRK1〜32 多芯トランク（AV-1〜AV-9）', 18)
ON CONFLICT DO NOTHING;

-- 空のパッチ番号（id は決め打ち: pj_vjp100_01a … pj_vjp1800_32b）。
-- 盤ごとの ch 数（jack_count）× A/B の2段を generate_series で展開する。
INSERT INTO qsheet_patch_jacks (id, panel_id, jack_no, jack_row)
SELECT 'pj_' || lower(p.name) || '_' || lpad(g.n::text, 2, '0') || lower(r.jrow),
       p.id,
       g.n,
       r.jrow
FROM qsheet_patch_panels p
CROSS JOIN LATERAL generate_series(1, p.jack_count) AS g(n)
CROSS JOIN (VALUES ('A'), ('B')) AS r(jrow)
WHERE p.id LIKE 'pp\_vjp%'
ON CONFLICT DO NOTHING;
