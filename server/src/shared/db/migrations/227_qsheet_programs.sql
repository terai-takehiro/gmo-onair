-- ============================================================
-- 227: 制作技術支援 — 番組（マニュアル・案件管理外）
--
-- 制作技術支援トップの選び方は「① 案件管理で管理している番組・イベント（GLS案件）を
-- 選ぶ」か「② 案件管理に無い、ここだけの番組（マニュアル）を選ぶ」の2択にする
-- （2026-08-22 ご指示）。② の受け皿として、案件（projects）とは別の軽い入れ物
-- `qsheet_programs` を作る。進行台本・スケジュール表・収録設定・配信設定は
-- project_id と同じ扱いで program_id を持てるようにする（唯一の正は
-- server/src/contexts/qsheet/device-settings-owner.ts の `Owner` 型）。
--
-- ⚠️ 既存の「案件に紐づかない資料」（project_id も program_id も NULL・doc_no だけで
--    口頭の番号を持つ）は消さない。programs はその上位互換ではなく別の軸
--    （1つの番組の下に複数の資料・スケジュール表・機器設定をまとめる入れ物）。
-- ============================================================

CREATE TABLE IF NOT EXISTS qsheet_programs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  event_date  DATE,
  notes       TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qsheet_programs_event_date
  ON qsheet_programs(event_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_programs_created_at
  ON qsheet_programs(created_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 進行台本・スケジュール表・収録設定・配信設定に program_id を足す
-- ============================================================

ALTER TABLE qsheet_documents
  ADD COLUMN IF NOT EXISTS program_id TEXT REFERENCES qsheet_programs(id) ON DELETE CASCADE;
ALTER TABLE qsheet_schedules
  ADD COLUMN IF NOT EXISTS program_id TEXT REFERENCES qsheet_programs(id) ON DELETE CASCADE;
ALTER TABLE qsheet_recording_settings
  ADD COLUMN IF NOT EXISTS program_id TEXT REFERENCES qsheet_programs(id) ON DELETE CASCADE;
ALTER TABLE qsheet_streaming_settings
  ADD COLUMN IF NOT EXISTS program_id TEXT REFERENCES qsheet_programs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_qsheet_documents_program
  ON qsheet_documents(program_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_program
  ON qsheet_schedules(program_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_recording_program
  ON qsheet_recording_settings(program_id, service_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_streaming_program
  ON qsheet_streaming_settings(program_id, service_date) WHERE deleted_at IS NULL;

-- ── 収録設定・配信設定: owner の CHECK を「project_id / doc_no / program_id のどれか1つ」に広げる ──
--
-- num_nonnulls() は Postgres 組み込み関数（渡した引数のうち NULL でない個数を返す）。
-- 従来の2択 CHECK ((project_id IS NULL) <> (doc_no IS NULL)) を3択に拡張する。
ALTER TABLE qsheet_recording_settings DROP CONSTRAINT IF EXISTS qsheet_rec_owner_ck;
ALTER TABLE qsheet_recording_settings
  ADD CONSTRAINT qsheet_rec_owner_ck
  CHECK (num_nonnulls(project_id, doc_no, program_id) = 1);

ALTER TABLE qsheet_streaming_settings DROP CONSTRAINT IF EXISTS qsheet_stream_owner_ck;
ALTER TABLE qsheet_streaming_settings
  ADD CONSTRAINT qsheet_stream_owner_ck
  CHECK (num_nonnulls(project_id, doc_no, program_id) = 1);

-- ⚠️ 一意キーも3択に広げる。COALESCE(project_id, doc_no) のままだと program_id だけの
--    行は鍵が常に NULL になり、Postgres は UNIQUE で NULL 同士を衝突させないため
--    「同じ番組・同じ日」の重複行を防げなくなる（実際に検証して見つけた）。
DROP INDEX IF EXISTS qsheet_recording_key;
CREATE UNIQUE INDEX IF NOT EXISTS qsheet_recording_key
  ON qsheet_recording_settings (COALESCE(project_id, doc_no, program_id), service_date)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS qsheet_streaming_key;
CREATE UNIQUE INDEX IF NOT EXISTS qsheet_streaming_key
  ON qsheet_streaming_settings (COALESCE(project_id, doc_no, program_id), service_date)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 制作のジャーニーの人のピン（production_journey_marks）にも 'program' を許す
-- ============================================================
ALTER TABLE production_journey_marks DROP CONSTRAINT IF EXISTS production_journey_marks_scope_type_check;
ALTER TABLE production_journey_marks
  ADD CONSTRAINT production_journey_marks_scope_type_check
  CHECK (scope_type IN ('project', 'document', 'program'));
