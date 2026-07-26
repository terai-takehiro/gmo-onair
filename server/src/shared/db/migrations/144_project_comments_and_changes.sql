-- 144: 案件のコメント + 知らせた人 (メンション) + 変更の記録
--
-- ── コメント (B3) ──────────────────────────────────────
--
-- 「みんなで書くメモ」(migration 136) とは役割が違う。
-- メモは**いまの状態**を全員で書き直す場所で、後から誰が何を書いたかは残らない。
-- コメントは**言った・言わないの記録**なので 1件=1行で残し、書き換えない。
-- 混ぜると「メモを直したら相談の経緯が消えた」が起きる。
--
-- 消せるのは書いた本人だけ (打ち間違いを直せないと使われない)。
-- 他人が消せるようにはしない — やり取りの記録は当事者の一方の操作で消えてはいけない。
--
-- ── 知らせた人 (メンション) ──────────────────────────
--
-- ベル (§4.15) に出す。ベルは**既読の概念を持たない**設計なので、
-- 「読んだ」ではなく **「対応した」** を記録する (resolved_at)。
-- 読んだだけで消える仕組みにすると、嘘の «片づいた» が生まれる。
--
-- 本文から @名前 を機械的に拾うことはしない。日本語の氏名は区切りが曖昧で
-- 取り違えると**別の人に知らせてしまう**ため、知らせる相手は画面で選ばせる。
--
-- ── 変更の記録 (B4) ────────────────────────────────
--
-- **1行 = 1項目の変化**。まとめて1行にすると「どの項目がどう変わったか」が読めない
-- (migration 142 の権限履歴と同じ形)。消さない。
--
-- **主要な項目だけ**を記録する。全列を残すと履歴が伸びて読めなくなり、
-- 「なぜこの金額になったのか」を探せなくなる = 履歴の目的を失う。
--
-- 値は raw と「人が読む形」の両方を持つ:
--   raw   … 後から数字の推移を集計するため (金額・日付)
--   label … お客様や担当者が改名・退職しても履歴が読めるようにするため
--           (id だけ残すと後で引けなくなる。migration 142 の actor_name と同じ理由)

CREATE TABLE IF NOT EXISTS project_comments (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  author_id    TEXT,
  -- そのときの名前。users から消えても「誰が言ったか」が分かるように
  author_name  TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_comments_project
  ON project_comments(project_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_comment_mentions (
  comment_id   TEXT NOT NULL REFERENCES project_comments(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id),
  -- 「対応した」を押した時刻。NULL = まだベルに出ている
  resolved_at  TIMESTAMP,
  resolved_by  TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

-- ベルは「自分あて・未対応」だけを引く
CREATE INDEX IF NOT EXISTS idx_project_comment_mentions_open
  ON project_comment_mentions(user_id, created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS project_changes (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- 変えた人。users を消しても履歴が壊れないよう FK は張らず名前も残す
  actor_id     TEXT,
  actor_name   TEXT,
  -- 記録する項目名 (name / stage / customer_id / assigned_to / event_start /
  -- event_end / expected_amount / project_type / gls_number / gls_category)
  field        TEXT NOT NULL,
  before_value TEXT,
  after_value  TEXT,
  before_label TEXT,
  after_label  TEXT,
  changed_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_changes_project
  ON project_changes(project_id, changed_at DESC);
