-- 休日・営業時間 — v4 設定 ⑥
--
-- ── 予約は止めない。印を付けて拾えるようにする ──────────────
--
-- ご判断のとおり**注意を出して通します**。強く止めると、当日いま入れたい
-- 予約が入らなくなって業務が止まります。着手前は**時間の検査が1行も無く**、
-- 何時でも予約が作れました。ここで初めて制限をかける形になるので、
-- 一番ゆるい段から始めます。
--
-- ── 既存の予約には触らない ──────────────────────────────────
--
-- モックの指定:「すでに入っている予約は、あとから休業日にしても消えません。
-- 動かす必要がある予約は一覧で確認して個別に連絡してください」
-- → **1 行も UPDATE しません。** 印（`out_of_hours`）は既定 false で、
--    これから作る／直す予約にだけ付きます。
--
-- ── 割増（＋30％・＋50％）は持たない ────────────────────────
--
-- モックは曜日ごとに割増率を持っていますが、**何に掛けるか（スタジオ代だけか
-- 人件費もか、時間外の分だけか全体か）が決まっていない**ので列を作りません。
-- 決まっていない値を列にすると、入っている数字が正しいと読まれます（ご判断）。

-- ── 曜日ごとの営業時間 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_hours (
  location_id TEXT NOT NULL REFERENCES studio_locations(id) ON DELETE CASCADE,
  -- 0=日 … 6=土
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  -- `HH:MM`。**両方 NULL = その曜日は休み**
  -- 24 時を超える営業（翌 2:00 まで）は `26:00` と書く。日付をまたぐ表現を
  -- 「翌日の 02:00」にすると、営業時間の比較が日付をまたいで複雑になる
  open_time   TEXT,
  close_time  TEXT,
  -- 営業時間外の受付。accept 受け付ける / consult 相談のうえ / reject 受け付けない
  over_policy TEXT NOT NULL DEFAULT 'accept' CHECK (over_policy IN ('accept', 'consult', 'reject')),
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (location_id, weekday),
  -- 片方だけ入っている行を作らせない（「9:00 から、終わりは未定」は運用できない）
  CONSTRAINT business_hours_pair CHECK ((open_time IS NULL) = (close_time IS NULL))
);

-- ── 休業日 ──────────────────────────────────────────────────
--
-- `location_id IS NULL` = **全拠点に効く**（全社休業・祝日）。
-- 拠点ごとの行があればそちらが優先（`businessHours.ts` の解決順）。
-- こうしないと、祝日 16 日 × 拠点 4 = 64 行を毎年作ることになる。
CREATE TABLE IF NOT EXISTS closed_days (
  id           TEXT PRIMARY KEY,
  location_id  TEXT REFERENCES studio_locations(id) ON DELETE CASCADE,
  from_date    TEXT NOT NULL,
  to_date      TEXT NOT NULL,
  name         TEXT NOT NULL,
  -- company 全社 / holiday 祝日 / site 拠点
  kind         TEXT NOT NULL DEFAULT 'company' CHECK (kind IN ('company', 'holiday', 'site')),
  -- open 営業する（注意も出さない）/ consult 相談のうえ / partial 一部のみ / none 受け付けない
  --
  -- **祝日の初期値は `open`。** 放送・制作は祝日こそ稼働することがあり、
  -- いきなり「相談のうえ」にすると**祝日の予約すべてに注意が出て**うるさいだけになります。
  -- 表には並べておき、拠点ごとに「この祝日は休む」と決めてもらう形にします
  -- （＝この migration を当てても**予約の見え方は1つも変わりません**）。
  availability TEXT NOT NULL DEFAULT 'none' CHECK (availability IN ('open', 'none', 'consult', 'partial')),
  -- **春分・秋分は予測**（政府が前年2月に公示するまで確定しない）。
  -- 公示に合わせて直せるように印を持つ
  estimated    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT closed_days_range CHECK (from_date <= to_date)
);

CREATE INDEX IF NOT EXISTS idx_closed_days_range
  ON closed_days(from_date, to_date) WHERE deleted_at IS NULL;

