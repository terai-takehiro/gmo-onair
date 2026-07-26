-- 149: 香盤表 (デザイン 21章 28a / 仕様書 §7.8)
--
-- ── 白紙から作らない ──────────────────────────────────
--
-- いまは Excel で作っている。案件には日程・予約・Qシート・機材・メンバーが
-- 既に入っているので、**最初の1枚は自動で組める**。
-- だから「作る」ではなく「入っている予定を並べたものを直す」形にする。
--
-- 自動で入った枠と人が置いた枠を区別できるようにする (`source`) —
-- 区別できないと、組み直したときに人の手直しを消してよいか判断できない。
--
-- ── レーンは「誰・どの部屋」の1本 ────────────────────────
--
-- 縦が時間、横がレーン。レーンは部屋 (会場) と人 (ホスト・MC・テクニカル…) が混在する。
-- **人のレーンは案件メンバーを指す** — 名前を2か所に持つと、片方だけ直された香盤表ができる。
-- だから `member_id` を持ち、表示名はメンバー側から引く。
--
-- ── 社外に出す版でレーンを隠す ──────────────────────────
--
-- お客様に渡す版では社内のレーン (テクニカル・運営) を出さない。
-- 別の香盤表を作ると2枚が食い違うので、**1枚に印を持たせて出すときに外す**。

CREATE TABLE IF NOT EXISTS call_sheets (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  -- 1日 = 1枚 (前日・当日・撤収で分ける)
  sheet_date    TEXT NOT NULL CHECK (sheet_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  title         TEXT,
  -- 目盛りの範囲。既定は 8:00〜22:00 (1時間 = 88px で 30分枠に2行入る)
  start_hour    INTEGER NOT NULL DEFAULT 8,
  end_hour      INTEGER NOT NULL DEFAULT 22,
  -- 完全退館の時刻。撤収がこれをまたいだら警告する
  venue_close   TEXT,
  notes         TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TIMESTAMP,
  UNIQUE (project_id, sheet_date)
);

CREATE TABLE IF NOT EXISTS call_sheet_lanes (
  id            TEXT PRIMARY KEY,
  call_sheet_id TEXT NOT NULL REFERENCES call_sheets(id) ON DELETE CASCADE,
  -- room | person | group (ケータリング・バスなど外部)
  kind          TEXT NOT NULL DEFAULT 'person',
  name          TEXT NOT NULL,
  sub           TEXT,
  -- 部屋のレーンのとき
  room_id       TEXT REFERENCES studio_rooms(id),
  -- 人のレーンのとき。**名前はメンバー側が正** (2か所に持たない)
  member_id     TEXT REFERENCES project_members(id) ON DELETE SET NULL,
  -- 社内だけのレーン (テクニカル・運営)。社外に出す版では外す
  internal_only BOOLEAN NOT NULL DEFAULT FALSE,
  -- 表に出すか (レーンの出し入れ)。消さずに隠す — 消すと置いた枠も消える
  visible       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_sheet_blocks (
  id            TEXT PRIMARY KEY,
  call_sheet_id TEXT NOT NULL REFERENCES call_sheets(id) ON DELETE CASCADE,
  lane_id       TEXT NOT NULL REFERENCES call_sheet_lanes(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  -- 分単位で持つ (0:00 からの分)。px は画面が掛けるだけ —
  -- px を持つと目盛りを変えたときに全部の枠がずれる
  start_min     INTEGER NOT NULL,
  end_min       INTEGER,
  -- setup | rehearsal | performance | break | audience | move | teardown
  category      TEXT NOT NULL DEFAULT 'setup',
  -- auto (自動で入った) | manual (人が置いた)。組み直しで人の手直しを消さないため
  source        TEXT NOT NULL DEFAULT 'manual',
  -- どこから来たか (studio_booking / qsheet / equipment_lending)。組み直しの冪等性に使う
  origin_kind   TEXT,
  origin_id     TEXT,
  note          TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_sheets_project ON call_sheets(project_id, sheet_date);
CREATE INDEX IF NOT EXISTS idx_call_sheet_lanes_sheet ON call_sheet_lanes(call_sheet_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_call_sheet_blocks_sheet ON call_sheet_blocks(call_sheet_id, start_min);
-- 自動で入った枠は「どこから来たか」で1つに絞る (組み直しても増えない)
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_sheet_blocks_origin
  ON call_sheet_blocks(call_sheet_id, origin_kind, origin_id)
  WHERE origin_kind IS NOT NULL;
