-- 133: 日常業務アプリ (dailyops) — スタジオ セキュリティカード管理
-- GMOサムライスタジオ用賀 (現時点は用賀のみ) のセキュリティカード 24 枚を管理する。
-- 各カードはセキュリティレベルに応じて解錠できる部屋 (エリア) が異なる (access JSONB)。
-- どの会社・担当者にどのカードを、いつからいつまで貸し出したか (貸出/返却) を記録する。
-- 貸出対応者は GMO ONAiR のユーザー (users) のみ。

-- カード台帳 (24 枚 = 参照データ。access はセキュリティレベルで固定)
CREATE TABLE IF NOT EXISTS security_cards (
  id             TEXT PRIMARY KEY,
  studio         TEXT NOT NULL DEFAULT 'yoga',      -- スタジオ拠点キー (現時点は 'yoga' = GMOサムライスタジオ用賀 のみ)
  card_no        INTEGER NOT NULL,                   -- カード番号 (1-24)
  label          TEXT,                                -- 任意の表示名/メモ
  security_level TEXT NOT NULL,                        -- グルーピングキー (master/room_a/room_b/room_c/meeting/vip)
  level_label    TEXT NOT NULL,                         -- セキュリティレベルの表示名
  access         JSONB NOT NULL DEFAULT '{}'::jsonb,     -- エリアキー -> boolean (解錠可否)
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,          -- 貸出運用対象か (紛失/廃止で false)
  notes          TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);
-- 拠点内でカード番号は一意
CREATE UNIQUE INDEX IF NOT EXISTS uq_security_cards_studio_no
  ON security_cards(studio, card_no) WHERE deleted_at IS NULL;

