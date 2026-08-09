-- ふりかえりの「実施記録」を KPT にする（v4 ⑥ 案件記録）
--
-- ── なぜ自由行をやめるのか ──────────────────────────────────────
--
-- `event_reports.highlights` は「よかったこと・次に活かすこと」の自由行でした。
-- 1本の配列に**続けたいこと・困ったこと・次に試すこと**が混ざるので、
-- 読む側は毎回どれがどれかを読み分けることになります。
-- **K / P / T の3枠**に分けると、書くときに種類を決めることになり、
-- 次の案件で読み返すときに「困ったこと」だけを追えます。
--
-- ── 書いた人を1件ずつ残す ────────────────────────────────────
--
-- `highlights` は**誰が書いたかを持っていません**。ふりかえりは
-- 「その人がその現場で見たこと」なので、書いた人が分からないと
-- **後から確かめられません**（「これ、どの現場の話ですか」が起きる）。
-- `author_id` を必須にし、画面の追加ボタンにも
-- 「寺井 として足す」と**押す前に自分の名前を出します**。
--
-- ── AI の下書きを「未確認」として持つ ──────────────────────────
--
-- やり取り・議事録・タスクの遅れから AI が K/P/T を提案します。
-- **`ai_generated` を立て、`confirmed_at` が入るまでは未確認**として扱います。
-- 人が確かめずに隔週キープの資料へ出ると、**AI の推測が実施報告になります**。
-- 人が直した差分は `ai_corrections` に入り、次の下書きに効きます
-- （会社方針「AI を使い捨てにしない」の条件2・4）。

CREATE TABLE IF NOT EXISTS event_report_kpt (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  kind          TEXT NOT NULL CHECK (kind IN ('keep','problem','try')),
  body          TEXT NOT NULL,
  author_id     TEXT NOT NULL REFERENCES users(id),
  ai_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at  TIMESTAMPTZ,
  -- AI の下書きから来た行は、人が直した差分の before をここから引く
  ai_output_id  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_report_kpt_project ON event_report_kpt(project_id, kind, sort_order);

-- ── 既存の `highlights` を移す ────────────────────────────────
--
-- 指示書のとおり `kind='keep'` / `author_id` は案件の担当 / `ai_generated=false`。
-- **`confirmed_at` は `created_at`** にします（人が書いた行なので未確認ではない）。
--
-- `projects.assigned_to` は **NOT NULL ＋ `users` への外部キー**なので必ず引けます
-- （メモの移行が作成者を優先するのとは逆で、こちらは指示書が「案件の担当」と
-- 決めているのでそのまま担当を使います）。**並びは元の配列の順**を保ちます —
-- 書いた順に意味があることがあるので、DB の都合で入れ替えない。
INSERT INTO event_report_kpt (id, project_id, kind, body, author_id, ai_generated, confirmed_at, sort_order, created_at)
SELECT
  'kpt-' || r.id || '-' || (h.ord - 1),
  r.project_id,
  'keep',
  btrim(h.value #>> '{}'),
  COALESCE(ua.id, uc.id),
  FALSE,
  r.created_at,
  (h.ord - 1)::int,
  r.created_at
FROM event_reports r
JOIN projects p ON p.id = r.project_id
LEFT JOIN users ua ON ua.id = p.assigned_to
LEFT JOIN users uc ON uc.id = p.created_by
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.highlights, '[]'::jsonb)) WITH ORDINALITY AS h(value, ord)
WHERE jsonb_typeof(COALESCE(r.highlights, '[]'::jsonb)) = 'array'
  AND jsonb_typeof(h.value) = 'string'
  AND NULLIF(btrim(h.value #>> '{}'), '') IS NOT NULL
  AND COALESCE(ua.id, uc.id) IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 寄せ先が無くて移せなかった行が残っていないかを検算する。
-- **黙って落とさない** — 落ちるとふりかえりの中身が誰にも気づかれずに消えます。
DO $$
DECLARE orphan INT;
BEGIN
  SELECT COUNT(*) INTO orphan
    FROM event_reports r
    JOIN projects p ON p.id = r.project_id
    LEFT JOIN users ua ON ua.id = p.assigned_to
    LEFT JOIN users uc ON uc.id = p.created_by
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.highlights, '[]'::jsonb)) AS h(value)
   WHERE jsonb_typeof(COALESCE(r.highlights, '[]'::jsonb)) = 'array'
     AND jsonb_typeof(h.value) = 'string'
     AND NULLIF(btrim(h.value #>> '{}'), '') IS NOT NULL
     AND ua.id IS NULL AND uc.id IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION 'ふりかえりの行 % 件が、書いた人に寄せられませんでした。author_id の寄せ先を決めてから再実行してください', orphan;
  END IF;
END $$;

ALTER TABLE event_reports DROP COLUMN IF EXISTS highlights;
