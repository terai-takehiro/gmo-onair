-- ============================================================
-- 220: 収録設定・配信設定（機器設定）
--
-- 案件（または資料単体）＋実施日で1セット。明細は JSONB。
-- ⚠️ qsheet_documents.data（JSONB）には入れない。あちらは Yjs の所有物で、
--    collab.persist が3秒ごとに丸ごと上書きするため、サーバーが書いても消える。
--    設定は同時編集しないので Y.Doc を通す理由が無い
--    （docs/design/v4/qsheet-v4-coding/08-recording-streaming.md §2）。
--
-- docs/design/v4/qsheet-v4-coding/impl/08-recording-streaming-impl.md §3-4 の
-- とおり、設計書（08 §2）の DDL から4点変えている:
--   1. service_date は NOT NULL（NULL可だと一意インデックスの鍵として効かず、
--      同じ案件で「日付なし」の行を何行でも作れてしまう）
--   2. owner の CHECK は「どちらか一方」(project_id と doc_no の両方入りを禁止)
--   3. TIMESTAMPTZ ではなく TIMESTAMP（既存の qsheet / liveops の表と揃える）
--   4. users への FK は ON DELETE SET NULL（既定の NO ACTION だと退職者を消せない）
-- ============================================================

CREATE TABLE IF NOT EXISTS qsheet_recording_settings (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  doc_no            TEXT,                      -- 案件に紐づかない資料単体のとき（doc_no は qsheet_documents への FK を張らない。§10-6）
  service_date      DATE NOT NULL,
  decks             JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_exported_at  TIMESTAMP,
  last_exported_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_export_name  TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMP,
  CONSTRAINT qsheet_rec_owner_ck
    CHECK ((project_id IS NULL) <> (doc_no IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS qsheet_recording_key
  ON qsheet_recording_settings (COALESCE(project_id, doc_no), service_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS qsheet_streaming_settings (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  doc_no            TEXT,
  service_date      DATE NOT NULL,
  destinations      JSONB NOT NULL DEFAULT '[]'::jsonb,
  meetings          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- WEB会議。⚠️ Excel には出さない
  last_exported_at  TIMESTAMP,
  last_exported_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_export_name  TEXT,
  key_mode          TEXT NOT NULL DEFAULT 'blank'
                    CHECK (key_mode IN ('blank','plain')),
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMP,
  CONSTRAINT qsheet_stream_owner_ck
    CHECK ((project_id IS NULL) <> (doc_no IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS qsheet_streaming_key
  ON qsheet_streaming_settings (COALESCE(project_id, doc_no), service_date)
  WHERE deleted_at IS NULL;

-- 一覧・ジャーニーの「技術の仕込み」行から引くため
CREATE INDEX IF NOT EXISTS qsheet_recording_project
  ON qsheet_recording_settings (project_id, service_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS qsheet_streaming_project
  ON qsheet_streaming_settings (project_id, service_date) WHERE deleted_at IS NULL;
