-- ============================================================
-- 304: 活動記録の本文を「人が手動で編集した」印
--
-- ── なぜ要るか（利用者からのご指摘）────────────────────────
-- 「やり取りの本文が編集できない。AI が整形したあとでも手動で編集したい」
--
-- 本文を手で書き直せるようにすると、**毎晩 3:00 の自動整形が人の編集を消します**。
-- 待ち行列（`activity-format.service.ts` の `PENDING_SQL`）は
--   `body_struct IS NULL AND format_error IS NULL AND (body_html IS NULL OR ai_formatted)`
-- で拾うので、手動編集で `body_struct` を捨てた行（`ai_formatted` は TRUE のまま）は
-- **翌朝また AI の構造で上書きされます**。人が直した労力がそのまま消える。
--
-- そこで「人が本文を触った」ことを行に残し、待ち行列から外します。
--
-- ⚠️ **この2列を『差分』の代わりにしないこと。**
--    `body_edited_at` / `body_edited_by` は `projects.ai_reviewed_at` と同じ
--    「人が触った」フラグでしかなく、**何がどう間違っていたかを1バイトも教えません**
--    （会社方針「AIを使い捨てにしない」の未達パターンそのもの）。
--    手動編集の中身は必ず `ai_corrections` に `body_struct` の `reject`
--    （before = AI が作った構造の全文）として積みます
--    （`activity-log.service.ts` の `recordActivityCorrections`）。
--    この列は**待ち行列を止めるためだけ**にあります。
--
-- ⚠️ **`ai_formatted` は落としません。** 落とすと
--    `recordActivityCorrections` の門（`if (existing.ai_formatted)`）が閉じ、
--    手動編集した行のその後の修正が永久に記録されなくなります
--    （`redoFormat` が `ai_formatted` を落とさないのと同じ理由）。
-- ============================================================

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS body_edited_at TIMESTAMPTZ;
-- `users.id` は TEXT（001b の定義）。設計メモは uuid と書いているが、
-- **この DB の主キーは全部 TEXT** なので型を合わせる（合わせないと FK が張れない）
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS body_edited_by TEXT REFERENCES users(id);

COMMENT ON COLUMN activity_logs.body_edited_at IS
  '人が本文（body_html）を手動で編集した日時。自動整形の待ち行列から外すための印';
COMMENT ON COLUMN activity_logs.body_edited_by IS
  '本文を手動で編集した人（users.id）。監査用で、差分そのものは ai_corrections に積む';

-- 待ち行列（`PENDING_SQL`）が毎回見る列なので、**手動編集した行だけ**の部分索引を張る。
-- 全体索引にすると NULL（＝ほとんどの行）まで載せることになり、何の得もない
CREATE INDEX IF NOT EXISTS idx_activity_logs_body_edited
  ON activity_logs(body_edited_at)
  WHERE body_edited_at IS NOT NULL;
