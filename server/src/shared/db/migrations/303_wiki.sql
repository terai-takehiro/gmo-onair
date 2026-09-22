-- ============================================================
-- 302: Wiki（新しいブロックアプリ）段A（器）
--
-- 設計: docs/design/v4/wiki.md §5-1・§4-4・§7-4。Markdown で書いた文章を
-- ツリーに並べ、検索できて、AI が読める。本文の正は `wiki_pages.body_md`
-- （§5-2 の判断。ファイルを正にしない）。
--
-- DDL の書式（TEXT PRIMARY KEY・TIMESTAMPTZ・deleted_at・部分インデックス）は
-- 298（qsheet_venue_floors）を写す。
--
-- ⚠️ **本文は切り詰めない。** `body_md` がそのまま画面に出る本文で、
--    書き出し（.md）・MCP・AI の材料も同じ文字列を使う。
-- ⚠️ **データベース（§4-4）はブロックではなくページの種類。**
--    `wiki_pages.kind='database'` の親ページが列（項目）とビューの定義を
--    `wiki_databases` に持ち、行はその子ページ（`wiki_pages.props` に値）。
--    Markdown で表せないものを別の保存形式で持たない、という約束2 の帰結。
-- ⚠️ **見直し期限（`review_by`）は任意・既定なし**（§10 #10 の判断）。
--    入れたページだけが見直しの一覧に出る。
-- ⚠️ 検索は拡張を入れずに始める（§10 #6）。`pg_trgm` は使わないので
--    索引は `props` の GIN（contrib 不要の jsonb_ops）と部分インデックスだけ。
-- ⚠️ `users.id` / `ai_outputs.id` は TEXT（既存表に合わせる）。
-- ============================================================

-- ── スペース（分野ごとの区分。閲覧範囲の単位） ──────────────────
CREATE TABLE IF NOT EXISTS wiki_spaces (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,                    -- URL に出す短い英数字（/wiki/s/sales）
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  color         TEXT,
  -- all = 全員が読める / members = wiki_space_members に居る人だけ（§8）
  visibility    TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'members')),
  owner_user_id TEXT REFERENCES users(id),               -- 月1回の見直しの担当（§7-5）
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wiki_spaces_order
  ON wiki_spaces(sort_order, name) WHERE deleted_at IS NULL;

-- visibility='members' のときだけ使う。行が無い＝誰も指定していない
CREATE TABLE IF NOT EXISTS wiki_space_members (
  space_id TEXT NOT NULL REFERENCES wiki_spaces(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (space_id, user_id)
);

-- ── ページ（本文の正は body_md） ──────────────────────────────
CREATE TABLE IF NOT EXISTS wiki_pages (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL REFERENCES wiki_spaces(id),
  parent_id     TEXT REFERENCES wiki_pages(id),          -- NULL = スペース直下
  sort_order    INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  body_md       TEXT NOT NULL DEFAULT '',                -- ★ 本文の正。切り詰めない
  -- 見出しだけを抜いた写し。検索でタイトルの次に重く見る（§5-4）。
  -- 本文から作る導出値なので、保存のたびにサーバーが入れ直す。
  headings      TEXT NOT NULL DEFAULT '',
  icon          TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'archived')),
  is_template   BOOLEAN NOT NULL DEFAULT FALSE,
  -- database = 行（子ページ）を持つ親（§4-4）。行そのものは 'page'
  kind          TEXT NOT NULL DEFAULT 'page' CHECK (kind IN ('page', 'database')),
  -- 項目の値（データベースの行のとき）。書き出すと YAML の見出しになる
  props         JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  owner_user_id TEXT REFERENCES users(id),               -- ページの担当（見直しの通知先）
  review_by     DATE,                                     -- 見直し期限（任意・既定なし。§10 #10）
  rev           INTEGER NOT NULL DEFAULT 0,               -- 保存のたびに +1。画面では「第N版」
  ai_output_id  TEXT REFERENCES ai_outputs(id),           -- AI が下書きしたページ。差分の起点（§7-3）
  -- 編集ロック（§6-③）。ページ単位・10分で自動解除・manager は引き継げる
  locked_by     TEXT REFERENCES users(id),
  locked_at     TIMESTAMPTZ,
  lock_requested_by TEXT REFERENCES users(id),
  lock_requested_at TIMESTAMPTZ,
  created_by    TEXT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    TEXT REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);
