-- 081: アワード1S CG (下部テロップCG) 用の拡張
-- v2.8.61 で追加。既存 client-awards のランキングCGとはDBを共通利用しつつ、
-- 1S CG 専用の rich fields (ism / skills / recommender / members 等) と
-- 1S CG 用の独立した cue state を持たせる。

-- 1) awards_entries に 1S CG 用の rich data を JSONB で保持
ALTER TABLE awards_entries
  ADD COLUMN IF NOT EXISTS oneshot_data JSONB;

-- 2) 1S CG 用の cue state テーブル (既存 awards_cue_state とは別管理)
--    送出UI(operator) → 送出CG(output) を Socket.IO で同期する
CREATE TABLE IF NOT EXISTS awards_oneshot_cue_state (
  event_id          INTEGER PRIMARY KEY REFERENCES awards_events(id) ON DELETE CASCADE,
  entry_id          INTEGER REFERENCES awards_entries(id) ON DELETE SET NULL,
  module_key        VARCHAR(20) NOT NULL DEFAULT 'title'
                    CHECK (module_key IN ('title','respect','skills','comment','members','recComment','none')),
  ticker_on         BOOLEAN NOT NULL DEFAULT FALSE,
  ticker_cat_idx    INTEGER NOT NULL DEFAULT 0,
  transparent       BOOLEAN NOT NULL DEFAULT FALSE,
  lang              VARCHAR(2) NOT NULL DEFAULT 'ja' CHECK (lang IN ('ja','en')),
  is_live           BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
