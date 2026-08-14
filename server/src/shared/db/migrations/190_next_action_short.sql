-- ============================================================
-- 190: 「次にやること」の短い一文（事実の帯の1行に収める）
--
-- ── 何を解いているか ────────────────────────────────────────
--
-- `activity_logs.next_action` は**言い切り1文 ＋ ぶら下がる作業**の長文で、
-- 実データの1文目だけで 40〜60 字あります（「★8/14(金)までに 8/28分の備品レンタル
-- 発注可否を確定し発注する(発注期日 8/19 は…)。」）。案件詳細の事実の帯は
-- 幅を1行ぶんに広げてもなお入り切らず、**文字が切れます**（ご指摘）。
--
-- 規則で切る（`truncate` / 句点で切る）と**必ず途中で切れる**ので、
-- **AI に「この幅に収まる一文」を作らせて、その結果を持ちます**（ご指示）。
--
-- ── なぜ列を足すのか ────────────────────────────────────────
--
-- 読むたびに AI を呼ぶと、①画面が遅い ②開いた回数だけ課金される
-- ③**AI が何を出したかが残らない**（会社方針「AI を使い捨てにしない」の条件1 が
-- 満たせない）。だから**1回だけ作って行に持たせます**。
--
-- ── 2列で「待ち行列」を表す（`format_error` と同じ形）────────
--
--   済み   = next_action_short IS NOT NULL
--   失敗   = next_action_short IS NULL AND next_action_short_error IS NOT NULL
--   まだ   = どちらも NULL（かつ next_action が長い）
--
-- **失敗の印を持たないと、何度呼んでも失敗する行を毎晩呼んで課金され続け、
-- 待ち行列も減りません**（migration 188 で踏んだのと同じ形）。
-- ジョブの表は作りません（行の状態で表す）。
--
-- ⚠️ **`next_action` は1バイトも触りません。** 短い一文は**表示用の別の値**で、
-- 原文はやり取りタブで並びのまま読めます。上書きすると、AI が要約を間違えた日に
-- **やることが1件消えたことに誰も気づけません**。
-- ============================================================

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS next_action_short TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS next_action_short_error TEXT;

-- 待ち行列を引くための部分索引。**済み・失敗を含めない**ので小さいまま
CREATE INDEX IF NOT EXISTS idx_activity_next_action_short_pending
  ON activity_logs (activity_date DESC)
  WHERE deleted_at IS NULL
    AND next_action_short IS NULL
    AND next_action_short_error IS NULL
    AND next_action IS NOT NULL
    AND next_action_done_at IS NULL;
