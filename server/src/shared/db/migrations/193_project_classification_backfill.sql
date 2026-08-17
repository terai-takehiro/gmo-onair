-- 2段分類（客入れの有無 × 案件分類）の埋め戻しをやり直す
--
-- ── なぜもう一度やるのか（ご指摘: 「すでに案件分類を登録していても、
--    案件を直すを開くと未登録状態になる」）──────────────────────────
--
-- 案件分類は**2つの持ち方**が併存しています（migration 182 の冒頭）:
--
--   旧 `project_type`（1段・7種）          … 一覧・Excel・標準工程・集計が読む
--   `audience` / `project_category`（2段） … v4 の画面が読む
--
-- **書くのはサーバーの1か所**（`project-classification.ts`）という決めごとで、
-- そこを通れば3列そろって書かれます。ところが**通らない口が残っていました**:
--
--   ・**Excel 取込**（`excel.routes.ts`）… `project_type` だけを INSERT / UPDATE
--   ・検証環境の**シード**            … 同じく `project_type` だけ
--
-- この口から入った案件は、
--
--   ・**案件詳細の概要タブは「案件分類」に旧種類を出す**（`OverviewTab.tsx` の
--     フォールバック）ので **登録済みに見えます**
--   ・**案件を直す画面は2段しか見ない**ので **「選ぶ」＝未登録に見えます**
--
-- つまり**同じ案件が、画面によって「登録済み」と「未登録」に見えます**。
-- 直す画面が値を戻したのではなく、**2段の列が最初から空**でした。
--
-- migration 182 の UPDATE は**その時点の行**しか埋めていないので、
-- 182 より**あとに**この口から入った案件は空のまま残ります。
-- → 口そのものは同じ版で直しましたが（`excel.routes.ts` / `seed.ts`）、
--   **すでに空で入ってしまった行はここで埋め戻します。**
--
-- ── 何をどこまで埋めるか ────────────────────────────────────
--
-- 182 と**同じ対応表・同じ守り方**です（ここに独自の判断を足さない）:
--
--   ・**2段が両方とも空の行だけ**触ります。片方でも入っていれば人が決めた値なので、
--     旧種類から上書きすると「有観客の収録（公開収録）」が
--     「有観客の配信」に化けます（182 が実 DB で確かめた壊れ方）
--   ・旧種類が**4種のときだけ**埋めます。`other` / `gmo_project` / `consulting` は
--     2段のどこにも当てはまらないので **NULL のまま**にします
--     （機械では配信か収録かを決められない ＝ 案件台帳の「案件分類が入っていない」
--     に残して人に決めてもらう）
--   ・⚠️ **GLS-B の行には入れません**（182 に無かった守り）。工事・構築の
--     プロジェクトは2段を持たない決めごとで、入れると集計で
--     「無観客のイベント」として数えられます。発番前の A→B 切替は
--     `project_type` を書き換えないので、**B の行に `recording` が残っている**
--     ことが実際にあります（`gls_category IS NULL` は A 扱い＝決算取込の行）
--   ・⚠️ **来場人数（`attendee_count`）は落としません。** 「無観客にしたら落とす」は
--     保存の決めごとですが、ここで機械的に消すと「150 名と聞いた」という
--     人が入れた情報が黙って消えます。食い違いは案件台帳の
--     「無観客なのに来場人数が入っている」が数えて見せるので、**人が決めます**

UPDATE projects SET
  audience = CASE project_type
    WHEN 'hybrid_event'   THEN 'with_audience'
    WHEN 'offline_event'  THEN 'with_audience'
    WHEN 'live_broadcast' THEN 'no_audience'
    WHEN 'recording'      THEN 'no_audience'
  END,
  project_category = CASE project_type
    WHEN 'hybrid_event'   THEN 'broadcast'
    WHEN 'live_broadcast' THEN 'broadcast'
    WHEN 'recording'      THEN 'recording'
    WHEN 'offline_event'  THEN 'event'
  END,
  updated_at = NOW()
WHERE audience IS NULL
  AND project_category IS NULL
  AND project_type IN ('hybrid_event', 'offline_event', 'live_broadcast', 'recording')
  AND (gls_category IS NULL OR gls_category <> 'B')
  AND deleted_at IS NULL;
