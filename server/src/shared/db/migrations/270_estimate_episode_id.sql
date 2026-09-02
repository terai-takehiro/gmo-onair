-- レギュラー案件（回が積み上がるシリーズ）で、見積を「回」単位でも持てるようにする
-- (仕様変更 #18・docs/design/v4/regular-series.md §10 の続き)
--
-- ── なぜ要るか ──────────────────────────────────────────────
--
-- migration 269 で episodes.recording_per_day_count / episode_unit_price を
-- 回ごとに持てるようにしたが、見積そのもの（estimate_items まで含む明細一式）は
-- 依然として案件（project_id）単位でしか持てなかった。レギュラー案件は実務上、
-- 回ごとに単価や工数が変わって見積を分けたい（機材が増えた回だけ別見積にする、
-- 単価改定を跨いだ回から新しい見積にする等）ことがあるが、その置き場所が無かった。
--
-- → **`estimates` に `episode_id`（nullable）を足す。**
--
-- ── NULL＝「案件全体の見積」（既存の使い方をそのまま残す） ──────────
--
-- 単発案件・レギュラーでも回を分けない見積は今までどおり `episode_id = NULL` の
-- ままでよい。「決めていない」ではなく「回に紐づかない＝案件全体」という
-- 意味を持つ値なので、0 件・空文字のような別の意味と混同しないよう NULL のまま扱う
-- （shared/CLAUDE.md「NULL＝決めていない」の考え方に近いが、ここは
--  「回に紐づける／紐づけない」という2値の選択そのものが NULL/値ありで表現される）。
--
-- ── ON DELETE SET NULL にした理由 ───────────────────────────
--
-- 見積は「いくらで出して、いくらで決まったか」を残す記録そのもの
-- （migration 138）。回（episode）が削除されたからといって見積の行・明細・
-- 送付済みの記録まで一緒に消えると、その回に出した見積の記録が追えなくなる。
-- 回への紐づきだけ外れて「案件全体の見積」として一覧には残る形にする
-- （`episode_orders`/`invoice_group_episodes` 等、既存の episode_id 参照が
--  同じ書き方をしている場合の慣例には合わせず、記録を残す `estimates` の
--  性質を優先した — `project_tasks.episode_id`・`revenues.episode_id` と同じ考え方）。
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL;

-- 「この回の見積一覧」「回ごとにグルーピングして数える」の絞り込みで使う
CREATE INDEX IF NOT EXISTS idx_estimates_episode
  ON estimates (episode_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN estimates.episode_id IS
  'この見積が属する回（episodes.id）。NULL は「案件全体の見積」（従来どおりの使い方・'
  '単発案件はここが常に NULL）。レギュラー案件（recurrence=regular）で回ごとに見積を'
  '分けたいときだけ入れる（仕様変更 #18・migration 270）。回を消しても見積の記録'
  '（送付済み・受注済みの版を含む）は残す方針のため ON DELETE SET NULL — 消えるのは'
  '回への紐づきだけで、見積の行・明細・状態は変えない';
