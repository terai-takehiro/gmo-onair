-- ============================================================
-- 237: 計時・視聴者（liveops）を「独自作成の番組」（qsheet_programs）にも対応させる
--
-- 経緯: client-techops で案件（GLS案件）に紐づけない「番組（マニュアル）」
-- （migration 227 `qsheet_programs`）を作ると、ミニアプリのタイル自体が出ず
-- （`MiniAppTiles.tsx` が `scope === "project"` のときだけ計時・視聴者を出していた）、
-- 直URLで開いても `useLiveProgram.ts` が `owner.kind !== 'project'` を弾いて
-- 開けなかった（12-live-timer-decision.md §3-5「既知の空白」・ユーザー指摘で対応）。
--
-- `liveops_programs.project_id` は `projects` テーブルのみを参照するFKで、
-- `qsheet_programs` に対応する列が無かったのが根本原因。227 と同じ形で
-- `qsheet_program_id` を足す。
--
-- ⚠️ 227 の収録設定・配信設定（`num_nonnulls(...) = 1`）とは違い、
-- `liveops_programs` は「案件にも番組にも紐づかないスタンドアロン」行
-- （旧セッション一覧で作られた既存データ。`LiveLegacyProgramsPage.tsx` が
-- 読む）を残す設計のため、3択どれか1つを強制する CHECK にはしない。
-- 「project_id と qsheet_program_id を同時には持たない」ことだけを強制する。
-- ============================================================

ALTER TABLE liveops_programs
  ADD COLUMN IF NOT EXISTS qsheet_program_id TEXT REFERENCES qsheet_programs(id) ON DELETE SET NULL;

ALTER TABLE liveops_programs DROP CONSTRAINT IF EXISTS liveops_programs_owner_ck;
ALTER TABLE liveops_programs
  ADD CONSTRAINT liveops_programs_owner_ck
  CHECK (project_id IS NULL OR qsheet_program_id IS NULL);

-- 1つの番組（マニュアル）につき liveops_programs は1件（migration 221 の
-- `liveops_programs_project_key` と同じ形）。新設の列なので既存重複の心配は無い。
CREATE UNIQUE INDEX IF NOT EXISTS liveops_programs_qsheet_program_key
  ON liveops_programs (qsheet_program_id)
  WHERE qsheet_program_id IS NOT NULL AND deleted_at IS NULL;
