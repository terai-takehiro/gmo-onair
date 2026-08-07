-- 機材管理: 貸出の決めごと / 出庫予定 / QR の読み取り履歴 (v4)
--
-- モックの3つを実装するための土台。どれも保存先が無く出せていなかった。

-- ────────────────────────────────────────────────────────────
-- ① 貸出の決めごと (設定タブの6つのスイッチ)
--
-- 値は TEXT の1列に入れる。**設定が1つ増えるたびに列を足す形にしない** —
-- 足すたびにマイグレーションが要り、増やすのが億劫になって画面に嘘の
-- スイッチが並ぶ (いままさにそうなっていた)。
--
-- 数値も真偽値も文字列で持ち、読む側が解釈する。設定は数が少なく、
-- 集計もしないので、型で縛る利点より増やしやすさを採る。
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- 既定値。**画面で1つも触っていなくても、いまの動きと同じになる値**を入れる
-- (入れないと「設定を開いた瞬間に動きが変わった」ことになる)
INSERT INTO equipment_settings (key, value)
SELECT * FROM (VALUES
  ('default_due_days',      '7'),      -- 返却予定日の初期値 (3 / 7 / 14)
  ('overdue_notify',        'next'),   -- 遅延を知らせるタイミング same=当日 / next=翌日 / after3=3日後
  ('allow_external',        'true'),   -- 社外への貸出を許可するか
  ('external_approval',     'false'),  -- 社外貸出に承認を必要とするか
  ('qr_lend_return',        'true'),   -- QR スキャンから貸出・返却を記録するか
  ('block_broken_lending',  'true')    -- 修理中・引退の機材を貸し出せないようにするか
) AS v(key, value)
WHERE NOT EXISTS (SELECT 1 FROM equipment_settings s WHERE s.key = v.key);

-- ────────────────────────────────────────────────────────────
-- ② 出庫予定 (ダッシュボードの「本日・明日の入出庫」)
--
-- `equipment_lendings` は**持ち出した瞬間の記録**で、「これから出す予定」を
-- 持っていなかった。`lent_at` は実際に出した日なので、予定には使えない
-- (使うと「まだ出していないのに貸出中」になる)。
--
-- 予定の行は `status = 'planned'`。**既存の CHECK に値を足す**必要があるので
-- 制約を張り直す。
-- ────────────────────────────────────────────────────────────
ALTER TABLE equipment_lendings ADD COLUMN IF NOT EXISTS planned_out_date TEXT;

ALTER TABLE equipment_lendings DROP CONSTRAINT IF EXISTS equipment_lendings_status_check;
ALTER TABLE equipment_lendings ADD CONSTRAINT equipment_lendings_status_check
  CHECK (status IN ('planned', 'lent', 'returned', 'overdue', 'lost'));

COMMENT ON COLUMN equipment_lendings.planned_out_date IS
  '出庫予定日 YYYY-MM-DD。status=planned のときだけ意味を持つ（まだ持ち出していない）';

CREATE INDEX IF NOT EXISTS idx_equipment_lendings_planned
  ON equipment_lendings(planned_out_date) WHERE status = 'planned';

-- ────────────────────────────────────────────────────────────
-- ③ QR の読み取り履歴
--
-- モックのスキャン画面は「さっき読んだもの」を並べる。履歴を残す表が無かった。
--
-- **見つからなかった読み取りも残す** (`equipment_id` は NULL 可)。
-- 見つかったものだけ残すと、「読めないシールがある」ことに誰も気づけない。
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_scans (
  id            TEXT PRIMARY KEY,
  -- 読み取った文字列そのもの。**加工前**を残す（読めない原因を追うため）
  raw_code      TEXT NOT NULL,
  -- 突き合わせられた機材。見つからなければ NULL
  equipment_id  TEXT REFERENCES equipment_items(id),
  -- 何のために読んだか lookup=見るだけ / lend=貸出 / return=返却 / inventory=棚卸し
  action        TEXT NOT NULL DEFAULT 'lookup'
                CHECK (action IN ('lookup', 'lend', 'return', 'inventory')),
  scanned_by    TEXT,
  scanned_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_scans_recent
  ON equipment_scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_scans_by_user
  ON equipment_scans(scanned_by, scanned_at DESC);
