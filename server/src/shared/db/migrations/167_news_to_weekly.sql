-- デイリーニュースの行を週報へ送る (v4)
--
-- モックのデイリーニュースには「採用した行を週報に送る」ボタンがある。
-- サーバーに口が無く、送った行の**由来**を残す列も無かったので出せていなかった。
--
-- ── なぜ「由来」が要るのか ──────────────────────────────────
--
-- 由来が無いと、
--   ・同じニュースを2回送っても気づけない（週報に同じ行が並ぶ）
--   ・週報のトピックに「ニュース由来」のバッジを出せない（モックにある）
--   ・元のニュース側で「もう送った」と分からず、押し直される
-- の3つが起きる。
--
-- ニュースも週報も**同じ `ops_report_items`** なので、参照先は自分自身のテーブル。
-- 別の列名 (`source_news_id` など) にすると、あとで別の kind から送るときに
-- 名前が合わなくなる。

ALTER TABLE ops_report_items
  ADD COLUMN IF NOT EXISTS source_item_id TEXT REFERENCES ops_report_items(id);

COMMENT ON COLUMN ops_report_items.source_item_id IS
  'この行の元になった行 (デイリーニュース → 週報)。手で書いた行は NULL';

-- 「この行はもう送ったか」を元のニュース側から引く索引
CREATE INDEX IF NOT EXISTS idx_ops_report_items_source
  ON ops_report_items(source_item_id) WHERE source_item_id IS NOT NULL;

-- **同じ行を2回送れないようにする。** ボタンを2回押しても週報は増えない。
-- 送ったあとに週報側で消したときは、消した行 (`deleted_at`) を除くので送り直せる
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_report_items_source
  ON ops_report_items(source_item_id) WHERE source_item_id IS NOT NULL AND deleted_at IS NULL;
