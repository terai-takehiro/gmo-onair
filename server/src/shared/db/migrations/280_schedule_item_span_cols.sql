-- ============================================================
-- 280: スケジュール表の項目に「横串」(列をまたぐ = Excel のセル結合) を追加
-- ============================================================
--
-- 背景 (2026-09-06 ご依頼):
--   「横串となる項目が足せるように。横串はエクセルでいうところのセルの統合のような機能」
--   全体朝礼・昼食・全館停電のように、会場や運営の列をまたいで1本で引きたい項目がある。
--   これまでは列ごとに同じ項目を複製するしかなく、時刻を直すたびに全部直す必要があった。
--
-- 決めごと:
--   span_cols = 1 … 今までどおり自分の列だけ (既定値。既存行は全部これになる)
--   span_cols = N (>=2) … 表示順で自分の列から右へ N 列ぶんを1枚で覆う
--                          (右に足りなければ、ある所までに詰める = 画面側で clamp する)
--   span_cols = 0 … 「全列」。列を足しても減らしても常に表全体を覆う
--                    (N で「今の列数」を焼き込むと、列を1本足した日から横串が途切れるため、
--                     全列だけは数ではなく意味で持つ)
--
-- 上限は 64 (列がそれ以上ある表は無い。異常値で描画が壊れないための歯止め)。
ALTER TABLE qsheet_schedule_items
  ADD COLUMN IF NOT EXISTS span_cols INTEGER NOT NULL DEFAULT 1;

ALTER TABLE qsheet_schedule_items DROP CONSTRAINT IF EXISTS qsheet_schedule_items_span_cols_check;
ALTER TABLE qsheet_schedule_items ADD CONSTRAINT qsheet_schedule_items_span_cols_check
  CHECK (span_cols >= 0 AND span_cols <= 64);
