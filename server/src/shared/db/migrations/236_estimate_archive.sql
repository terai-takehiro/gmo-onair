-- 見積の版を「アーカイブ」する (v4 見積の改善要望)
--
-- ── なぜ列が要るか ──────────────────────────────────────────
--
-- 版を重ねるほど `estimates` の一覧（案件詳細の見積タブ）に古い版が並び、
-- 実務で見たい版（最新の draft・sent）が埋もれる。かといって古い版は
-- **記録として残す決めごと**（`remove` は draft だけしか消せない）ので、
-- 「消す」ではなく「一覧から隠す」操作が要る。
--
-- **`archived_at`（アーカイブした日時・任意）を足す。** `status` には混ぜない
-- （`EstimateStatus` は承認・送付・受注可否など多くの分岐の根拠になっており、
-- そこに `archived` を足すと「アーカイブ済みの sent」のような組み合わせを
-- 既存の分岐（`update`/`approve`/`convertToRevenue`/PDF発行）全部で考え直す
-- ことになる）。アーカイブは**一覧に出すかどうかだけ**を決める直交した印で、
-- `status` はアーカイブしても変えない（アーカイブした `sent` はそのまま `sent`）。

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