-- 貸出/返却の記録 (1 貸出 = 1 行。返却で returned_on + status=returned)
CREATE TABLE IF NOT EXISTS security_card_lendings (
  id                 TEXT PRIMARY KEY,
  card_id            TEXT NOT NULL REFERENCES security_cards(id),
  -- 貸出先
  borrower_company   TEXT,                             -- 貸出先の会社
  borrower_person    TEXT NOT NULL,                     -- 貸出先の担当者
  borrower_contact   TEXT,                              -- 連絡先 (任意)
  purpose            TEXT,                              -- 利用目的 (任意)
  -- 貸出期間
  lent_on            DATE NOT NULL,                     -- 貸出日
  due_on             DATE,                              -- 返却予定日
  returned_on        DATE,                              -- 実返却日 (NULL = 貸出中)
  -- 対応者 (GMO ONAiR ユーザー)
  lent_by_user_id     TEXT,                             -- 貸出対応者 (users.id)
  lent_by_name        TEXT,                             -- 貸出対応者名 (スナップショット)
  returned_by_user_id TEXT,                             -- 返却対応者 (users.id)
  returned_by_name    TEXT,                             -- 返却対応者名 (スナップショット)
  notes              TEXT,                              -- メモ (貸出時/返却時の備考を集約)
  status             TEXT NOT NULL DEFAULT 'active',    -- active (貸出中) / returned (返却済み)
  requested_by       TEXT,                              -- AI (MCP) 経由の指示者
  created_by         TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_seccard_lending_card ON security_card_lendings(card_id, status);
CREATE INDEX IF NOT EXISTS idx_seccard_lending_lent_on ON security_card_lendings(lent_on DESC);
-- 1 枚のカードに同時に active な貸出は 1 件のみ (二重貸出を DB レベルで防止)
CREATE UNIQUE INDEX IF NOT EXISTS uq_seccard_active_lending
  ON security_card_lendings(card_id) WHERE status = 'active' AND deleted_at IS NULL;

-- ── 24 枚のシード (GMOサムライスタジオ用賀。id 固定で冪等) ──────────────
-- エリアキー: office 執務室 / cargo_ev 通用口(貨物EV) / private_ev 通用口(占有EV) /
--   room_a ROOM A / room_b ROOM B / room_c ROOM C / meeting MEETING ROOM /
--   vip VIP LOUNGE / tech_storage 技術倉庫 (以上 27F) / soc1 第1SOC (26F)

-- No.1-9: フル (マスター) — 全エリア解錠
INSERT INTO security_cards (id, studio, card_no, security_level, level_label, access)
SELECT 'seccard-yoga-' || lpad(n::text, 2, '0'), 'yoga', n, 'master', 'フル (マスター)',
  '{"office":true,"cargo_ev":true,"private_ev":true,"room_a":true,"room_b":true,"room_c":true,"meeting":true,"vip":true,"tech_storage":true,"soc1":true}'::jsonb
FROM generate_series(1, 9) n
WHERE NOT EXISTS (SELECT 1 FROM security_cards s WHERE s.id = 'seccard-yoga-' || lpad(n::text, 2, '0'));

-- No.10-12: ROOM A + 会議室
INSERT INTO security_cards (id, studio, card_no, security_level, level_label, access)
SELECT 'seccard-yoga-' || lpad(n::text, 2, '0'), 'yoga', n, 'room_a', 'ROOM A + 会議室',
  '{"office":false,"cargo_ev":false,"private_ev":false,"room_a":true,"room_b":false,"room_c":false,"meeting":true,"vip":false,"tech_storage":false,"soc1":false}'::jsonb
FROM generate_series(10, 12) n
WHERE NOT EXISTS (SELECT 1 FROM security_cards s WHERE s.id = 'seccard-yoga-' || lpad(n::text, 2, '0'));

-- No.13-15: ROOM B + 会議室
INSERT INTO security_cards (id, studio, card_no, security_level, level_label, access)
SELECT 'seccard-yoga-' || lpad(n::text, 2, '0'), 'yoga', n, 'room_b', 'ROOM B + 会議室',
  '{"office":false,"cargo_ev":false,"private_ev":false,"room_a":false,"room_b":true,"room_c":false,"meeting":true,"vip":false,"tech_storage":false,"soc1":false}'::jsonb
FROM generate_series(13, 15) n
WHERE NOT EXISTS (SELECT 1 FROM security_cards s WHERE s.id = 'seccard-yoga-' || lpad(n::text, 2, '0'));

-- No.16-18: ROOM C + 会議室
INSERT INTO security_cards (id, studio, card_no, security_level, level_label, access)
SELECT 'seccard-yoga-' || lpad(n::text, 2, '0'), 'yoga', n, 'room_c', 'ROOM C + 会議室',
  '{"office":false,"cargo_ev":false,"private_ev":false,"room_a":false,"room_b":false,"room_c":true,"meeting":true,"vip":false,"tech_storage":false,"soc1":false}'::jsonb
FROM generate_series(16, 18) n
WHERE NOT EXISTS (SELECT 1 FROM security_cards s WHERE s.id = 'seccard-yoga-' || lpad(n::text, 2, '0'));

-- No.19-21: 会議室のみ
INSERT INTO security_cards (id, studio, card_no, security_level, level_label, access)
SELECT 'seccard-yoga-' || lpad(n::text, 2, '0'), 'yoga', n, 'meeting', '会議室のみ',
  '{"office":false,"cargo_ev":false,"private_ev":false,"room_a":false,"room_b":false,"room_c":false,"meeting":true,"vip":false,"tech_storage":false,"soc1":false}'::jsonb
FROM generate_series(19, 21) n
WHERE NOT EXISTS (SELECT 1 FROM security_cards s WHERE s.id = 'seccard-yoga-' || lpad(n::text, 2, '0'));

-- No.22-24: 会議室 + VIP LOUNGE
INSERT INTO security_cards (id, studio, card_no, security_level, level_label, access)
SELECT 'seccard-yoga-' || lpad(n::text, 2, '0'), 'yoga', n, 'vip', '会議室 + VIP LOUNGE',
  '{"office":false,"cargo_ev":false,"private_ev":false,"room_a":false,"room_b":false,"room_c":false,"meeting":true,"vip":true,"tech_storage":false,"soc1":false}'::jsonb
FROM generate_series(22, 24) n
WHERE NOT EXISTS (SELECT 1 FROM security_cards s WHERE s.id = 'seccard-yoga-' || lpad(n::text, 2, '0'));
