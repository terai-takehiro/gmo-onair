-- 148: 隔週キープをつくる (デザイン 29章 35a-c / 仕様書 §7.3)
--
-- ── 型は変えない。変えるのは「誰が埋めるか」だけ ──────────
--
-- GMO流会議フォーマット Ver.2.5 の11の型は固定なので、**ページの構成は
-- コードの定数に置く** (`keep-deck.service.ts` の KEEP_PAGES)。
-- DB に持つのは「人が書いた分」と「その回に足した議題」だけ。
--
-- 数字 (売上・仕入・販管費・稼働・タスク・予約) は既に ONAiR の中にあり、
-- 既存のサービス (monthly-pl / project_tasks / event_reports) がそのまま読める。
-- **ここに写し取らない** — 写すと元が直っても資料が古いままになる。
--
-- ── 過去分は削除しない ──────────────────────────────────
--
-- Ver.2.5 の決まりで過去分は Appendix に移して残す (削除厳禁)。
-- そのため行は消さず、meeting_date で1回ぶんずつ積み上げる。

CREATE TABLE IF NOT EXISTS keep_meetings (
  -- 1行 = 1回のキープ。開催日が鍵 (同じ日を二度作らない)
  meeting_date     TEXT PRIMARY KEY CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  format_version   TEXT NOT NULL DEFAULT 'Ver.2.5',
  -- ①の「人が書く3行」。数字は AI が入れるので、書くのは理由と相談だけ。
  -- 空でも進める (書かないという判断も記録として残す)。
  answer_moved     TEXT,   -- この2週間で何が動きましたか
  answer_stuck     TEXT,   -- うまくいっていないことは何ですか
  answer_consult   TEXT,   -- 社長に相談したいことはありますか
  -- 確定すると PDF に出せる。確定前でも投影はできる。
  confirmed_at     TIMESTAMP,
  pdf_box_file_id  TEXT,
  next_meeting_date TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by       TEXT,
  updated_by       TEXT
);

-- ③重点取組課題。**テーマと担当は固定**なので毎回作り直さない
-- (定数側に持つ)。ここに入るのは「人が書く1行」だけ。
CREATE TABLE IF NOT EXISTS keep_theme_notes (
  meeting_date TEXT NOT NULL REFERENCES keep_meetings(meeting_date) ON DELETE CASCADE,
  theme_no     INTEGER NOT NULL,
  -- 打ち手 (人しか決められない)
  human_line   TEXT,
  -- 社長に相談したいこと (任意)
  consult_line TEXT,
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_date, theme_no)
);

-- ④以降の議題。**議題があるときだけ足す**。
-- レギュラーでない議題を毎回の型に混ぜると、無い回に空のページが残る。
CREATE TABLE IF NOT EXISTS keep_agenda_items (
  id           TEXT PRIMARY KEY,
  meeting_date TEXT NOT NULL REFERENCES keep_meetings(meeting_date) ON DELETE CASCADE,
  -- 候補のキー (construction / hiring / group_support / other)。other は自由記述
  kind         TEXT NOT NULL,
  label        TEXT NOT NULL,
  note         TEXT,
  -- 時間配分。足すと自動で付く
  minutes      INTEGER NOT NULL DEFAULT 15,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keep_agenda_items_meeting
  ON keep_agenda_items(meeting_date, sort_order);
