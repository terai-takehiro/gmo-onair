-- やり取りの本文を後から整形する（バックフィル）ための2列
--
-- ── なぜ列を足すのか ────────────────────────────────────────
--
-- メール取込（MCP `create_activity_log`）は `description` に素のテキストしか
-- 入れられないため、**毎日の取込は整形器を1回も通っていません**
-- （`activity-log.service.ts` の `wantFormat = data.format === true`）。
-- そこで「まだ整えていない行」を後から整える仕組みを入れます。
--
-- 待ち行列は **行の状態で表す**（ジョブの表は作らない — 録音の文字起こしと同じ決めごと）。
--   ・まだ整えていない = body_html IS NULL AND format_attempted_at IS NULL
--   ・整えた           = body_html IS NOT NULL
--   ・試したが失敗した = format_attempted_at IS NOT NULL AND body_html IS NULL
--
-- **`format_attempted_at` が無いと永久に再試行します。** 失敗する行（長すぎる・
-- 文字化けなど）は何度呼んでも失敗するので、そのたびに課金されて待ち行列も減りません。
--
-- **`format_error` が無いと理由が分かりません。** 「整わないままの行が N 件ある」しか
-- 言えず、直しようがなくなります（画面に理由を出すために持ちます）。
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS format_attempted_at TIMESTAMPTZ;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS format_error TEXT;

-- 待ち行列を引く索引。**部分索引にする** — 対象は「まだ整えていない行」だけで、
-- 整え終わった行（時間が経つほど増える）を索引に載せる意味が無い。
CREATE INDEX IF NOT EXISTS idx_activity_logs_format_pending
  ON activity_logs (activity_date DESC)
  WHERE deleted_at IS NULL AND body_html IS NULL AND format_attempted_at IS NULL;
