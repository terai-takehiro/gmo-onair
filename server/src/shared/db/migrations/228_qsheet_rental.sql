-- ============================================================
-- 228: 制作技術支援 — レンタル機材検索（ミニアプリ）
--
-- 映像機材レンタル会社2社（東京オフラインセンター／レスター）のサイトから
-- 定期的に取得した機材カタログ（qsheet_rental_items）と、番組・案件ごとの
-- ローカル予約リスト（qsheet_rental_reservations）。
--
-- 予約リストは社内メモ。各社の在庫は押さえない（確定は各社への依頼メールへの
-- 返信で行う）。取り込み元は「レンタル機材DB化プロジェクト」（rental_items.db
-- ／company + item_id が自然主キー）。2社は別会社として必ず company 列で
-- 区別する — 同じ数値IDが両社に存在しても別商品として扱う。
--
-- カタログは company + item_id を自然主キーに持つ（企業の内部通番）。
-- 予約行は自然主キーへの外部キーを張らない — カタログから商品が消えても
-- （レンタル終了・掲載終了）過去の予約行は表示できる必要があるため、
-- item_name / price_net をスナップショットとして持つ。
-- ============================================================

CREATE TABLE IF NOT EXISTS qsheet_rental_items (
  company           TEXT NOT NULL,
  item_id           TEXT NOT NULL,
  name              TEXT NOT NULL,
  category          TEXT,
  subcategory       TEXT,
  price_tel         INTEGER,
  price_net         INTEGER,
  specs             JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_item_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  images            JSONB NOT NULL DEFAULT '[]'::jsonb,
  url               TEXT,
  status            TEXT NOT NULL DEFAULT 'listed', -- 'listed' | 'missing'（掲載終了の可能性）
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company, item_id),
  CONSTRAINT qsheet_rental_items_status_ck CHECK (status IN ('listed', 'missing'))
);

CREATE INDEX IF NOT EXISTS idx_qsheet_rental_items_category
  ON qsheet_rental_items (category);
CREATE INDEX IF NOT EXISTS idx_qsheet_rental_items_name
  ON qsheet_rental_items (name);

CREATE TABLE IF NOT EXISTS qsheet_rental_reservations (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  program_id    TEXT REFERENCES qsheet_programs(id) ON DELETE CASCADE,
  company       TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  item_name     TEXT NOT NULL,        -- 追加時点のスナップショット
  category      TEXT,                 -- 同上
  quantity      INTEGER NOT NULL DEFAULT 1,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  price_net     INTEGER,              -- 追加時点のスナップショット（参考額の計算に使う）
  status        TEXT NOT NULL DEFAULT 'draft', -- 'draft'（未依頼） | 'requested'（依頼済み）
  requested_at  TIMESTAMPTZ,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  -- owner は project / program のどちらか1つ（device-settings と同じ作法。
  -- doc_no はこのミニアプリでは持たない — 資料単体には予約リストを持たせない）
  CONSTRAINT qsheet_rental_res_owner_ck CHECK (num_nonnulls(project_id, program_id) = 1),
  CONSTRAINT qsheet_rental_res_status_ck CHECK (status IN ('draft', 'requested')),
  CONSTRAINT qsheet_rental_res_dates_ck CHECK (end_date >= start_date),
  CONSTRAINT qsheet_rental_res_qty_ck CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_rental_res_owner
  ON qsheet_rental_reservations (COALESCE(project_id, program_id)) WHERE deleted_at IS NULL;
-- 「同じ機材を他番組も依頼予定」の警告（期間の重なり判定）はこの索引で company+item_id を絞ってから
-- daterange の重なりをアプリ側で見る（GiST の除外制約までは今回は持たない — 予約はロックを取らない
-- 社内メモのため、同時実行の厳密な排他は不要と判断）
CREATE INDEX IF NOT EXISTS idx_qsheet_rental_res_item
  ON qsheet_rental_reservations (company, item_id) WHERE deleted_at IS NULL;
