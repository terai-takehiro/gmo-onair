-- 契約一括（billing_cycle='contract_lump_sum'）の請求グループが金額を持てるようにする
-- （docs/design/v4/regular-series.md §3・§6・積み残し3）
--
-- ── なぜ足すか ─────────────────────────────────────────────
--
-- レギュラー案件の金額は本来「回」に付く（`revenues.episode_id`）。だが契約一括は
-- §6 のとおり「案件に1枚。回には金額を持たせない」ため、既存の
-- `invoice_group_episodes` を経由した `SUM(revenues.amount)` では金額を出せない
-- （紐づく回そのものが無い）。この請求グループ1件だけが例外的に金額を自分で持つ。
--
-- ── 単発案件・他の請求サイクルでは使わない値 ───────────────────
--
-- `monthly_close` / `per_recording_date` の請求グループは今までどおり
-- `invoice_group_episodes` 経由の合算が正。この列は NULL のままにしておく
-- （「まだ決めていない」と「0円」を混同しない — shared/CLAUDE.md）。
ALTER TABLE invoice_groups ADD COLUMN IF NOT EXISTS lump_sum_amount NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_groups_lump_sum_amount') THEN
    ALTER TABLE invoice_groups ADD CONSTRAINT chk_invoice_groups_lump_sum_amount
      CHECK (lump_sum_amount IS NULL OR lump_sum_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN invoice_groups.lump_sum_amount IS
  '契約一括（billing_cycle=''contract_lump_sum''）の請求グループが直接持つ金額。'
  '案件に1枚・回には金額を持たせない契約一括の金額。それ以外の請求サイクルでは使わない（NULL）。'
  '一覧・作成・更新・回の紐付け・月末締めの応答すべてで '
  'COALESCE(lump_sum_amount, 回の合算, 0) を total_amount として返す（invoice-groups.routes.ts）';
