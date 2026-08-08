-- お金のルール — v4 設定 ⑤
--
-- ── どの単位で決めるか ──────────────────────────────────────
--
-- モックが答えを書いています:
--   「案件ごとに書き換えず、**例外は取引先ごとの設定**で持ちます」
--   「入金の期限 ／ 翌月末 ／ **得意先ごとに個別設定があればそちらが優先**」
-- なので **会社ぜんぶで1本 ＋ 取引先ごとに例外**。案件ごとには持ちません。
--
-- ── 1行しか持たない表にする ─────────────────────────────────
--
-- 項目ごとの key/value にすると、読むたびに「この鍵はあるか」「値の型は何か」を
-- 気にすることになり、綴りを間違えても気づけません。**列で持ちます**。
-- `id = 'default'` の 1 行だけを使い、CHECK で他の id を作れなくしています。
--
-- ── 端数を四捨五入から切り捨てに変える ───────────────────────
--
-- モックは「端数の扱い ／ 切り捨て」。いまのコードは `Math.round` (四捨五入)。
-- **今後つくる見積・請求の税額が最大 1 円下がります**
-- (すでに出した書類の金額は 1 円も動きません — 保存済みの値を読むだけなので)。
--
-- ── 値引きの上限は役割ごと ──────────────────────────────────
--
-- migration 174 で入れた `permission_roles` に紐づけます。役割を消しても
-- 上限だけ残るとどの役割のものか分からなくなるので削除連鎖させます。

CREATE TABLE IF NOT EXISTS money_rules (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),

  -- ── 締めと支払 ────────────────────────────────────────────
  -- 締め日・支払日は **31 = 末日**。2月に 31 が無い月は月末に丸めます
  -- (「31日締め」と書いて 2 月だけ締めが無くなる、を防ぐ)
  closing_day            INTEGER NOT NULL DEFAULT 31 CHECK (closing_day BETWEEN 1 AND 31),
  -- 入金の期限 = 締め月の `payment_months` か月後の `payment_day`
  payment_months         INTEGER NOT NULL DEFAULT 1 CHECK (payment_months BETWEEN 0 AND 6),
  payment_day            INTEGER NOT NULL DEFAULT 31 CHECK (payment_day BETWEEN 1 AND 31),
  -- 仕入の支払日 (こちらが払う側)
  purchase_payment_months INTEGER NOT NULL DEFAULT 1 CHECK (purchase_payment_months BETWEEN 0 AND 6),
  purchase_payment_day    INTEGER NOT NULL DEFAULT 25 CHECK (purchase_payment_day BETWEEN 1 AND 31),
  -- 支払日が休業日のとき前へ寄せるか後ろへ寄せるか。休業日の表は
  -- migration 176 (休日・営業時間) で入るので、それまでは丸めません
  payment_holiday_shift  TEXT NOT NULL DEFAULT 'before' CHECK (payment_holiday_shift IN ('before', 'after', 'none')),
  -- 請求書の発行日。**自動で下書きは作りません**（決めごと）。
  -- 画面に「いつ出すか」を書いておくためだけの値
  invoice_issue_rule     TEXT NOT NULL DEFAULT 'next_business_day'
                           CHECK (invoice_issue_rule IN ('closing_day', 'next_business_day', 'manual')),

  -- ── 消費税 ────────────────────────────────────────────────
  -- 税率そのものは税区分 (tax10 / tax8 / 非課税 / 不課税) が持つので、
  -- ここに置くのは**標準税率が何%か**だけ。軽減税率は品目側で選びます
  standard_tax_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.10 CHECK (standard_tax_rate BETWEEN 0 AND 1),
  tax_unit               TEXT NOT NULL DEFAULT 'document' CHECK (tax_unit IN ('document', 'item')),
  -- **既定を切り捨てにする**（モックの指定・ご判断）。いままでは四捨五入だった
  tax_rounding           TEXT NOT NULL DEFAULT 'floor' CHECK (tax_rounding IN ('floor', 'round', 'ceil')),
  estimate_display       TEXT NOT NULL DEFAULT 'excluded' CHECK (estimate_display IN ('excluded', 'included')),

  -- ── 通貨と単位 ────────────────────────────────────────────
  currency               TEXT NOT NULL DEFAULT 'JPY' CHECK (currency = 'JPY'),
  amount_unit            INTEGER NOT NULL DEFAULT 1 CHECK (amount_unit IN (1, 10, 100, 1000)),
  labor_unit             TEXT NOT NULL DEFAULT 'person_day' CHECK (labor_unit IN ('person_day', 'person_hour')),

  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by             TEXT
);

INSERT INTO money_rules (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ── 取引先ごとの例外 ────────────────────────────────────────
--
-- **NULL = 会社のルールに従う**。0 や 31 を既定値として入れないこと —
-- 「決めていない」と「0 か月後と決めた」が区別できなくなります。

ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_months INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_day    INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS closing_day    INTEGER;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_months INTEGER;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_day    INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_payment_day_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_payment_day_check
      CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_closing_day_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_closing_day_check
      CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_payment_day_check') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_payment_day_check
      CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31);
  END IF;
END $$;

-- ── 値引きの上限（役割ごと）────────────────────────────────
--
-- 行が無い役割は「上限なし」ではなく **「見積を作れない」でもない**。
-- 判定しない = 制限なしにすると、役割を足しただけで無制限の人が生まれます。
-- 逆に「作れない」にすると、役割を足した瞬間その人が見積を出せなくなります。
-- **行が無い = 会社のルール（上限なし）** とし、画面で必ず一覧に出して
-- 「決めていない役割がある」ことが見えるようにします。

CREATE TABLE IF NOT EXISTS role_discount_limits (
  role_id      TEXT PRIMARY KEY REFERENCES permission_roles(id) ON DELETE CASCADE,
  -- NULL = 上限なし。0.20 = 20%
  max_rate     NUMERIC(5,4) CHECK (max_rate IS NULL OR max_rate BETWEEN 0 AND 1),
  -- NULL = 上限なし。承認なしで出せる額
  max_amount   BIGINT CHECK (max_amount IS NULL OR max_amount >= 0),
  -- 超えたときに承認する役割。NULL = 承認者を決めていない
  approver_role_id TEXT REFERENCES permission_roles(id) ON DELETE SET NULL,
  -- 見積そのものを作らせない役割（モックの「制作・技術 … 見積は作れません」）
  can_estimate BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- モックの limits をそのまま初期値に
INSERT INTO role_discount_limits (role_id, max_rate, max_amount, approver_role_id, can_estimate) VALUES
  ('role-admin',     NULL,   NULL,      NULL,             TRUE),
  ('role-sales-mgr', 0.20,   5000000,   'role-admin',     TRUE),
  ('role-sales',     0.10,   1500000,   'role-sales-mgr', TRUE),
  ('role-prod',      NULL,   NULL,      NULL,             FALSE),
  ('role-account',   NULL,   NULL,      NULL,             FALSE)
ON CONFLICT (role_id) DO NOTHING;

-- ── 見積の「承認待ち」──────────────────────────────────────
--
-- 上限を超えても**保存は止めません**（モック:「保存はできますが承認待ちに
-- なり、お客様に出せません」）。止めるのは送付だけ。
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approval_state TEXT NOT NULL DEFAULT 'none'
  CHECK (approval_state IN ('none', 'pending', 'approved'));
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
