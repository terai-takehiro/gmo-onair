-- ============================================================
-- 273: 仮押さえに「何番手か」を持たせる
--
-- ── なぜ要るか ──────────────────────────────────────────────
-- 同じ部屋・同じ時間帯を複数の案件が仮押さえで取り合うことがある
-- （studio_bookings には一意制約が無く、同一枠に複数の tentative 予約が
-- 存在すること自体はもともと妨げない設計）。営業が「うちは2番手」を
-- 把握できるよう、仮押さえ (status='tentative') に番手を持たせる。
--
-- ── 設計判断: 手入力・単独の整数列（自動算出・自動繰り上げはしない）───
-- 「何番手か」は本来、同じ枠を取り合う仮押さえどうしの相対順位であり
-- 単一行が独立に持てる値ではない。だが自動算出（同一部屋・重なる期間の
-- 既存 tentative 件数から算出）にすると、先着が確定/削除されたときに
-- 後続の番手を自動で繰り上げるかどうかという別の問題が増え、
-- 「データの正がどちらか」が二重化する。
-- ここでは**人が都度手入力する値**として持たせるだけにとどめる
-- （番手が変わったら人が直す）。既存の仮押さえは全て NULL＝「番手を決めていない」
-- のままとし（244 の possible_duplicate と同じく、既存行を書き換えない）、
-- 0 を既定値にしない（「NULL＝決めていない」と 0 を混ぜない — CLAUDE.md）。
ALTER TABLE studio_bookings ADD COLUMN IF NOT EXISTS hold_rank INTEGER;

ALTER TABLE studio_bookings DROP CONSTRAINT IF EXISTS studio_bookings_hold_rank_check;
ALTER TABLE studio_bookings ADD CONSTRAINT studio_bookings_hold_rank_check
  CHECK (hold_rank IS NULL OR hold_rank > 0) NOT VALID;
