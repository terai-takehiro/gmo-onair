-- ============================================================
-- 087: 経理データ取込み Phase 1 — Layer A (生データ保存層)
--
-- 設計方針 (Phase 0 レビュー結論: A 案):
--   - 経理 CSV 原本は不変アーカイブとして本表に保持
--   - Phase 2 で ETL 解決後、既存 revenues/purchases/sga_expenses に
--     source='accounting' で INSERT する (本マイグレーションで source 列追加)
--   - 編集はあくまで既存テーブル側。生データは触らない
--
-- 既存テーブルへの影響: revenues / purchases に source 列を追加 (DEFAULT 'staff')
-- = 既存行はすべて 'staff' になる = 既存挙動を破壊しない
-- ============================================================

-- ------------------------------------------------------------
-- 1. 取込みバッチ管理
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_import_batches (
  id                  TEXT PRIMARY KEY,                       -- uuid
  period_ym           CHAR(7) NOT NULL,                       -- 'YYYY-MM'
  source_type         TEXT NOT NULL
                      CHECK (source_type IN ('pl_trial_balance','general_ledger')),
  source_filename     TEXT NOT NULL,                          -- アップロード時の元ファイル名
  source_file_hash    TEXT NOT NULL,                          -- SHA-256 (冪等性チェック)
  source_file_bytea   BYTEA,                                  -- CP932 原本 (オプション、~200KB/月想定)
  source_box_file_id  TEXT,                                   -- Box ミラー (Phase 2 以降で実装)
  row_count           INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'staged'
                      CHECK (status IN ('staged','confirmed','superseded')),
  superseded_by       TEXT REFERENCES accounting_import_batches(id),
  imported_by         TEXT REFERENCES users(id),
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ,
  notes               TEXT
);

-- 同一ファイル (同じハッシュ) は同一 source_type + period_ym で 1 度しか staged にしない
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_batches_idem
  ON accounting_import_batches (source_type, period_ym, source_file_hash)
  WHERE status <> 'superseded';

CREATE INDEX IF NOT EXISTS idx_accounting_batches_period
  ON accounting_import_batches (period_ym);
CREATE INDEX IF NOT EXISTS idx_accounting_batches_status
  ON accounting_import_batches (status);

COMMENT ON TABLE accounting_import_batches IS '経理 CSV 取込みバッチ管理。staged → confirmed の 2 段階フロー。再取込み時は旧バッチを superseded に遷移';

-- ------------------------------------------------------------
-- 2. 損益計算書 (P/L) 生データ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_pl_lines_raw (
  id                  BIGSERIAL PRIMARY KEY,
  batch_id            TEXT NOT NULL REFERENCES accounting_import_batches(id) ON DELETE CASCADE,
  row_index           INTEGER NOT NULL,                       -- CSV 内の物理行番号 (1-based)
  level               SMALLINT NOT NULL                       -- 0=大分類見出し / 1=勘定科目 / 2=補助科目 / 3=集計行
                      CHECK (level BETWEEN 0 AND 3),
  category_label      TEXT,                                   -- 大分類名 ("売上高" "売上原価" 等)
  account_code        TEXT,                                   -- 勘定コード (4 桁数字、e.g. "5000")
  account_name        TEXT,                                   -- 勘定名 ("売上高")
  sub_account_code    TEXT,                                   -- 補助コード (4 桁数字)
  sub_account_name    TEXT,                                   -- 補助名
  detail_code         TEXT,                                   -- 細目コード (二段表記の ":100 GP" 等の "100")
  detail_name         TEXT,                                   -- 細目名
  total_label         TEXT,                                   -- 集計行ラベル ("売上原価合計" 等)
  opening_balance     BIGINT NOT NULL DEFAULT 0,              -- 開始月残高
  period_debit        BIGINT NOT NULL DEFAULT 0,              -- 期間借方
  period_credit       BIGINT NOT NULL DEFAULT 0,              -- 期間貸方
  closing_balance     BIGINT NOT NULL DEFAULT 0,              -- 終了月残高
  composition_ratio   NUMERIC(8,2),                           -- 構成比 (参考保持、再計算可、100% 超過あり)
  raw_row             JSONB                                   -- 元 CSV 行をそのまま (デバッグ用)
);

CREATE INDEX IF NOT EXISTS idx_pl_lines_batch ON accounting_pl_lines_raw (batch_id);
CREATE INDEX IF NOT EXISTS idx_pl_lines_account ON accounting_pl_lines_raw (account_code, sub_account_code) WHERE account_code IS NOT NULL;

COMMENT ON TABLE accounting_pl_lines_raw IS '損益計算書 + 残高試算表 CSV の生データ。1 CSV 行 = 1 レコード、編集禁止';