-- ツリー（スペース > 親 > 並び順）
CREATE INDEX IF NOT EXISTS idx_wiki_pages_tree
  ON wiki_pages(space_id, parent_id, sort_order) WHERE deleted_at IS NULL;
-- 見直しの一覧（期限が入っている公開ページだけ）
CREATE INDEX IF NOT EXISTS idx_wiki_pages_review
  ON wiki_pages(review_by) WHERE status = 'published' AND deleted_at IS NULL AND review_by IS NOT NULL;
-- データベースの行を項目で絞る（拡張の要らない jsonb の GIN）
CREATE INDEX IF NOT EXISTS idx_wiki_pages_props
  ON wiki_pages USING GIN (props);
-- 最近更新・担当のページ
CREATE INDEX IF NOT EXISTS idx_wiki_pages_updated
  ON wiki_pages(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wiki_pages_owner
  ON wiki_pages(owner_user_id) WHERE deleted_at IS NULL;

-- ── データベース（列＝項目とビューの定義。行は wiki_pages の子ページ。§4-4） ──
CREATE TABLE IF NOT EXISTS wiki_databases (
  page_id    TEXT PRIMARY KEY REFERENCES wiki_pages(id) ON DELETE CASCADE,
  -- [{ id, name, type, options[], required }]。type は §4-4 の9種
  -- （text / select / multi_select / date / person / checkbox / number / url / onair_link）
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ id, name, type: table|board|calendar, columns[], sorts[], filters[], groupBy, dateItem }]
  views      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT REFERENCES users(id)
);

-- ── 履歴（保存1回 = 1行。全文を持つ。差分は読むときに2版を比べて作る） ──
CREATE TABLE IF NOT EXISTS wiki_page_versions (
  id       TEXT PRIMARY KEY,
  page_id  TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  rev      INTEGER NOT NULL,
  title    TEXT NOT NULL,
  body_md  TEXT NOT NULL,
  props    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags     TEXT[] NOT NULL DEFAULT '{}',
  saved_by TEXT REFERENCES users(id),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note     TEXT,                                          -- 「何を変えたか」（任意）
  UNIQUE (page_id, rev)
);
CREATE INDEX IF NOT EXISTS idx_wiki_versions_page
  ON wiki_page_versions(page_id, rev DESC);

-- ── リンク（保存時に本文から抜く。バックリンク用） ──────────────
CREATE TABLE IF NOT EXISTS wiki_links (
  from_page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  to_page_id   TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  PRIMARY KEY (from_page_id, to_page_id)
);
CREATE INDEX IF NOT EXISTS idx_wiki_links_to ON wiki_links(to_page_id);

-- ── コメント ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wiki_comments (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES wiki_comments(id),
  body_md     TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES users(id),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wiki_comments_page
  ON wiki_comments(page_id, created_at) WHERE deleted_at IS NULL;

-- ── 画像・小さな添付（§5-5。大きなものは BOX へのリンク） ────────
CREATE TABLE IF NOT EXISTS wiki_files (
  id           TEXT PRIMARY KEY,
  page_id      TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  storage_path TEXT NOT NULL,                             -- uploads/wiki の下の名前
  created_by   TEXT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── お気に入り ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wiki_favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id    TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, page_id)
);

