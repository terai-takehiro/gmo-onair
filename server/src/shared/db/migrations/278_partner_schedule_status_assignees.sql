-- 277: パートナースケジュールに「希望日」トグルと「担当者」(複数・任意) を追加
--
-- 背景 (2026-09-05 ご依頼・パートナーの有給):
--   1. 予定の日付が「確定」か「希望日（未確定）」かを分けたい ―― 有給に限らず、
--      代休/出張/社外活動/リモート/その他も含む全種別が対象。studio_bookings.status
--      (confirmed/tentative, 051_schedule_improvements.sql) と同じ2値の CHECK 制約
--      をそのまま流用する。既定は 'confirmed'（既存行はこれまでどおり確定として扱う）。
--   2. スケジュール予定に担当者を複数記入したい（いない場合もある）。登録ユーザーから
--      複数選択のため、project_members (130_project_members.sql) の「中間テーブル」
--      パターンを流用する。ただし対象は常にパートナースケジュール権限を持つ登録
--      ユーザーのみ（外部の方の自由入力は不要）なので、project_members の
--      user_id + member_name の二本立てにはせず user_id 一本にする。

-- 1. 確定/希望日
ALTER TABLE partner_schedules
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

ALTER TABLE partner_schedules DROP CONSTRAINT IF EXISTS partner_schedules_status_check;
ALTER TABLE partner_schedules ADD CONSTRAINT partner_schedules_status_check
  CHECK (status IN ('confirmed', 'tentative')) NOT VALID;

-- 2. 担当者 (複数・0件も可)
CREATE TABLE IF NOT EXISTS partner_schedule_assignees (
  id                  TEXT PRIMARY KEY,
  partner_schedule_id TEXT NOT NULL REFERENCES partner_schedules(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_schedule_assignees_schedule
  ON partner_schedule_assignees(partner_schedule_id);

-- 同じ予定に同じ人を二重登録しない
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_schedule_assignees_user
  ON partner_schedule_assignees(partner_schedule_id, user_id);