-- ------------------------------------------------------------
-- 3. 総勘定元帳 生データ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_ledger_entries_raw (
  id                       BIGSERIAL PRIMARY KEY,
  batch_id                 TEXT NOT NULL REFERENCES accounting_import_batches(id) ON DELETE CASCADE,
  voucher_no               TEXT NOT NULL,                     -- 取引 No (複合仕訳で重複あり)
  line_seq                 INTEGER NOT NULL,                  -- 同一 voucher_no 内での行連番 (取込時採番)
  transaction_date         DATE NOT NULL,
  account_code             TEXT,                              -- 勘定コード (e.g. "1101")
  account_name             TEXT,
  sub_account_code         TEXT,
  sub_account_name         TEXT,
  counter_account_code     TEXT,                              -- 相手勘定コード
  counter_account_name     TEXT,
  counter_sub_code         TEXT,
  counter_sub_name         TEXT,
  counter_vendor_raw       TEXT,                              -- 相手取引先生文字列 ("201414 GMOあおぞらネット銀行株式会社" 等)
  tax_category             TEXT,                              -- 税区分 ('対象外'/'共-課仕 10%'/'課仕 10%'/'課売 10%'/'課仕 (軽)8%'/'共-課仕 (軽)8%')
  counter_tax_category     TEXT,
  invoice_flag             TEXT,                              -- インボイス区分 ('80%控除' のみ実例あり)
  counter_invoice_flag     TEXT,
  description              TEXT,                              -- 摘要 (GLS / XP 抽出元)
  debit                    BIGINT NOT NULL DEFAULT 0,
  credit                   BIGINT NOT NULL DEFAULT 0,
  running_balance          BIGINT,
  memo                     TEXT,                              -- セル内改行 (\n) を含む可
  tag_raw                  TEXT,                              -- "9999 該当なし" 等の生タグ
  extracted_gls_codes      TEXT[],                            -- 摘要から抽出した GLS 番号配列 (正規化済: GLS127 等)
  extracted_xp_codes       TEXT[],                            -- 摘要から抽出した XP 番号配列 (XP128221 等)
  raw_row                  JSONB                              -- 元 CSV 行 (18 列をそのまま)
);

CREATE INDEX IF NOT EXISTS idx_ledger_batch ON accounting_ledger_entries_raw (batch_id);
CREATE INDEX IF NOT EXISTS idx_ledger_voucher ON accounting_ledger_entries_raw (voucher_no);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON accounting_ledger_entries_raw (transaction_date);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON accounting_ledger_entries_raw (account_code) WHERE account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_gls_gin ON accounting_ledger_entries_raw USING GIN (extracted_gls_codes);
CREATE INDEX IF NOT EXISTS idx_ledger_xp_gin  ON accounting_ledger_entries_raw USING GIN (extracted_xp_codes);

COMMENT ON TABLE accounting_ledger_entries_raw IS '総勘定元帳 CSV の生データ。voucher_no + line_seq で 1 行一意化';

-- ------------------------------------------------------------
-- 4. 既存テーブルへの source 列追加 (A 案の中核)
--    sga_expenses.source は既に存在するため触らない (migration 001b)
-- ------------------------------------------------------------
ALTER TABLE revenues
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'
  CHECK (source IN ('staff','accounting'));
COMMENT ON COLUMN revenues.source IS 'データソース: staff=スタッフ起票 / accounting=経理 CSV 由来';

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'
  CHECK (source IN ('staff','accounting'));
COMMENT ON COLUMN purchases.source IS 'データソース: staff=スタッフ起票 / accounting=経理 CSV 由来';

-- Phase 2 で ETL が書き込む際の逆引きキー
ALTER TABLE revenues
  ADD COLUMN IF NOT EXISTS accounting_ledger_entry_id BIGINT
    REFERENCES accounting_ledger_entries_raw(id);
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS accounting_ledger_entry_id BIGINT
    REFERENCES accounting_ledger_entries_raw(id);
ALTER TABLE sga_expenses
  ADD COLUMN IF NOT EXISTS accounting_ledger_entry_id BIGINT
    REFERENCES accounting_ledger_entries_raw(id);

CREATE INDEX IF NOT EXISTS idx_revenues_source ON revenues(source) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_source ON purchases(source) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_ledger_entry ON revenues(accounting_ledger_entry_id) WHERE accounting_ledger_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_ledger_entry ON purchases(accounting_ledger_entry_id) WHERE accounting_ledger_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sga_ledger_entry ON sga_expenses(accounting_ledger_entry_id) WHERE accounting_ledger_entry_id IS NOT NULL;
