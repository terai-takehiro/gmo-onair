-- スケジュール表の表示間隔（slot_min）。5分刻みは細かすぎて見づらいという指摘への対応。
-- ① 60分を選べるようにする（従来は 5/10/15/30 のみ） ② 新規作成時の既定値を 5→15 に上げる。
-- 既存の行の slot_min はそのまま（画面のセレクタでいつでも変えられる。データの並びには影響しない
-- — slot_min はグリッド描画の刻みでしかなく、項目の start_min/end_min は変わらない）。
ALTER TABLE qsheet_schedules ALTER COLUMN slot_min SET DEFAULT 15;
ALTER TABLE qsheet_schedules DROP CONSTRAINT IF EXISTS qsheet_schedules_slot_min_check;
ALTER TABLE qsheet_schedules ADD CONSTRAINT qsheet_schedules_slot_min_check CHECK (slot_min IN (5, 10, 15, 30, 60));
