-- 見積の明細に「終了日」を足す (v4 見積の改善要望)
--
-- ── なぜ列が要るか ──────────────────────────────────────────
--
-- migration 194 で足した `item_date` は開始日1つだけで、複数日にわたる利用
-- （例: スタジオを3日間借りる・機材を数日貸し出す）を1行の期間として
-- 表せなかった（開始日しか入れられず、終了日は書けなかった）。
--
-- **`item_date_end`（日付のみ・任意）を足す。** `item_date`（開始日）は
-- 削除・リネームしない（後方互換 — 既存の見積・PDFはこれまでどおり
-- 「単日 or 案件全体の日付」として動く）。単日の行は `item_date_end` を
-- 入れず `item_date` だけで表す（従来どおりの挙動を維持）。
--
-- CHECK は「終了日が開始日より前」だけを防ぐ緩いものにする。開始日を
-- 入れずに終了日だけ入れる行までは禁止しない（画面は開始日を先に埋める
-- 作りだが、サーバー側で無理に縛ると将来の入力順を狭めてしまうため）。

ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS item_date_end DATE;

ALTER TABLE estimate_items DROP CONSTRAINT IF EXISTS estimate_items_date_range_check;
ALTER TABLE estimate_items ADD CONSTRAINT estimate_items_date_range_check
  CHECK (item_date IS NULL OR item_date_end IS NULL OR item_date_end >= item_date);
