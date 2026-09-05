-- 277: 日常業務アプリ (dailyops) — フィードバックチケット（新規ミニアプリ・2026-09 依頼）
--
-- GMO ONAiR 自体（このプラットフォームのどれかのブロックアプリ）への
-- 要望・不具合報告を「起票」し、対応状況を追いかけるための台帳。
-- 起票は全ユーザー（`dailyops:reader`。このアプリを開ける人＝全員が対象）が行える。
-- 対応状況の更新（対応中にする／対応済みにする／却下する）は
-- `dailyops:editor` — 他の日常業務の仕組み（入ってきた情報の状態遷移など）と同じ切り分け。
--
-- **`target_app` は `shared/src/client/apps.ts` のアプリ登録に合わせた固定値。**
-- 新しいブロックアプリが増えたら、ここの CHECK と両側（サーバー/クライアント）の
-- 定数リストに1行足すこと（値は増えるだけで壊れないよう、行を持つ形にはしていない —
-- 案件フェーズの確度 (migration 276) と違って将来ユーザーが値を編集する想定が無いため）。
--
-- **`target_page` は「どのアプリの、どの画面・機能か」の2段目**（2026-09 追加依頼）。
-- `target_app` 1つだけでは「案件管理・財務管理・カレンダー・設定」のように
-- 複数の業務領域を束ねたアプリがあり、どの画面かが分からないと対応者が探す羽目になる。
-- 選べる値は `target_app` ごとに違う（`feedback-ticket.service.ts` の `PAGES_BY_APP`）ので、
-- ここでは DB の CHECK では縛らず（アプリ×画面の組み合わせを SQL の CHECK で
-- 表現すると 8アプリ分の一覧を SQL 側にも複製することになり、2か所がずれる）、
-- **サービス層だけで検査する**。どのアプリも一覧の最後に「その他 / 分からない」を
-- 持つので、対応する画面が無いことは無い。

CREATE TABLE IF NOT EXISTS feedback_tickets (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,                       -- 1行の題名
  description    TEXT NOT NULL,                        -- 詳しい内容
  target_app     TEXT NOT NULL
                 CHECK (target_app IN ('client', 'daily', 'equipment', 'techops', 'live', 'awards', 'shared', 'other')),
  target_page    TEXT NOT NULL,                        -- どの画面・機能か (target_app ごとの一覧。service 層で検査)
  category       TEXT NOT NULL DEFAULT 'other'
                 CHECK (category IN ('bug', 'feature', 'other')),  -- 不具合 / 要望 / その他
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),  -- 未対応/対応中/対応済み/却下
  reporter_id    TEXT NOT NULL REFERENCES users(id),   -- 起票者
  reporter_name  TEXT NOT NULL,                        -- 起票者名 (スナップショット。退職後も残す)
  response_note  TEXT,                                 -- 対応コメント
  resolved_at    TIMESTAMP,                            -- 対応済み/却下にした時刻
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_tickets_status ON feedback_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tickets_target_app ON feedback_tickets(target_app);