-- ── 閲覧の記録（「よく読まれる」と、AI の出典が開かれたか＝条件3 の材料） ──
CREATE TABLE IF NOT EXISTS wiki_page_views (
  id               BIGSERIAL PRIMARY KEY,
  page_id          TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES users(id),
  via              TEXT NOT NULL CHECK (via IN ('tree', 'search', 'answer', 'link', 'favorite')),
  answer_output_id TEXT REFERENCES ai_outputs(id),        -- via='answer' のとき、どの回答から
  viewed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wiki_views_page
  ON wiki_page_views(page_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wiki_views_answer
  ON wiki_page_views(answer_output_id) WHERE answer_output_id IS NOT NULL;

-- ============================================================
-- AI（§7-4）。段E で使うが、表は器としてここで作る
-- （後から足すと、段E までに書かれたページの記録が残らない）
-- ============================================================

-- 「AI に聞く」のスレッド。**本人のみ**（制作技術支援の壁打ちと同じ判断）
CREATE TABLE IF NOT EXISTS wiki_ai_threads (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  page_id    TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,   -- ページから開いたときの文脈
  space_id   TEXT REFERENCES wiki_spaces(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wiki_ai_threads_owner
  ON wiki_ai_threads(created_by, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS wiki_ai_messages (
  id             TEXT PRIMARY KEY,
  thread_id      TEXT NOT NULL REFERENCES wiki_ai_threads(id) ON DELETE CASCADE,
  -- 表示順。created_at では並べない（同一ミリ秒の user/assistant が入れ替わりうる）
  seq            INTEGER NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_md     TEXT NOT NULL,
  -- [{ pageId, heading, quote }]。空配列 = 出典なし（答えない・§10 #8）
  citations      JSONB,
  confidence     TEXT CHECK (confidence IN ('cited', 'none')),
  ai_output_id   TEXT REFERENCES ai_outputs(id),
  model          TEXT,
  prompt_version TEXT,
  -- 条件2の代わり（§7-3）。対話は「直される」ものではないので3値
  feedback       TEXT CHECK (feedback IN ('good', 'rephrase', 'reject')),
  feedback_note  TEXT,
  feedback_at    TIMESTAMPTZ,
  feedback_by    TEXT REFERENCES users(id),
  -- この発言からページを作ったか（採用の印。④の主指標）
  spawned_page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_wiki_ai_msg_thread ON wiki_ai_messages(thread_id, seq);
CREATE INDEX IF NOT EXISTS idx_wiki_ai_msg_output
  ON wiki_ai_messages(ai_output_id) WHERE ai_output_id IS NOT NULL;

-- 足りないページ（AI が答えられなかった質問。§7-2）
CREATE TABLE IF NOT EXISTS wiki_ai_gaps (
  id           TEXT PRIMARY KEY,
  question     TEXT NOT NULL,
  -- 同じ質問をまとめる鍵（空白・記号を落とした形）。UNIQUE なので回数が数えられる
  normalized   TEXT NOT NULL UNIQUE,
  count        INTEGER NOT NULL DEFAULT 1,
  last_asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  thread_id    TEXT REFERENCES wiki_ai_threads(id) ON DELETE SET NULL,
  space_id     TEXT REFERENCES wiki_spaces(id),           -- 推定した区分（無ければ NULL）
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'written', 'dismissed')),
  page_id      TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
  resolved_by  TEXT REFERENCES users(id),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wiki_ai_gaps_open
  ON wiki_ai_gaps(count DESC, last_asked_at DESC) WHERE status = 'open';

-- ============================================================
-- 最初のスペース（§6-①）。本番は SKIP_SEED=true なので migration で入れる
-- （298→299 と同じ作法）。ページは1本も作らない — 中身は人が書く
-- ============================================================
INSERT INTO wiki_spaces (id, key, name, description, color, visibility, sort_order) VALUES
  ('wsp_all',    'all',      '全社',            '社内ルール・総務・経理',       '#005bac', 'all', 10),
  ('wsp_sales',  'sales',    '営業',            '案件管理の運用・見積のルール', '#4338ca', 'all', 20),
  ('wsp_prod',   'prod',     '制作・技術',      'スタジオ運用・収録・配信の手順', '#c2410e', 'all', 30),
  ('wsp_equip',  'equipment','機材',            '機材ごとの使い方・注意',       '#197a4b', 'all', 40),
  ('wsp_ga',     'ga',       '総務・経理',      '経費・勤怠・申請の手順',       '#6d28d9', 'all', 50),
  ('wsp_onair',  'onair',    'ONAiR の使い方',  '各アプリの操作とルール',       '#5d6470', 'all', 60)
ON CONFLICT (id) DO NOTHING;
