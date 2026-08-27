-- ============================================================
-- 244: スタジオ予約の重複疑い検知（表記揺らぎ対応）
--
-- ── なぜ要るか ──────────────────────────────────────────────
-- 同じ枠を指す予約が複数の経路（案件ステージ移行での自動生成／MCP＝メール取込・
-- チャット／人の手入力）から別々に作られ、題名の言い回しだけが違う形
-- （「収録」/「本番」・語順違い・全角半角違い）で二重に貼り付くことが多々あった。
-- 完全一致の突合では拾えないため、正規化した題名の類似度で拾う
-- （`server/src/shared/services/bookingDuplicate.ts`）。
--
-- ── 方針は「止めない」（migration 176 の out_of_hours と同じ型）───────
-- 保存そのものは止めない — 締切間際に入れたい予約が入らないと業務が止まる。
-- 疑わしい組に印を残し、あとから一覧（/studios/bookings/possible-duplicates/list）
-- で拾って人が個別に確認する。
--
-- **既定 false で、既存の行は1つも書き換えない。** 遡って印を付けると
-- 「昔から重複していた予約」が大量に一覧へ出て、どれが本当に確認すべきものか
-- 分からなくなる（out_of_hours の教訓をそのまま踏襲）。
ALTER TABLE studio_bookings ADD COLUMN IF NOT EXISTS possible_duplicate BOOLEAN NOT NULL DEFAULT FALSE;
-- 「元」になった既存予約への参照。studio_bookings.id は TEXT（UUID 文字列）
ALTER TABLE studio_bookings ADD COLUMN IF NOT EXISTS possible_duplicate_of TEXT REFERENCES studio_bookings(id) ON DELETE SET NULL;
ALTER TABLE studio_bookings ADD COLUMN IF NOT EXISTS possible_duplicate_reason TEXT;

-- 一覧（あとから拾う用）が毎回全件を読まなくて済むように
CREATE INDEX IF NOT EXISTS idx_studio_bookings_possible_duplicate
  ON studio_bookings(possible_duplicate) WHERE deleted_at IS NULL AND possible_duplicate = TRUE;
