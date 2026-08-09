-- やり取りにメモを畳み、AI が整形した本文を持てるようにする（v4 ⑥ 案件記録）
--
-- ── なぜ「メモ」という入れ物をやめるのか ────────────────────────────
--
-- `projects.notes`（案件のメモ）と `activity_logs`（やり取り）は**役割が重なって**
-- いました。どちらも「この案件について書き残したこと」で、書く人は
-- **どちらに書けばよいか決められません**。結果、同じ話が2か所に散り、
-- 概要タブのメモを読んだ人はやり取りを読まず、その逆も起きます。
--
-- 畳む先を**やり取り側**にしたのは、やり取りが**時系列**を持っているからです。
-- メモには日付が無く、「いつ時点の話か」が分かりません。
-- 相手とのやり取りではない社内の書き置きは `activity_type='memo'` として
-- 同じ時系列に並びます。
--
-- ── 3列足すのは AI が整形した結果を置くため ────────────────────────
--
-- 人は打ちっぱなしで書き、**保存時に AI が構造化**します（見出し・整形本文・要点）。
--   `description`  … **原文**。ここは AI に触らせない
--   `body_html`    … 整形結果（サニタイズ済み）。人が直せる
--   `key_points`   … 要点
--   `ai_formatted` … AI が整形したか（画面の紫バッジ）
--
-- **原文を必ず残す**のが要点です。整形が的外れなときに人が戻せますし、
-- 整形プロンプトを直したあと**同じ原文でやり直せます**
-- （議事録が `transcript` を残しているのと同じ考え方）。
--
-- ── `ai_output_id` を足す理由（指示書の3列に対する足し算）────────────
--
-- 指示書は3列ですが、**会社方針「AI を使い捨てにしない」の条件2**
-- （人の修正を差分として残す）を満たすには、行から
-- `ai_outputs` に戻れる必要があります。`project_minutes.ai_output_id` と同じ形です。
-- 無いと「人が `body_html` をどう直したか」を後から AI に返せません。

-- ── ① 種類に memo を足す ────────────────────────────────────────
-- migration 115 の集合に足すだけ。**既存の値は1つも落とさない**
-- （落とすと過去の行が CHECK 違反になり、その案件のやり取りが保存できなくなる）
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_activity_type_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_activity_type_check
  CHECK (activity_type IN ('call','email','meeting','visit','proposal','demo','followup','follow_up','memo','other'));

-- ── ② AI 整形のための列 ─────────────────────────────────────────
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS body_html    TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS key_points   JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ai_formatted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ai_output_id TEXT;

-- 指示書は `text[]` ですが **JSONB にしてあります**。この製品の配列カラムは
-- `event_reports.highlights` / `project_minutes.decisions` など**すべて JSONB** で、
-- ここだけ `text[]` にすると読み書きの作法が1か所だけ変わります
-- （`pg` の返り値の形も違う）。中身と用途は指示書のとおりです。

COMMENT ON COLUMN activity_logs.body_html IS 'AI が整えた本文。保存時にサニタイズ済み（許可タグ: p/strong/em/ul/ol/li/br/h4/code・属性なし）';
COMMENT ON COLUMN activity_logs.key_points IS '要点 string[]。画面ではチェック付きチップ';
COMMENT ON COLUMN activity_logs.ai_formatted IS 'AI が整形したか。人が最初から書いた行は false';
COMMENT ON COLUMN activity_logs.ai_output_id IS 'ai_outputs.id。人が直したときの差分の before を引くために持つ';

-- ── ③ 決算取込の印を `notes` から出す ────────────────────────────
--
-- **`projects.notes` は人のメモだけではありませんでした。**
-- 決算取込（`kessan-import.service`）が、自動で作った案件の印として
-- `notes` の先頭に `[kessan:2026-03]` と書き込んでおり、
--   ・案件一覧の `source=kessan` の絞り込み
--   ・取込み済みマーカーの一覧（`getKessanMarkers`）
--   ・取込後の実施日の埋め戻し
-- の3か所がその文字列を読んでいます。**`notes` をそのまま落とすと決算取込が壊れます。**
--
-- 印を**専用の列に出します**。自由文に印を混ぜる形はもともと危うく、
-- 人が `[kessan:` で始まるメモを書いただけで取込み分と誤判定されます。
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kessan_marker TEXT;
COMMENT ON COLUMN projects.kessan_marker IS '決算取込が作った案件の印（例 2026-03）。人のメモとは別の列に持つ';

