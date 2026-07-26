-- 150: 運営マニュアル (デザイン 22章 29a/29b/29c / 仕様書 §7.8)
--
-- ── PDFを作る機能ではなく、部品を作って最後に束ねる機能 ─────
--
-- いただいた PDF (31ページ) を分解すると、どの案件でも使う部品は12種だった。
-- 部品はそれぞれ別のタイミングで揃うので、**1冊まるごとを1レコードにしない**。
-- 部品ごとに「できているか」を持つと、足りないものを名前で指摘できる。
--
-- ── 部品12種の定義はコードに置く ────────────────────────
--
-- 12種は「最大公約数」として固定なので、DB に置くと
-- 「種類が変わったのか、その案件だけ違うのか」が区別できなくなる。
-- ここに持つのは**その案件の部品の中身と状態**だけ。
--
-- ── 出した版は変わらない ────────────────────────────────
--
-- PDF にした瞬間の中身を残す (`manual_issues.snapshot`)。
-- あとで部品を直しても、配った版は変わらない —
-- 現場で古い紙と新しい紙が混ざったときに、どちらが何版か分かる必要がある。
--
-- ── 配置図の記号はスタッフ表から ────────────────────────
--
-- 記号 (進・AD・C・S…) は人に紐づく。凡例は置いた記号から勝手にできる。
-- 記号の名前を図に写すと、スタッフ表を直しても図が古いままになる。

CREATE TABLE IF NOT EXISTS manuals (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  title        TEXT,
  -- 版数。PDF を出すたびに上がる (表紙と各ページの右下に刷る)
  version      INTEGER NOT NULL DEFAULT 1,
  notes        TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by   TEXT,
  updated_by   TEXT,
  deleted_at   TIMESTAMP,
  UNIQUE (project_id)
);

-- 部品。12種の `kind` はコード側の定数 (MANUAL_PARTS) と対応する
CREATE TABLE IF NOT EXISTS manual_parts (
  id          TEXT PRIMARY KEY,
  manual_id   TEXT NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  -- 中身。部品によって形が違うので JSONB
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- できているか。**白紙のページを作らない**ため、できていないものは印を付けて出す
  ready       BOOLEAN NOT NULL DEFAULT FALSE,
  -- AI が下書きしたか (会場図・配置図)。人が直したあとも印は残す
  ai_drafted  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by  TEXT,
  UNIQUE (manual_id, kind)
);

-- 配置図。場面 (設営・リハ・本番・撤収) ごとに1枚
CREATE TABLE IF NOT EXISTS manual_layouts (
  id          TEXT PRIMARY KEY,
  manual_id   TEXT NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  scene       TEXT NOT NULL,
  -- Box に置いた平面図。これを敷いた上に記号を置く
  floor_plan_box_file_id TEXT,
  -- AI の下書きから作ったか。突合の鍵になる
  ai_output_id TEXT,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (manual_id, scene)
);

-- 図に置いた記号。**記号は人・物を指す** (名前は図に写さない)
CREATE TABLE IF NOT EXISTS manual_layout_items (
  id          TEXT PRIMARY KEY,
  layout_id   TEXT NOT NULL REFERENCES manual_layouts(id) ON DELETE CASCADE,
  -- 記号 (進・AD・C・S・D・T)。凡例はこれを数えて勝手にできる
  mark        TEXT NOT NULL,
  label       TEXT NOT NULL,
  -- 位置は 0〜1000 の相対で持つ (図の大きさが変わってもずれない)
  x           INTEGER NOT NULL DEFAULT 0,
  y           INTEGER NOT NULL DEFAULT 0,
  -- 人に紐づくとき。名前はメンバー側から引く
  member_id   TEXT REFERENCES project_members(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 出した版。**出した瞬間の中身を残す** (あとで部品を直しても配った版は変わらない)
CREATE TABLE IF NOT EXISTS manual_issues (
  id          TEXT PRIMARY KEY,
  manual_id   TEXT NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  -- internal (社内・パートナー) | client (お客様) | staff (当日のアルバイト)
  audience    TEXT NOT NULL,
  snapshot    JSONB NOT NULL,
  page_count  INTEGER NOT NULL DEFAULT 0,
  issued_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  issued_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_manual_parts_manual ON manual_parts(manual_id);
CREATE INDEX IF NOT EXISTS idx_manual_layouts_manual ON manual_layouts(manual_id);
CREATE INDEX IF NOT EXISTS idx_manual_layout_items_layout ON manual_layout_items(layout_id);
CREATE INDEX IF NOT EXISTS idx_manual_issues_manual ON manual_issues(manual_id, version DESC);