-- ── 予約に「時間外」の印を持たせる ──────────────────────────
--
-- **既定 false で、既存の行は 1 つも書き換えません。**
-- 遡って印を付けると「昔から時間外だった予約」が大量に一覧へ出て、
-- どれが本当に確認すべきものか分からなくなります。
ALTER TABLE studio_bookings ADD COLUMN IF NOT EXISTS out_of_hours BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE studio_bookings ADD COLUMN IF NOT EXISTS out_of_hours_reason TEXT;

-- ── 初期の営業時間（モックの HOURS）────────────────────────
--
-- 用賀・渋谷・青山はモックの値。**外現場は入れません** — こちらの営業時間で
-- お客様の会場を縛るのはおかしいので、決めていない状態（＝止めない）にする。
INSERT INTO business_hours (location_id, weekday, open_time, close_time, over_policy, note) VALUES
  ('loc-yoga', 1, '09:00', '22:00', 'accept', NULL),
  ('loc-yoga', 2, '09:00', '22:00', 'accept', NULL),
  ('loc-yoga', 3, '09:00', '22:00', 'accept', NULL),
  ('loc-yoga', 4, '09:00', '22:00', 'accept', NULL),
  ('loc-yoga', 5, '09:00', '24:00', 'accept', '深夜帯は要事前相談'),
  ('loc-yoga', 6, '10:00', '20:00', 'consult', '立会いは 1 名体制'),
  ('loc-yoga', 0, NULL, NULL, 'reject', '緊急対応は当番へ'),

  ('loc-shibuya', 1, '10:00', '21:00', 'accept', NULL),
  ('loc-shibuya', 2, '10:00', '21:00', 'accept', NULL),
  ('loc-shibuya', 3, '10:00', '21:00', 'accept', NULL),
  ('loc-shibuya', 4, '10:00', '21:00', 'accept', NULL),
  ('loc-shibuya', 5, '10:00', '21:00', 'accept', NULL),
  ('loc-shibuya', 6, NULL, NULL, 'consult', '前週水曜までに相談'),
  ('loc-shibuya', 0, NULL, NULL, 'reject', NULL),

  ('loc-aoyama', 1, '09:00', '21:00', 'accept', NULL),
  ('loc-aoyama', 2, '09:00', '21:00', 'accept', NULL),
  ('loc-aoyama', 3, '09:00', '21:00', 'accept', NULL),
  ('loc-aoyama', 4, '09:00', '21:00', 'accept', NULL),
  ('loc-aoyama', 5, '09:00', '21:00', 'accept', NULL),
  ('loc-aoyama', 6, '10:00', '18:00', 'consult', NULL),
  ('loc-aoyama', 0, NULL, NULL, 'reject', NULL)
ON CONFLICT (location_id, weekday) DO NOTHING;

-- ── 年末年始・夏季休業（全社）────────────────────────────
INSERT INTO closed_days (id, location_id, from_date, to_date, name, kind, availability) VALUES
  ('cd-newyear-2026', NULL, '2026-01-01', '2026-01-03', '年始休業', 'company', 'none'),
  ('cd-summer-2026',  NULL, '2026-08-13', '2026-08-16', '夏季休業', 'company', 'none'),
  ('cd-yearend-2026', NULL, '2026-12-29', '2026-12-31', '年末休業', 'company', 'none'),
  ('cd-newyear-2027', NULL, '2027-01-01', '2027-01-03', '年始休業', 'company', 'none'),
  ('cd-summer-2027',  NULL, '2027-08-13', '2027-08-16', '夏季休業', 'company', 'none'),
  ('cd-yearend-2027', NULL, '2027-12-29', '2027-12-31', '年末休業', 'company', 'none')
ON CONFLICT (id) DO NOTHING;

