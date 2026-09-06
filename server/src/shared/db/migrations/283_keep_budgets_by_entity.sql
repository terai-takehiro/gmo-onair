-- 283: 月次予算・経理の補正値・販管費・償却相当の仕入を「主体別」に持つ（keep-report.md §4・§8）
--
-- ── 何が変わるか ─────────────────────────────────────────────────────
-- 売上・仕入は案件の主体（projects.entity・migration 282）で分かれるが、
-- 販管費と償却相当額は案件に紐づかない。そこで
--   sga_expenses.entity … 既定 gss（決めてほしいこと4: 経理が主体別に分け始めるまでは全額 gss）
--   purchases.entity    … NULL = 案件の主体を使う。FIXED-COGS（償却相当）の仕入だけ明示する
-- を足す。集計は COALESCE(purchases.entity, projects.entity) で主体を決める
-- （`finance/services/monthly-summary.service.ts`）。
--
-- 月次予算（monthly_budgets）と経理の補正値（monthly_actual_overrides）は
-- (year_month, entity) を主キーにし、既存行は gss とみなす。
-- **全体（統合）の目標 ＝ 主体の合計**（主体の予算が無ければ「—」。按分しない）。
--
-- ── 主キーの張り替え ─────────────────────────────────────────────────
-- ADD COLUMN（既定 'gss' で既存行が埋まる）→ 旧 PK を落とす → 複合 PK を張る、の順。
-- 既存行は year_month が一意なので (year_month, 'gss') も重複しない。
-- 二度流れても壊れないよう、複合 PK が既にあれば何もしない。

-- ── 月次予算 ──
ALTER TABLE monthly_budgets
  ADD COLUMN IF NOT EXISTS entity TEXT NOT NULL DEFAULT 'gss' CHECK (entity IN ('gss', 'gscs', 'gig'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'monthly_budgets'::regclass AND contype = 'p' AND array_length(conkey, 1) = 2
  ) THEN
    ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_pkey;
    ALTER TABLE monthly_budgets ADD PRIMARY KEY (year_month, entity);
  END IF;
END $$;

-- ── 経理の補正値 ──
ALTER TABLE monthly_actual_overrides
  ADD COLUMN IF NOT EXISTS entity TEXT NOT NULL DEFAULT 'gss' CHECK (entity IN ('gss', 'gscs', 'gig'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'monthly_actual_overrides'::regclass AND contype = 'p' AND array_length(conkey, 1) = 2
  ) THEN
    ALTER TABLE monthly_actual_overrides DROP CONSTRAINT IF EXISTS monthly_actual_overrides_pkey;
    ALTER TABLE monthly_actual_overrides ADD PRIMARY KEY (year_month, entity);
  END IF;
END $$;

-- ── 販管費（案件に紐づかないので主体を直接持つ。既定 gss）──
ALTER TABLE sga_expenses
  ADD COLUMN IF NOT EXISTS entity TEXT NOT NULL DEFAULT 'gss' CHECK (entity IN ('gss', 'gscs', 'gig'));
COMMENT ON COLUMN sga_expenses.entity IS '事業主体（既定 gss）。経理が主体別に分け始めるまでは全額 gss に載る';

-- ── 仕入（NULL = 案件の主体を使う。FIXED-COGS の償却相当だけ明示）──
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS entity TEXT CHECK (entity IN ('gss', 'gscs', 'gig'));
COMMENT ON COLUMN purchases.entity IS
  '事業主体。NULL = 案件の主体（projects.entity）を使う。FIXED-COGS（償却相当）の仕入だけ明示する';

UPDATE purchases p
   SET entity = 'gss'
  FROM projects pr
 WHERE p.project_id = pr.id AND pr.code = 'FIXED-COGS' AND p.entity IS NULL;
