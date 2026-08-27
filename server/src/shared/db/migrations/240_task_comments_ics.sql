-- ============================================================
-- 240: 依頼コメントスレッドとタスク期限 ICS フィード — docs/core-redesign-plan.md Phase 2 ⑤⑦
--
-- ── コメント（`task_comments`）───────────────────────────────
--
-- 依頼への返答メモはこれまで `description` への追記で残していた
-- （コメントのモデルが無かったため）。追記方式だと本文と会話が混ざり、
-- 誰がいつ書いたかが分からず、依頼主からの追い書きの居場所も無い。
-- タスク 1 件に紐づくコメントの列として持つ。
-- 読める・書けるのは**当事者だけ**（依頼主・受け手・作成者。service 側で判定）。
--
-- ── ICS フィードトークン（`user_task_feed_tokens`）───────────
--
-- 自分の未完了タスクの期限を Google/Outlook から購読するための
-- 個人トークン。スタジオ予約のフィード（migration 108）と同じトークン式だが、
-- あちらは**全員共通の 1 本**、こちらは**人ごとに 1 本**（見えるのは自分の
-- タスクだけなので、URL を知られたら再発行して旧 URL を無効にできる形にする）。
-- ============================================================

CREATE TABLE IF NOT EXISTS task_comments (
  id         TEXT PRIMARY KEY,
  -- タスクごと消えたらコメントも残す意味が無い（論理削除のタスクは service が弾く）
  task_id    TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- スレッド表示は「そのタスクのコメントを古い順」しか引かない
CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON task_comments(task_id, created_at);

CREATE TABLE IF NOT EXISTS user_task_feed_tokens (
  -- 1 人 1 本。再発行は UPDATE（＝旧トークンはその場で無効になる）
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── コメントの通知ひな形 ────────────────────────────────────
--
-- できごと型なので定時実行には載せず、task-comments.service が投稿の場で出す。
-- 二重防止は migration 177 の一意索引（人 × ひな形 × 対象 × ref_date）。
-- ref_date に**コメントの id** を入れる — 同じタスクへの 2 通目も
-- 別のできごとなので、潰さずに毎回届ける。
-- 既にあれば触らない（文面を直した人の変更を次のデプロイで上書きしないため。186 と同じ）。

INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('dg_comment', 'タスクへのコメント', '依頼・タスクにコメントが付いたとき', 'internal', 'inapp',
   '相手方（依頼主または受け手）',
   '［コメント］{タスク名}',
   E'{投稿者名} さんが「{タスク名}」にコメントしました。\n\n{本文}',
   '["{投稿者名}","{タスク名}","{本文}"]', TRUE, 19)
ON CONFLICT (id) DO NOTHING;
