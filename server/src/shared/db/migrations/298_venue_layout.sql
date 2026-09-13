-- ============================================================
-- 298: 制作技術支援 — 会場図面（ミニアプリ）段A（器）
--
-- 設計: docs/design/v4/venue-layout.md §5。用賀の図面を2軸で縮尺合わせして
-- 取り込み、備品・人・カメラを実寸で置いて一気に並べ、運営マニュアルに
-- 差し込む道具。この migration は器（表4本）だけ。用賀の実データ（階・エリア・
-- 固定物・備品カタログ）は 299 で入れる（本番は SKIP_SEED=true のため
-- migration で入れる。§10）。DDL の書式（TEXT PRIMARY KEY・TIMESTAMPTZ・
-- deleted_at・owner の CHECK・部分インデックス）は 297（qsheet_manuals）を写す。
--
-- ⚠️ 図面（qsheet_venue_layouts）は project_id / program_id の**どちらか1つ**
--    （§5-1 の CHECK。qsheet_manuals・qsheet_rental_reservations と同じ作法）。
--    doc_no は運営マニュアル・進行台本・スケジュール表と同様、**必ず**発番する
--    （冊子から `sourceId` で指すため。§5-3）。
-- ⚠️ 編集ロック（locked_by/locked_at・§5-6）は図面まるごと1本の排他。
--    `qsheet_manuals` の locked_by/locked_at と同じ形（10分で自動解除）。
-- ⚠️ rev（版）は確定するたびに +1（§5-6・§14 #8）。確定を解いても rev は据え置き。
-- ⚠️ `qsheet_venue_floors`/`qsheet_venue_areas`/`qsheet_venue_catalog_items` は
--    組織共通のマスタ（会場・階・エリア・カタログ）。図面（layouts）だけが
--    案件／番組に紐づく。
-- ============================================================

