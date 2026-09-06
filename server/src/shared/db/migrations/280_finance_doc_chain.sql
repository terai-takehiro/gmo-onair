-- 280: 受領書類 — 見積書→発注書→請求書を「ひとつづり」にし、案件/販管費の当て先と
--      メール添付（PDF）を持てるようにする（2026-09 依頼）
--
-- ── なぜ要るか ──────────────────────────────────────────────
--
-- いまの `finance_docs` は**メール1通＝1行**で、行どうしに関係がありません。
-- 実際の取引は 見積書 → 発注書 → 請求書 と段を踏み、しかも
--   ・見積書が何度も改定される（同じ取引で見積書が3通届く）
--   ・見積だけ取って発注しない（請求書が来ない）
--   ・請求書しか来ない（見積も発注も無い）
-- という形がぜんぶ普通に起きます。1通ずつ並べると、経理は
-- **「この請求書はどの見積の続きなのか」を毎回メールを探して確かめる**ことになります。
--
-- そこで**束（`finance_doc_groups`）を作り、書類はその束にぶら下げます**。
-- 束が1通しか持たない（請求書だけ）のも普通の形なので、
-- **束は取込時に必ず1つ作ります**（後から束ね直せる）。
--
-- ── 当て先（案件の仕入 か 販管費 か）は AI が「仮」で置き、人が決める ──
--
-- どの案件かは最終的に人が決めるべきものです（ユーザー指示）。
-- ただし**空欄で置くと人が全部調べ直す**ので、AI が候補を入れ、
-- **誰が付けたか（`project_source`）と、どれくらい確からしいか（`project_confidence`）**を
-- 一緒に残します。人が直したら `project_source='human'` になり、
-- **その差分が `ai_corrections` に入る**（会社方針「AI を使い捨てにしない」条件2）。
--
-- ⚠️ **`gls_number`（文字列）は残します。** いまの取込スキルが渡しており、
-- 消すと取込が止まります。`project_id` は**解決できたときだけ**入る別の列です。
--
-- ── 販管費は「何日サイト」「何月処理」を持つ ─────────────────────
--
-- 案件に紐づかない請求書（家賃・回線・ソフトの月額など）は販管費になります。
-- 支払期日は**書類に書いていないことのほうが多く**、実務は
-- 「締日から◯日サイト」で決まります。日数と処理月を持たせ、
-- **支払期日はそこから作れるようにします**（人が上書きできる）。
--
-- ── 添付（PDF）は BOX に置き、DB には在り処だけ持つ ─────────────
--
-- 請求書の PDF は原本です。DB に中身を入れるとバックアップが重くなり、
-- 全社で見るのも BOX のほうが自然なので、**BOX の「受領書類（メール）」フォルダ**に
-- 置き、ここには**ファイル ID と、入らなかったときの理由**を持ちます。
-- ⚠️ **入らなかったことを黙って握り潰しません** — BOX につないでいない環境
-- （検証・手元）では `failure_reason='NOT_CONFIGURED'` の行が残り、画面がそう言います。

-- ── 束（1つの取引 = 見積書/発注書/請求書のひとつづり）──────────────
CREATE TABLE IF NOT EXISTS finance_doc_groups (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,                 -- 何の取引か (人が直せる)
  vendor_name    TEXT,                          -- 取引先 (書類の差出人から)
  -- 行き先。NULL = まだ決めていない (AI が決めきれないときは入れない)
  expense_kind   TEXT CHECK (expense_kind IN ('purchase','sga')),
  project_id     TEXT REFERENCES projects(id),  -- 仕入のとき: どの案件か
  -- 販管費のとき: 支払サイト (日数) と 処理月 (YYYY-MM)
  payment_terms_days INTEGER CHECK (payment_terms_days IS NULL OR (payment_terms_days >= 0 AND payment_terms_days <= 365)),
  processing_month   TEXT,
  -- 束ね直しの手がかり。取込時に AI が渡した鍵 (見積番号・取引先+件名 など)
  group_key      TEXT,
  created_by     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);

-- 同じ鍵で2つ束ができないようにする。**消したものは空き扱い**
-- (`deleted_at IS NULL` の partial unique。migration 275 と同じ形)
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_doc_groups_key
  ON finance_doc_groups(group_key) WHERE group_key IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_doc_groups_project
  ON finance_doc_groups(project_id) WHERE deleted_at IS NULL;

ALTER TABLE finance_docs
  ADD COLUMN IF NOT EXISTS group_id           TEXT REFERENCES finance_doc_groups(id),
  -- 当て先 (仮)。**人が最後に決める**ので source と確からしさを一緒に持つ
  ADD COLUMN IF NOT EXISTS project_id         TEXT REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS project_source     TEXT CHECK (project_source IN ('ai','human')),
  ADD COLUMN IF NOT EXISTS project_confidence TEXT CHECK (project_confidence IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS project_reason     TEXT,
  ADD COLUMN IF NOT EXISTS expense_kind       TEXT CHECK (expense_kind IN ('purchase','sga')),
  ADD COLUMN IF NOT EXISTS expense_kind_source TEXT CHECK (expense_kind_source IN ('ai','human')),
  ADD COLUMN IF NOT EXISTS vendor_name        TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER CHECK (payment_terms_days IS NULL OR (payment_terms_days >= 0 AND payment_terms_days <= 365)),
  ADD COLUMN IF NOT EXISTS processing_month   TEXT,
  ADD COLUMN IF NOT EXISTS doc_no             TEXT,     -- 書類番号 (見積番号・請求番号)
  ADD COLUMN IF NOT EXISTS revision           INTEGER;  -- 見積の改定回数 (1 始まり・任意)

CREATE INDEX IF NOT EXISTS idx_finance_docs_group ON finance_docs(group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_docs_project ON finance_docs(project_id) WHERE deleted_at IS NULL;

-- ── 添付 (メールに付いてきた PDF)。1通に複数付くのが普通 ────────────
CREATE TABLE IF NOT EXISTS finance_doc_attachments (
  id             TEXT PRIMARY KEY,
  doc_id         TEXT NOT NULL REFERENCES finance_docs(id),
  filename       TEXT NOT NULL,
  mime_type      TEXT,
  size_bytes     INTEGER,
  -- 中身の指紋。**同じ添付を2回取り込まないため**
  -- (メールが転送で戻ってくる・スキルを再実行する が普通に起きる)
  content_sha256 TEXT,
  -- BOX に入ったときだけ埋まる
  box_file_id    TEXT,
  box_url        TEXT,
  stored_at      TIMESTAMP,
  -- 入らなかった理由 (NOT_CONFIGURED / UNAVAILABLE / TOO_LARGE / BAD_TYPE)。
  -- **黙って消さない** — 画面が「BOX に入っていません」と言えるようにする
  failure_reason TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_doc_attachments_doc ON finance_doc_attachments(doc_id);
-- 同じ書類に同じ中身の添付を2つ作らない
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_doc_attachments_sha
  ON finance_doc_attachments(doc_id, content_sha256) WHERE content_sha256 IS NOT NULL;
