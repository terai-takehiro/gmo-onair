-- 147: 合同案件 (デザイン 32章 40a/40b / 仕様書 §7.14)
--
-- ── 既存の「費用を分け合う」とは別の器にする ────────────────
--
-- 既存の `project_groups` は「**1社が払い**、その費用を複数の案件で分ける」形。
-- 売上は1件で請求先も1社、それを案件に配っている (= 社内の原価配分)。
--
-- 合同案件は向きが逆で「**参加社数ぶんの会社がそれぞれ払う**」。
-- 株主総会をグループ9社で開いたら請求書は9枚、宛名も9社。
-- 同じテーブルに両方を入れると「この group_id はどっちの意味か」が
-- 行を見ても分からなくなり、必ず取り違える。**器を分ける。**
--
-- `project_groups` の行は作らない。作ると「費用を分け合う案件のまとまり」の
-- 一覧にも合同案件が並んでしまい、デザインが避けたかった
-- 「同じ画面に2つの意味が混ざる」状態を裏側で作ることになる。
--
-- ── 金額は税抜で持つ ──────────────────────────────────
--
-- 既存の revenues と同じ。消費税と支払額は表示のときに足す。
-- ここだけ税込にすると、9社に配った合計と総額が消費税の端数でずれる。
--
-- ── 割合は整数 (万分率) で持つ ────────────────────────
--
-- 小数で持つと 9 等分のような割り切れない配分で誤差が溜まり、
-- 合計が総額に 1 円合わない。万分率 (basis point) の整数なら
-- 合計が必ず 10000 になるかを整数のまま確かめられる。
--
-- ── あまりの行き先を列で持つ ──────────────────────────
--
-- 8,597,277 円を 9 社で割ると 1 円あまる。既存の費用分けは
-- **黙って先頭の案件に寄せていた**ので、1円が誰に付いたのか画面から追えない。
-- 誰に付けるかを列にして、画面に出して、変えられるようにする。

CREATE TABLE IF NOT EXISTS joint_events (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  event_start           TEXT,
  event_end             TEXT,
  -- 幹事 (取りまとめる会社)。あまりの既定の行き先でもある。
  organizer_customer_id TEXT NOT NULL REFERENCES customers(id),
  -- 自動で作る案件に渡す案件分類。'A' = スタジオ / 'B' = ビジネス。
  -- GLS 発番に必須なので合同案件側で決める (案件ごとに聞き直さない)。
  gls_category          TEXT NOT NULL DEFAULT 'A',
  tax_category          TEXT NOT NULL DEFAULT 'tax10',
  -- 総額 (税抜)。1回だけ入れる。
  total_amount          INTEGER NOT NULL DEFAULT 0,
  -- equal (均等・既定) / ratio (割合) / manual (金額を直接入れる)
  split_mode            TEXT NOT NULL DEFAULT 'equal',
  -- あまりの行き先。NULL なら幹事に付ける。
  remainder_customer_id TEXT REFERENCES customers(id),
  payment_due_date      TEXT,
  notes                 TEXT,
  -- 請求書を出した日時。出したあとは会社の追加ができない。
  issued_at             TIMESTAMP,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by            TEXT,
  updated_by            TEXT,
  deleted_at            TIMESTAMP
);

CREATE TABLE IF NOT EXISTS joint_event_companies (
  id                  TEXT PRIMARY KEY,
  joint_event_id      TEXT NOT NULL REFERENCES joint_events(id),
  customer_id         TEXT NOT NULL REFERENCES customers(id),
  -- 請求先が本社と違うことがある。NULL なら customer_id と同じ。
  billing_customer_id TEXT REFERENCES customers(id),
  -- 会社を選んだ時点で自動で作る案件。手で9個作らせないためにここで紐づける。
  project_id          TEXT REFERENCES projects(id),
  -- 万分率。均等9社なら 1111 が8社 + 1112 が1社 のような形にはせず、
  -- 割合は割合として持ち、あまりは amount 側で足す (割合と金額を混ぜない)。
  ratio_bp            INTEGER NOT NULL DEFAULT 0,
  -- 実際に請求する金額 (税抜)。これが各案件の売上になる。
  amount              INTEGER NOT NULL DEFAULT 0,
  payment_due_date    TEXT,
  -- 出した請求書 (= 確定売上)。出す前は NULL。
  revenue_id          TEXT REFERENCES revenues(id),
  -- 出したあとに抜けた会社。行は消さない (出した請求書は消せないため)。
  cancelled_at        TIMESTAMP,
  -- 取り消しの請求書 (マイナスの売上)。番号は別に採る。
  cancel_revenue_id   TEXT REFERENCES revenues(id),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (joint_event_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_joint_event_companies_event
  ON joint_event_companies(joint_event_id);
CREATE INDEX IF NOT EXISTS idx_joint_event_companies_project
  ON joint_event_companies(project_id);
CREATE INDEX IF NOT EXISTS idx_joint_events_deleted
  ON joint_events(deleted_at);