-- ── 階（1階 = 1行。縮尺合わせと下敷きを持つ。会場を増やすときはここに行を足す＝段F） ──
CREATE TABLE IF NOT EXISTS qsheet_venue_floors (
  id            TEXT PRIMARY KEY,
  venue_name    TEXT NOT NULL,                          -- 例: GMOサムライスタジオ 用賀
  location_id   TEXT REFERENCES studio_locations(id),   -- 任意。カレンダーの拠点と結ぶ
  floor_label   TEXT NOT NULL,                          -- 26F / 27F
  sort_order    INTEGER NOT NULL DEFAULT 0,
  calibration   JSONB NOT NULL DEFAULT '{}'::jsonb,      -- { mmPerPtX, mmPerPtY, originPt, gridLinePt, method }（§8-1）
  grid          JSONB NOT NULL DEFAULT '{}'::jsonb,      -- { x[], y[], pitchMm, totalMm, subTickMm, extra }
  underlay      JSONB NOT NULL DEFAULT '{}'::jsonb,      -- { file, originMm, pxPerMmX, pxPerMmY, widthPx, heightPx }（階全体のサムネ）
  fixtures      JSONB NOT NULL DEFAULT '[]'::jsonb,      -- 固定物の配列（§10-3。kind・bboxMm・estimated）。画面には出さずはみ出し検査にだけ使う（§4-7）
  verification  JSONB NOT NULL DEFAULT '[]'::jsonb,      -- 4点の実測（§8-5。what・expectedMm・measuredMm）
  verified_at   TIMESTAMPTZ,                             -- 「縮尺確認済み」の日時。null なら帯に「縮尺が未確認」
  verified_by   TEXT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- ── エリア（1区画 = 1行。内法の多角形を mm で持つ） ──────────
CREATE TABLE IF NOT EXISTS qsheet_venue_areas (
  id             TEXT PRIMARY KEY,
  floor_id       TEXT NOT NULL REFERENCES qsheet_venue_floors(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,                          -- world-studio / room-a …（階の中で一意）
  label          TEXT NOT NULL,                          -- WORLD STUDIO
  polygon_mm     JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [[x,y],…] 内法（壁の内側）。無ければ bbox を使う
  bbox_mm        JSONB NOT NULL DEFAULT '{}'::jsonb,      -- { x, y, w, h }（階の絶対 mm。§8-4）
  drawn_area_m2  NUMERIC(8,1),                            -- 内法から出した面積（画面に出す）
  shown_area_m2  NUMERIC(8,2),                            -- 図の㎡表記（壁芯のことがある。§10-2）
  room_id        TEXT REFERENCES studio_rooms(id),        -- 任意。名寄せは人が結ぶ（部屋＝エリアとは限らない）
  underlay       JSONB,                                   -- エリア用の下敷き（無ければ階の下敷きを使う）
  estimated      BOOLEAN NOT NULL DEFAULT false,          -- 目視で決めた辺がある（§10-2）
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT qsheet_venue_areas_key_uq UNIQUE (floor_id, key)
);

-- ── 備品カタログ（組織共通・1品目 = 1行。catalog.json の1件をそのまま列に。§11） ──
CREATE TABLE IF NOT EXISTS qsheet_venue_catalog_items (
  key                TEXT PRIMARY KEY,                   -- rubeck-chair / crane-tk53a …。あとから変えない
  category           TEXT NOT NULL
                      CHECK (category IN ('furniture', 'monitor', 'appliance', 'sign', 'service', 'camera', 'people', 'generic')),
  list_no            TEXT,                                -- 備品リストの番号（01-2）。汎用の型・人は NULL
  label              TEXT NOT NULL,                        -- ルベックチェア（12文字以内）
  size_mm            JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { w, d, h, seatH, diameter, variable }
  footprint          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { shape: rect|circle|line|none, w, d, diameter, length }
  qty                INTEGER,                              -- 保有総数。NULL=数えない（人・図形など）
  unit               TEXT,                                 -- 点 / 脚 / 台
  storage            TEXT,                                 -- 保管場所（リストの表記のまま）
  symbol             TEXT NOT NULL,                         -- 絵記号のキー（§4-3）
  front              BOOLEAN NOT NULL DEFAULT false,
  estimated          BOOLEAN NOT NULL DEFAULT false,        -- true の間は札に「寸法は推定」
  to_confirm         TEXT,                                   -- 何を・どこで確かめれば確定できるか
  fixed              BOOLEAN NOT NULL DEFAULT false,        -- 家電（原則移動不可）。図面には出さず参考欄にだけ
  confirmed          JSONB NOT NULL DEFAULT '{}'::jsonb,    -- カメラの確定値（積載・ストローク・最高レンズ軸高）
  extra              JSONB NOT NULL DEFAULT '{}'::jsonb,    -- variants・camera・arm・tail・sweepRadiusMm・estimateRange
  equipment_item_id  TEXT REFERENCES equipment_items(id),   -- 任意。機材台帳への参照（寸法の正はカタログ側）
  sort_order         INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT REFERENCES users(id)
);

-- ── 図面（1件 = 1行。qsheet_manuals と同じ列構成 ＋ 階・エリア・案・品目） ──
CREATE TABLE IF NOT EXISTS qsheet_venue_layouts (
  id                 TEXT PRIMARY KEY,
  doc_no             TEXT,                                 -- VL-202609-0001（sequences.prod_doc_vl）。必ず発番
  title              TEXT NOT NULL DEFAULT '',
  project_id         TEXT REFERENCES projects(id),
  program_id         TEXT REFERENCES qsheet_programs(id),
  floor_id           TEXT NOT NULL REFERENCES qsheet_venue_floors(id),
  area_id            TEXT REFERENCES qsheet_venue_areas(id),  -- null = 階全体
  plan_label         TEXT,                                     -- 案（A案・B案）
  copied_from        TEXT REFERENCES qsheet_venue_layouts(id),
  status             TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'fixed', 'archived')),
  rev                INTEGER NOT NULL DEFAULT 0,               -- 確定するたびに +1（§14 #8）
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,       -- VenueItem[]（§5-2）。上限 300,000 字
  fixed_at           TIMESTAMPTZ,
  fixed_by           TEXT REFERENCES users(id),
  -- 編集ロック（図面まるごと・§5-6。qsheet_manuals と同じ形）
  locked_by          TEXT REFERENCES users(id),
  locked_at          TIMESTAMPTZ,
  lock_requested_by  TEXT REFERENCES users(id),
  lock_requested_at  TIMESTAMPTZ,
  created_by         TEXT REFERENCES users(id),
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT qsheet_venue_layouts_owner_ck CHECK (num_nonnulls(project_id, program_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_venue_layouts_doc_no ON qsheet_venue_layouts(doc_no) WHERE doc_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_layouts_project ON qsheet_venue_layouts(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_layouts_program ON qsheet_venue_layouts(program_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_layouts_floor ON qsheet_venue_layouts(floor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_layouts_created_by ON qsheet_venue_layouts(created_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_areas_floor ON qsheet_venue_areas(floor_id);
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_catalog_items_category ON qsheet_venue_catalog_items(category);
