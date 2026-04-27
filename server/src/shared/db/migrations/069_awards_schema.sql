-- 069: 表彰CG ブロックアプリ (client-awards)

CREATE TABLE IF NOT EXISTS awards_events (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  subtitle     VARCHAR(300),
  description  TEXT,
  scheduled_at TIMESTAMPTZ,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','live','closed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS awards_categories (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES awards_events(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_awards_categories_event
  ON awards_categories(event_id, display_order);

CREATE TABLE IF NOT EXISTS awards_entries (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES awards_events(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES awards_categories(id) ON DELETE CASCADE,
  rank        SMALLINT,
  name        VARCHAR(300) NOT NULL,
  org         VARCHAR(300),
  points      INTEGER,
  photo_url   TEXT,
  is_winner   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_awards_entries_category
  ON awards_entries(category_id, rank NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_awards_entries_event
  ON awards_entries(event_id);

-- Per-event singleton cue state (upserted on change)
CREATE TABLE IF NOT EXISTS awards_cue_state (
  event_id      INTEGER PRIMARY KEY REFERENCES awards_events(id) ON DELETE CASCADE,
  step          VARCHAR(20) NOT NULL DEFAULT 'idle'
                CHECK (step IN ('idle','title','nominees','ranks52','winner-bar','oneshot')),
  category_id   INTEGER REFERENCES awards_categories(id) ON DELETE SET NULL,
  oneshot_style VARCHAR(20) NOT NULL DEFAULT 'classic'
                CHECK (oneshot_style IN ('classic','shards','spotlight','slit')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