UPDATE projects
   SET kessan_marker = substring(notes from '\[kessan:([^\]]+)\]')
 WHERE notes LIKE '[kessan:%'
   AND kessan_marker IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_kessan_marker ON projects(kessan_marker) WHERE kessan_marker IS NOT NULL;

-- ── ④ `projects.notes` をやり取りへ移す ──────────────────────────
--
-- **日付は案件の作成日**（JST）にします。メモには日付が無いので、
-- 「いつ書かれたか」に一番近い持ち物がこれです。
-- `created_at` は TIMESTAMPTZ なので **時間帯を明示**しないと、
-- 夕方以降に作られた案件のメモが前日に落ちます
-- （標準工程テンプレートの受付日で実際に踏んだのと同じ間違い）。
--
-- `user_id` は NOT NULL なので、書いた人を決めます。**作成者を優先し、
-- 引けなければ担当**に寄せます。この順にするのは:
--   ・`projects.created_by` は **NULL を許し、外部キーも無い**（消えた利用者の id が残りうる）
--   ・`projects.assigned_to` は **NOT NULL ＋ `users` への外部キー**（必ず引ける）
-- ので、作成者だけを見ると**引けない行が丸ごと落ちます**。
-- 逆に担当だけにすると、書いた本人ではない人の名前が付きます。
-- 「作成者 → 担当」なら、**取りこぼしが出ず、分かるときは書いた本人が残る**。
--
-- **決算取込の印だけの行は移しません**（③ で列に移してある）。
-- 移すと、自動で作られた案件すべてに `[kessan:2026-03]` という
-- 中身のないやり取りが1件ずつ並びます。印のあとに人が書き足した文がある行は、
-- **印を落として残りだけ**を移します。
INSERT INTO activity_logs
  (id, project_id, customer_id, user_id, activity_type, subject, description, activity_date, created_by, updated_by, created_at)
SELECT
  'memo-' || p.id,
  p.id,
  p.customer_id,
  COALESCE(uc.id, ua.id),
  'memo',
  'メモ',
  btrim(regexp_replace(p.notes, '^\s*\[kessan:[^\]]+\]', '')),
  to_char(p.created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD'),
  COALESCE(uc.id, ua.id),
  COALESCE(uc.id, ua.id),
  p.created_at
FROM projects p
LEFT JOIN users uc ON uc.id = p.created_by
LEFT JOIN users ua ON ua.id = p.assigned_to
WHERE p.deleted_at IS NULL
  AND NULLIF(btrim(regexp_replace(p.notes, '^\s*\[kessan:[^\]]+\]', '')), '') IS NOT NULL
  AND COALESCE(uc.id, ua.id) IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 移せなかったメモが残っていないかを検算する。
-- **黙って落とさない** — 落ちるとメモの中身が誰にも気づかれずに消えます。
-- `assigned_to` が NOT NULL ＋ 外部キーなので、通常はここに引っかかりません
-- （引っかかるのは外部キーを外して壊した DB だけ）。
DO $$
DECLARE orphan INT;
BEGIN
  SELECT COUNT(*) INTO orphan
    FROM projects p
    LEFT JOIN users uc ON uc.id = p.created_by
    LEFT JOIN users ua ON ua.id = p.assigned_to
   WHERE p.deleted_at IS NULL
     AND NULLIF(btrim(regexp_replace(p.notes, '^\s*\[kessan:[^\]]+\]', '')), '') IS NOT NULL
     AND COALESCE(uc.id, ua.id) IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION '作成者が引けない案件のメモが % 件あります。移行先の user_id を決めてから再実行してください', orphan;
  END IF;
END $$;

ALTER TABLE projects DROP COLUMN IF EXISTS notes;
