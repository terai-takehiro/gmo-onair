-- 見積を「版が残る」形で持つ (v4 ⑥ 見積・請求タブ)
--
-- ── なぜ `revenues` に相乗りしなかったか (ここが判断の要点) ──────────────
--
-- 最初は `revenues` に `status='estimate'` と版の列を足す案で進めかけました。
-- 「集計は全経路 `status='confirmed'` で絞っている」という前提でしたが、
-- **実際に数えたら誤りでした**。`revenues` を読む 53 か所のうち **41 か所が
-- `status` を見ていません**。たとえばトップページの当月売上は
--
--   SELECT SUM(amount) FROM revenues WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
--
-- で、見積の行を同じ表に入れると**そのまま当月売上に足されます**。
-- 41 か所すべてに絞り込みを足して回る案もありますが、**1 か所漏れるだけで
-- 決算の数字が狂う**ので採りません。
--
-- → **別の表にします。** これなら既存の 41 か所は1行も触らずに済みます。
--
-- ── 版の持ち方 ──────────────────────────────────────────────────
--
-- **1つの見積の版ごとに1行**です (v1 と v2 は別の行)。列に版番号を持たせて
-- 上書きする形にすると、**v1 の中身が残りません** (「送った見積を見返せる」が
-- 今回の要件そのもの)。同じ見積の版どうしは `group_id` で束ねます。
--
--   group_id  = 「この見積」の識別子。v1 も v2 も同じ値
--   version   = 1, 2, 3 …
--   status    = draft 作成中 / sent 送付済 / accepted 受注 / rejected 失注 / superseded 次の版に置き換え
--
-- **確定したら売上 (`revenues`) に変換します。** 見積の表は変換後も残るので、
-- 「いくらで出して、いくらで決まったか」が後から追えます。

CREATE TABLE IF NOT EXISTS estimates (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id),

  -- 版。同じ見積の版どうしは group_id が同じ
  group_id      TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,

  title         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'superseded')),

  -- 税区分は売上と同じ集合にする (`tax-category.service` が正)
  tax_category  TEXT NOT NULL DEFAULT 'tax10',
  -- 明細の合計 (税抜)。明細を保存するたびに書き直す
  subtotal      INTEGER NOT NULL DEFAULT 0,
  -- 値引きは**単価を下げず別建て** (docs/design/v4/_rules.md「フォームの決めごと」)
  discount      INTEGER NOT NULL DEFAULT 0,

  valid_until   TEXT,           -- 見積の有効期限 (YYYY-MM-DD)
  sent_at       TIMESTAMP,      -- お客様に出した日時
  decided_at    TIMESTAMP,      -- 受注 / 失注が決まった日時
  -- 受注して売上に変換したときの行 (追えるようにしておく)
  revenue_id    TEXT REFERENCES revenues(id),
  notes         TEXT,

  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TIMESTAMP
);

-- 同じ見積の同じ版が2つできないようにする (版を上げる処理が二重に走ると起きる)
CREATE UNIQUE INDEX IF NOT EXISTS uq_estimates_group_version
  ON estimates (group_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_project
  ON estimates (project_id) WHERE deleted_at IS NULL;

-- 明細。**`revenue_items` と同じ形**にしてある (受注したときそのまま移せる)。
-- `category` は v4 の3グループ (スタジオ / 技術・人員 / 制作・その他)。
-- 行ごとに仕入 (見込み) を持ち、粗利率がその場で出せる (_rules.md の要求)
CREATE TABLE IF NOT EXISTS estimate_items (
  id              TEXT PRIMARY KEY,
  estimate_id     TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit            TEXT,
  unit_price      INTEGER NOT NULL DEFAULT 0,
  amount          INTEGER NOT NULL DEFAULT 0,
  -- 仕入 (見込み)。粗利率を出すのに使う。**実際の仕入 (`purchases`) とは別物**
  cost            INTEGER NOT NULL DEFAULT 0,
  category        TEXT,
  pricing_item_id TEXT,
  item_notes      TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate
  ON estimate_items (estimate_id);
