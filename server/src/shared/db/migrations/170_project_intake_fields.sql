-- 案件登録の16項目のうち、列が無かった6つ (v4)
--
-- モックの案件登録は**全画面モーダル1枚に16項目**（`inManualFields`）。
-- そのうち6つは `projects` に入れる場所がありませんでした。
--
--   ご担当             `contact_name`
--   継続区分           `recurrence`      単発 / レギュラー
--   規模               `attendee_count`  何名か
--   やりたいこと       `goal`
--   返事の期限         `reply_due`
--   求められているもの `wants`           見積・資料 など
--
-- ── 「ご担当」を顧客の表に入れない ──────────────────────────
--
-- `customers` にも担当者はありますが、あれは**その会社の代表窓口**です。
-- 案件ごとに窓口が違うことは普通にあり（広報部と総務部で別の人）、
-- 顧客側を書き換えると**別の案件の窓口まで変わります**。
-- 案件に持たせるのが正しい。
--
-- ── 「規模」を文字列にしない ────────────────────────────────
--
-- モックは「150名」と出しますが、**数で持ちます**。文字列だと
-- 「150名」「150人」「約150」が混ざり、あとで規模別の集計ができません。
-- 単位は画面が付けます。
--
-- ── 「返事の期限」は日付だけ ────────────────────────────────
--
-- `docs/wording.md` は「期限は何月何日何時何分まで」と決めていますが、
-- **これは相手からの返事を待つ目安**で、タスクの期限とは違います
-- （時刻まで詰めても運用されない）。時刻が要るものは最初のタスクの期限で持ちます。

ALTER TABLE projects ADD COLUMN IF NOT EXISTS contact_name    TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS recurrence      TEXT NOT NULL DEFAULT 'single';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS attendee_count  INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS goal            TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reply_due       TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wants           TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_recurrence') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_recurrence
      CHECK (recurrence IN ('single', 'regular'));
  END IF;
END $$;

COMMENT ON COLUMN projects.contact_name IS
  'この案件の窓口。顧客の代表窓口 (customers.contact_name) とは別 — 案件ごとに違うため';
COMMENT ON COLUMN projects.recurrence IS
  '単発 single / レギュラー regular。レギュラーは回 (episodes) を持つ';
COMMENT ON COLUMN projects.attendee_count IS '規模（何名か）。単位は画面が付ける';
COMMENT ON COLUMN projects.goal IS 'やりたいこと（お客様の言葉のまま）';
COMMENT ON COLUMN projects.reply_due IS '返事の期限 YYYY-MM-DD。相手を待たせている目安で、タスクの期限とは別';
COMMENT ON COLUMN projects.wants IS '求められているもの（見積・資料 など）';

-- 「返事の期限が近い引き合い」を引く索引
CREATE INDEX IF NOT EXISTS idx_projects_reply_due
  ON projects(reply_due) WHERE reply_due IS NOT NULL AND deleted_at IS NULL;