-- ── 祝日 2026〜2030（89 件）────────────────────────────────
--
-- **手で打っていません。** `server/src/shared/services/holidays.ts` が計算した
-- 結果をそのまま書き出しています（`shared/tests/holidays.test.ts` が
-- 実績・振替休日・国民の休日・曜日の数え方を 18 項目で固定している）。
--
-- **初期値は `open`（営業する）。** 表に並べるだけで、この migration を
-- 当てても予約の見え方は 1 つも変わりません。拠点ごとに「この祝日は休む」と
-- 決めたときに `availability` を変えます。
--
-- `estimated = true` は春分・秋分（およびその振替・国民の休日）。
-- **政府が前年 2 月に公示するまで確定しない予測**なので、画面に印を出します。
INSERT INTO closed_days (id, location_id, from_date, to_date, name, kind, availability, estimated) VALUES
  ('cd-hol-2026-01-01', NULL, '2026-01-01', '2026-01-01', '元日', 'holiday', 'open', false),
  ('cd-hol-2026-01-12', NULL, '2026-01-12', '2026-01-12', '成人の日', 'holiday', 'open', false),
  ('cd-hol-2026-02-11', NULL, '2026-02-11', '2026-02-11', '建国記念の日', 'holiday', 'open', false),
  ('cd-hol-2026-02-23', NULL, '2026-02-23', '2026-02-23', '天皇誕生日', 'holiday', 'open', false),
  ('cd-hol-2026-03-20', NULL, '2026-03-20', '2026-03-20', '春分の日', 'holiday', 'open', true),
  ('cd-hol-2026-04-29', NULL, '2026-04-29', '2026-04-29', '昭和の日', 'holiday', 'open', false),
  ('cd-hol-2026-05-03', NULL, '2026-05-03', '2026-05-03', '憲法記念日', 'holiday', 'open', false),
  ('cd-hol-2026-05-04', NULL, '2026-05-04', '2026-05-04', 'みどりの日', 'holiday', 'open', false),
  ('cd-hol-2026-05-05', NULL, '2026-05-05', '2026-05-05', 'こどもの日', 'holiday', 'open', false),
  ('cd-hol-2026-05-06', NULL, '2026-05-06', '2026-05-06', '振替休日', 'holiday', 'open', false),
  ('cd-hol-2026-07-20', NULL, '2026-07-20', '2026-07-20', '海の日', 'holiday', 'open', false),
  ('cd-hol-2026-08-11', NULL, '2026-08-11', '2026-08-11', '山の日', 'holiday', 'open', false),
  ('cd-hol-2026-09-21', NULL, '2026-09-21', '2026-09-21', '敬老の日', 'holiday', 'open', false),
  ('cd-hol-2026-09-22', NULL, '2026-09-22', '2026-09-22', '国民の休日', 'holiday', 'open', true),
  ('cd-hol-2026-09-23', NULL, '2026-09-23', '2026-09-23', '秋分の日', 'holiday', 'open', true),
  ('cd-hol-2026-10-12', NULL, '2026-10-12', '2026-10-12', 'スポーツの日', 'holiday', 'open', false),
  ('cd-hol-2026-11-03', NULL, '2026-11-03', '2026-11-03', '文化の日', 'holiday', 'open', false),
  ('cd-hol-2026-11-23', NULL, '2026-11-23', '2026-11-23', '勤労感謝の日', 'holiday', 'open', false),
  ('cd-hol-2027-01-01', NULL, '2027-01-01', '2027-01-01', '元日', 'holiday', 'open', false),
  ('cd-hol-2027-01-11', NULL, '2027-01-11', '2027-01-11', '成人の日', 'holiday', 'open', false),
  ('cd-hol-2027-02-11', NULL, '2027-02-11', '2027-02-11', '建国記念の日', 'holiday', 'open', false),
  ('cd-hol-2027-02-23', NULL, '2027-02-23', '2027-02-23', '天皇誕生日', 'holiday', 'open', false),
  ('cd-hol-2027-03-21', NULL, '2027-03-21', '2027-03-21', '春分の日', 'holiday', 'open', true),
  ('cd-hol-2027-03-22', NULL, '2027-03-22', '2027-03-22', '振替休日', 'holiday', 'open', true),
  ('cd-hol-2027-04-29', NULL, '2027-04-29', '2027-04-29', '昭和の日', 'holiday', 'open', false),
  ('cd-hol-2027-05-03', NULL, '2027-05-03', '2027-05-03', '憲法記念日', 'holiday', 'open', false),
  ('cd-hol-2027-05-04', NULL, '2027-05-04', '2027-05-04', 'みどりの日', 'holiday', 'open', false),
  ('cd-hol-2027-05-05', NULL, '2027-05-05', '2027-05-05', 'こどもの日', 'holiday', 'open', false),
  ('cd-hol-2027-07-19', NULL, '2027-07-19', '2027-07-19', '海の日', 'holiday', 'open', false),
  ('cd-hol-2027-08-11', NULL, '2027-08-11', '2027-08-11', '山の日', 'holiday', 'open', false),
  ('cd-hol-2027-09-20', NULL, '2027-09-20', '2027-09-20', '敬老の日', 'holiday', 'open', false),
  ('cd-hol-2027-09-23', NULL, '2027-09-23', '2027-09-23', '秋分の日', 'holiday', 'open', true),
  ('cd-hol-2027-10-11', NULL, '2027-10-11', '2027-10-11', 'スポーツの日', 'holiday', 'open', false),
  ('cd-hol-2027-11-03', NULL, '2027-11-03', '2027-11-03', '文化の日', 'holiday', 'open', false),
  ('cd-hol-2027-11-23', NULL, '2027-11-23', '2027-11-23', '勤労感謝の日', 'holiday', 'open', false),
  ('cd-hol-2028-01-01', NULL, '2028-01-01', '2028-01-01', '元日', 'holiday', 'open', false),
  ('cd-hol-2028-01-10', NULL, '2028-01-10', '2028-01-10', '成人の日', 'holiday', 'open', false),
  ('cd-hol-2028-02-11', NULL, '2028-02-11', '2028-02-11', '建国記念の日', 'holiday', 'open', false),
  ('cd-hol-2028-02-23', NULL, '2028-02-23', '2028-02-23', '天皇誕生日', 'holiday', 'open', false),
  ('cd-hol-2028-03-20', NULL, '2028-03-20', '2028-03-20', '春分の日', 'holiday', 'open', true),
  ('cd-hol-2028-04-29', NULL, '2028-04-29', '2028-04-29', '昭和の日', 'holiday', 'open', false),
  ('cd-hol-2028-05-03', NULL, '2028-05-03', '2028-05-03', '憲法記念日', 'holiday', 'open', false),
  ('cd-hol-2028-05-04', NULL, '2028-05-04', '2028-05-04', 'みどりの日', 'holiday', 'open', false),
  ('cd-hol-2028-05-05', NULL, '2028-05-05', '2028-05-05', 'こどもの日', 'holiday', 'open', false),
  ('cd-hol-2028-07-17', NULL, '2028-07-17', '2028-07-17', '海の日', 'holiday', 'open', false),
  ('cd-hol-2028-08-11', NULL, '2028-08-11', '2028-08-11', '山の日', 'holiday', 'open', false),
  ('cd-hol-2028-09-18', NULL, '2028-09-18', '2028-09-18', '敬老の日', 'holiday', 'open', false),
  ('cd-hol-2028-09-22', NULL, '2028-09-22', '2028-09-22', '秋分の日', 'holiday', 'open', true),
  ('cd-hol-2028-10-09', NULL, '2028-10-09', '2028-10-09', 'スポーツの日', 'holiday', 'open', false),
  ('cd-hol-2028-11-03', NULL, '2028-11-03', '2028-11-03', '文化の日', 'holiday', 'open', false),
  ('cd-hol-2028-11-23', NULL, '2028-11-23', '2028-11-23', '勤労感謝の日', 'holiday', 'open', false),
  ('cd-hol-2029-01-01', NULL, '2029-01-01', '2029-01-01', '元日', 'holiday', 'open', false),
  ('cd-hol-2029-01-08', NULL, '2029-01-08', '2029-01-08', '成人の日', 'holiday', 'open', false),
  ('cd-hol-2029-02-11', NULL, '2029-02-11', '2029-02-11', '建国記念の日', 'holiday', 'open', false),
  ('cd-hol-2029-02-12', NULL, '2029-02-12', '2029-02-12', '振替休日', 'holiday', 'open', false),
  ('cd-hol-2029-02-23', NULL, '2029-02-23', '2029-02-23', '天皇誕生日', 'holiday', 'open', false),
  ('cd-hol-2029-03-20', NULL, '2029-03-20', '2029-03-20', '春分の日', 'holiday', 'open', true),
  ('cd-hol-2029-04-29', NULL, '2029-04-29', '2029-04-29', '昭和の日', 'holiday', 'open', false),
  ('cd-hol-2029-04-30', NULL, '2029-04-30', '2029-04-30', '振替休日', 'holiday', 'open', false),
  ('cd-hol-2029-05-03', NULL, '2029-05-03', '2029-05-03', '憲法記念日', 'holiday', 'open', false),
  ('cd-hol-2029-05-04', NULL, '2029-05-04', '2029-05-04', 'みどりの日', 'holiday', 'open', false),
  ('cd-hol-2029-05-05', NULL, '2029-05-05', '2029-05-05', 'こどもの日', 'holiday', 'open', false),
  ('cd-hol-2029-07-16', NULL, '2029-07-16', '2029-07-16', '海の日', 'holiday', 'open', false),
  ('cd-hol-2029-08-11', NULL, '2029-08-11', '2029-08-11', '山の日', 'holiday', 'open', false),
  ('cd-hol-2029-09-17', NULL, '2029-09-17', '2029-09-17', '敬老の日', 'holiday', 'open', false),
  ('cd-hol-2029-09-23', NULL, '2029-09-23', '2029-09-23', '秋分の日', 'holiday', 'open', true),
  ('cd-hol-2029-09-24', NULL, '2029-09-24', '2029-09-24', '振替休日', 'holiday', 'open', true),
  ('cd-hol-2029-10-08', NULL, '2029-10-08', '2029-10-08', 'スポーツの日', 'holiday', 'open', false),
  ('cd-hol-2029-11-03', NULL, '2029-11-03', '2029-11-03', '文化の日', 'holiday', 'open', false),
  ('cd-hol-2029-11-23', NULL, '2029-11-23', '2029-11-23', '勤労感謝の日', 'holiday', 'open', false),
  ('cd-hol-2030-01-01', NULL, '2030-01-01', '2030-01-01', '元日', 'holiday', 'open', false),
  ('cd-hol-2030-01-14', NULL, '2030-01-14', '2030-01-14', '成人の日', 'holiday', 'open', false),
  ('cd-hol-2030-02-11', NULL, '2030-02-11', '2030-02-11', '建国記念の日', 'holiday', 'open', false),
  ('cd-hol-2030-02-23', NULL, '2030-02-23', '2030-02-23', '天皇誕生日', 'holiday', 'open', false),
  ('cd-hol-2030-03-20', NULL, '2030-03-20', '2030-03-20', '春分の日', 'holiday', 'open', true),
  ('cd-hol-2030-04-29', NULL, '2030-04-29', '2030-04-29', '昭和の日', 'holiday', 'open', false),
  ('cd-hol-2030-05-03', NULL, '2030-05-03', '2030-05-03', '憲法記念日', 'holiday', 'open', false),
  ('cd-hol-2030-05-04', NULL, '2030-05-04', '2030-05-04', 'みどりの日', 'holiday', 'open', false),
  ('cd-hol-2030-05-05', NULL, '2030-05-05', '2030-05-05', 'こどもの日', 'holiday', 'open', false),
  ('cd-hol-2030-05-06', NULL, '2030-05-06', '2030-05-06', '振替休日', 'holiday', 'open', false),
  ('cd-hol-2030-07-15', NULL, '2030-07-15', '2030-07-15', '海の日', 'holiday', 'open', false),
  ('cd-hol-2030-08-11', NULL, '2030-08-11', '2030-08-11', '山の日', 'holiday', 'open', false),
  ('cd-hol-2030-08-12', NULL, '2030-08-12', '2030-08-12', '振替休日', 'holiday', 'open', false),
  ('cd-hol-2030-09-16', NULL, '2030-09-16', '2030-09-16', '敬老の日', 'holiday', 'open', false),
  ('cd-hol-2030-09-23', NULL, '2030-09-23', '2030-09-23', '秋分の日', 'holiday', 'open', true),
  ('cd-hol-2030-10-14', NULL, '2030-10-14', '2030-10-14', 'スポーツの日', 'holiday', 'open', false),
  ('cd-hol-2030-11-03', NULL, '2030-11-03', '2030-11-03', '文化の日', 'holiday', 'open', false),
  ('cd-hol-2030-11-04', NULL, '2030-11-04', '2030-11-04', '振替休日', 'holiday', 'open', false),
  ('cd-hol-2030-11-23', NULL, '2030-11-23', '2030-11-23', '勤労感謝の日', 'holiday', 'open', false)
ON CONFLICT (id) DO NOTHING;
