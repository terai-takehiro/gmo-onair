-- 279: スタジオ予約に「担当者」(複数・任意) を追加
--
-- 背景 (2026-09-05 ご依頼):
--   パートナースケジュール (278_partner_schedule_status_assignees.sql・PR #564) に
--   続き、スタジオ予約にも同じ「担当者」機能が無いとご指摘があった。
--
--   スタジオ予約は既に studio_booking_rooms.occupant（部屋ごとの自由入力・
--   qsheet_schedule_items.assignee と同じ「社外の方も入るため users を指さない」
--   設計）を持つが、これは「その部屋を今使っている人」という別の情報であり、
--   登録ユーザーへの参照ではない。ここで足す「担当者」は予約全体に対する
--   実務の割り当ての補助情報で、partner_schedule_assignees と同型の
--   「予約(booking)単位・登録ユーザーのみ・複数・0件も可」の中間テーブルにする
--   （studio_booking_rooms のような複合PKのみの簡素な形は真似ない — 並び順を
--   保持したいので id + sort_order を持つ partner_schedule_assignees 側を踏襲）。

CREATE TABLE IF NOT EXISTS studio_booking_assignees (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES studio_bookings(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_booking_assignees_booking
  ON studio_booking_assignees(booking_id);

-- 同じ予約に同じ人を二重登録しない
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_booking_assignees_user
  ON studio_booking_assignees(booking_id, user_id);
