-- 292: 「入ってきた情報」に行き先「カレンダーに登録する」を足す
--
-- 背景 (2026-09-07 ご依頼):
--   受信箱の1件（例: 現地調査の日程共有）は、タスクでも案件でもなく
--   「スタジオ予約（カレンダー）に1件登録したいだけ」ということがある。
--   いまの行き先は タスク / 案件 / 保留 / 見送り の4つで、この形が無い。
--
--   `ticket`（`task_id`）/ `project`（`project_id`）と同じ設計を踏襲する —
--   「実体（studio_bookings の予約）を作ったときだけ入る」state。
--   ここから予約は作らず（案件登録モーダルを再現しないのと同じ理由で
--   `StudioBookingDialog.tsx` の全項目は真似ない）、最小限の項目
--   （タイトル・日時・場所メモ）で `studioBookingService.createBooking()` を
--   直接呼ぶだけの薄い作りにする（inbox.service.ts 側）。

ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS booking_id TEXT REFERENCES studio_bookings(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_misc_inquiries_state') THEN
    ALTER TABLE misc_inquiries DROP CONSTRAINT chk_misc_inquiries_state;
  END IF;
  ALTER TABLE misc_inquiries ADD CONSTRAINT chk_misc_inquiries_state
    CHECK (state IN ('unsorted', 'stock', 'ticket', 'project', 'dropped', 'booked'));
END $$;

COMMENT ON COLUMN misc_inquiries.booking_id IS
  'カレンダーに登録して出来た studio_bookings.id。task_id/project_id と同じく「押し直しても増やさない」ための印';
COMMENT ON COLUMN misc_inquiries.state IS
  '行き先 unsorted/stock/ticket/project/dropped/booked。**絞り込みはこの列だけを見る** (handled_at は記録用)';
