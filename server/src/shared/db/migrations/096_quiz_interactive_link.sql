-- v2.9.24: 表彰CG ↔ インタラクティブ演出 (別 VPS) 連携
--
-- 投票集計は Interactive 側 (interactive_answers が choice_index のみ保持) で
-- 言語横断で自動合算済み。Awards 側はその合算値を vote_count に取り込むだけ。
--
-- 問題本文・選択肢データは双方向同期 (取込 = Interactive→Awards / 送信 = Awards→Interactive)。
-- どちらの場合も「Interactive question ⇄ Awards quiz」を 1 対 1 で対応付けるキーが必要。

-- 各 quiz が連動する Interactive 問題の id (UUID 文字列)。NULL = 未連携。
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS interactive_question_id TEXT;

CREATE INDEX IF NOT EXISTS idx_quizzes_interactive_q
  ON quizzes(interactive_question_id)
  WHERE interactive_question_id IS NOT NULL;

-- イベント単位の連携設定。
--   { "baseUrl": "https://interactive.gmo-onair.jp",
--     "apiKeyPrefix": "ak_xxxxxxxx",
--     "apiKeySecret": "ak_...",          -- v1: 平文保存 (社内限定運用前提)
--     "interactiveEventId": "<uuid>" }
ALTER TABLE awards_events ADD COLUMN IF NOT EXISTS interactive_link JSONB;
