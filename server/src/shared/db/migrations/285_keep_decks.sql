-- 285: 資料ビルダーの「構成（デッキ）」と版・人の直しの差分（keep-report.md §6・§10）
--
-- ── keep_decks（最新の構成）／ keep_deck_versions（全文の版）────────────
-- 会議日ごとに構成（KeepDeck・`shared/src/keepReport/types.ts`）を1本持つ。
-- 保存のたびに版を1つ進め、全文を keep_deck_versions に残す（切り詰めない・条件1）。
-- `source` は 'auto'（ONAiR が組んだ）か 'human'（人が保存した）。
-- 出力した pptx の Box file id は最新側（keep_decks.exported_*）に持つ。
--
-- ── keep_deck_edits（人の直しの差分）─────────────────────────────────
-- 保存時にサーバーが前の版と比べて自動で作る（条件2）:
--   reorder … ページの並びを変えた   remove … ページを消した    add … ページ・部品を足した
--   override … 文・注記・写真を上書きした   restore … 消したページを戻した
-- 「よく消されるページ」「よく直される注記」を集計して、次回の標準の構成と既定値に
-- 反映する（条件4）。**凍結後の直しだけを数える**（会議直前に数字が動いたときの
-- 注記の直しを AI の誤りとして数えないため。§10 のリスク）。

CREATE TABLE IF NOT EXISTS keep_decks (
  id                   TEXT PRIMARY KEY,
  meeting_date         TEXT NOT NULL UNIQUE CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  pack_id              TEXT REFERENCES keep_report_packs(id),  -- 読んだパック（凍結版）。凍結前は NULL
  deck                 JSONB NOT NULL,                          -- KeepDeck の全文（最新）
  version              INTEGER NOT NULL DEFAULT 1,
  exported_box_file_id TEXT,
  exported_at          TIMESTAMPTZ,
  exported_by          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by           TEXT
);

CREATE TABLE IF NOT EXISTS keep_deck_versions (
  id         TEXT PRIMARY KEY,
  deck_id    TEXT NOT NULL REFERENCES keep_decks(id),
  version    INTEGER NOT NULL,
  deck       JSONB NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('auto', 'human')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (deck_id, version)
);

CREATE TABLE IF NOT EXISTS keep_deck_edits (
  id           TEXT PRIMARY KEY,
  deck_id      TEXT NOT NULL REFERENCES keep_decks(id),
  version      INTEGER NOT NULL,
  page_id      TEXT,
  part_id      TEXT,
  field        TEXT NOT NULL,
  before_value TEXT,
  after_value  TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('reorder', 'remove', 'add', 'override', 'restore')),
  note         TEXT,
  edited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_keep_deck_edits_deck ON keep_deck_edits(deck_id);
