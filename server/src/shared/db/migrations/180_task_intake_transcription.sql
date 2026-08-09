-- v4: 投入口の録音を「裏で走らせる」ための状態
--
-- ── なぜ要るか ──────────────────────────────────────────────
--
-- 投入口（トップページの「AIに任せる」）は録音を受け取れるようになったが、
-- **リクエストの中で文字起こしを待っていた**。nginx の `/api/` は
-- `proxy_read_timeout` を書いていないので **既定の 60 秒で切れる**ため、
-- 実質 3 分程度の録音しか投げられなかった（打合せには短すぎる）。
--
-- 議事録（`project_minutes`）は最初からこの形で、行を先に作って
-- `status='transcribing'` にし、裏で文字起こしを進める。投入口も同じにする。
--
-- ── ジョブの表は作らない ────────────────────────────────────
--
-- `project_minutes` と同じ判断。**行に状態を持たせるだけ**にする。
-- ジョブ表を作ると「行はあるがジョブが無い」「ジョブはあるが行が無い」を
-- 両方扱うことになり、落ちた回の後始末が 2 か所に増える。

-- 1) 状態を 2 つ足す
--    transcribing = 文字起こし中（下書きはまだ無い）
--    failed       = 文字起こしか解析に失敗した（**行は消さない**。何を投げたかは残す）
ALTER TABLE task_intake DROP CONSTRAINT IF EXISTS task_intake_status_check;
ALTER TABLE task_intake
  ADD CONSTRAINT task_intake_status_check
  CHECK (status IN ('pending', 'committed', 'discarded', 'transcribing', 'failed'));

-- 2) 失敗の理由。**画面に出すために要る** — 出さないと
--    「押したのに何も起きない」になり、もう一度録り直させることになる
ALTER TABLE task_intake ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 3) 文字起こしが終わった時刻。かかった時間を後から見るため
--    （`created_at` との差。長すぎる回が続くなら分割を促す判断材料になる）
ALTER TABLE task_intake ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMP;

-- 「文字起こし中のまま止まっている行」を拾う。コンテナが途中で再起動すると
-- 誰も終わらせないまま残るので、読むときに経過時間で失敗として見せる
-- （`project_minutes` と同じ扱い。**DB は書き換えない**）
CREATE INDEX IF NOT EXISTS idx_task_intake_transcribing
  ON task_intake (created_at DESC)
  WHERE status = 'transcribing' AND deleted_at IS NULL;
