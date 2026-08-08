-- 通知とテンプレート — v4 設定 ⑦
--
-- ── 社外メールは送らない（ご判断）──────────────────────────
--
-- モックの 11 本のうち 6 本は**お客様に届くメール**です。差し込みが1つずれる・
-- きっかけが誤爆する・宛先が古い、のどれも**取り返しがつきません**。
-- そこで v4 では**文面を貯めてコピーできるところまで**にします。
-- 送信そのものは今までどおり人が行います。
--
-- → `templates` は持つ。**送信の経路は作らない。**
--
-- ── 社内通知はアプリの中のベル（ご判断）────────────────────
--
-- Slack に出す経路はまだ無く（いまの連携は受け取る側だけ）、社員のメールに
-- 送るとタスクの期限通知で埋まります。上辺バーのベルに出します。
--
-- ── 定時実行を作る（ご判断）────────────────────────────────
--
-- 時刻で動く通知が 5 本あります。**コンテナが再起動しても二重に送らない**ことが
-- 一番大事なので、2 段構えにします:
--   1. `scheduled_job_runs` … その仕事をその日に流したかを記録する
--   2. `notifications` の一意索引 … 同じ人・同じ種類・同じ対象・同じ日は 1 行だけ
-- 片方だけだと、記録を書く前に落ちた回や、複数プロセスで走った回に二重になります。

-- ── 文面のひな形 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- いつ送るか（人が読む文。判定には使わない）
  trigger     TEXT NOT NULL,
  -- internal 社内 / external 社外
  audience    TEXT NOT NULL CHECK (audience IN ('internal', 'external')),
  -- mail メール / inapp 社内通知
  channel     TEXT NOT NULL CHECK (channel IN ('mail', 'inapp')),
  send_to     TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  -- 差し込み語の一覧（`{案件名}` など）。文面から機械的に拾える形で持つ
  vars        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- **この文面から自動で送るか。** 社外は全部 false（v4 では送らない）
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- ── 社内通知（ベルに出るもの）──────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- どのひな形から出たか（`notification_templates.id`）。手で出したものは NULL
  template_id TEXT,
  title      TEXT NOT NULL,
  body       TEXT,
  -- 押したときの行き先（アプリ内のパス）
  link       TEXT,
  -- 何についての通知か。**二重に出さないための鍵**でもある
  ref_type   TEXT,
  ref_id     TEXT,
  -- 「その日ぶん」の鍵。日をまたげばまた出してよい通知（未入金の督促など）を
  -- 毎日1回だけにする。1回きりの通知は固定値を入れる
  ref_date   TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at    TIMESTAMPTZ
);

-- **二重に出さない最後の砦。** 定時実行が2回走っても行は増えない
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup
  ON notifications(user_id, template_id, ref_type, ref_id, ref_date)
  WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- ── 定時実行の記録 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  job_key    TEXT NOT NULL,
  -- `YYYY-MM-DD`。**1日1回**を保証する鍵
  run_date   TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created    INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  PRIMARY KEY (job_key, run_date)
);

-- ── モックの 11 本 ──────────────────────────────────────────
--
-- `enabled` は **社内の 3 本だけ true**。
--   - 社外 6 本 … v4 では送らない（文面を貯めるだけ）
--   - 見積の承認依頼 … 値引き上限の回で「送れない」を実装済みだが、
--     承認者への通知はこの回で入れる（できごと型なので定時実行は要らない）
--   - メンバー招待 … すでに `sendMail` で送っている（`users.routes.ts`）。
--     ここに文面を並べても**実際に送られるのはコード側の文**なので、
--     二重管理にならないよう `enabled = false` にして「コードが持っています」と画面に書く
INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('q_send', '見積送付のご案内', '見積を「送付済み」にしたとき', 'external', 'mail', '取引先の担当者',
   '【GMOグローバルスタジオ】お見積書のご送付（{案件名}）',
   E'{取引先名}\n{担当者名} 様\n\nいつもお世話になっております。\n{案件名} のお見積書をお送りいたします。\n\n・お見積番号：{見積番号}\n・金額：{見積金額}（税抜）\n・有効期限：{有効期限}\n\nご不明な点がございましたらお知らせください。',
   '["{取引先名}","{担当者名}","{案件名}","{見積番号}","{見積金額}","{有効期限}"]', FALSE, 1),

  ('q_approve', '見積の承認依頼', '値引き上限を超えて保存したとき', 'internal', 'inapp', '承認者',
   '［承認待ち］{案件名} の見積が上限を超えています',
   E'{申請者名} さんが作成した見積が、値引き上限を超えています。\n\n・案件：{案件名}\n・金額：{見積金額}\n・値引き率：{値引き率}\n\n承認するまでお客様には出せません。',
   '["{申請者名}","{案件名}","{見積金額}","{値引き率}"]', TRUE, 2),

  ('bk_fix', '予約確定のお知らせ', '仮予約を確定にしたとき', 'external', 'mail', '取引先の担当者',
   '【GMOグローバルスタジオ】ご予約確定のお知らせ（{利用日}）',
   E'{取引先名}\n{担当者名} 様\n\nご予約が確定いたしましたのでお知らせいたします。\n\n・利用日：{利用日}\n・場所：{拠点名} {部屋名}\n・時間：{利用時間}',
   '["{取引先名}","{担当者名}","{利用日}","{拠点名}","{部屋名}","{利用時間}"]', FALSE, 3),

  ('bk_remind', '利用前日のご連絡', '利用日の前日 17:00', 'external', 'mail', '取引先の担当者',
   '【明日】{拠点名} ご利用のご案内',
   E'明日 {利用日} のご利用について、搬入時間と入館方法をご案内します。\n\n・搬入：{搬入時間}\n・入館：{入館方法}\n・当日連絡先：{担当者連絡先}',
   '["{利用日}","{拠点名}","{搬入時間}","{入館方法}","{担当者連絡先}"]', FALSE, 4),

  ('bk_cancel', 'キャンセル受付', '予約を取り消したとき', 'external', 'mail', '取引先の担当者',
   '【GMOグローバルスタジオ】ご予約取消の受付（{利用日}）',
   E'{利用日} のご予約を取り消しました。\nキャンセル料の対象となる場合は、別途ご連絡いたします。',
   '["{取引先名}","{利用日}","{キャンセル料}"]', FALSE, 5),

  ('inv_send', '請求書の送付', '締め日の翌営業日', 'external', 'mail', '取引先の経理',
   '【GMOグローバルスタジオ】{請求月} 分ご請求書の送付',
   E'{取引先名} ご担当者様\n\n{請求月} 分のご請求書をお送りいたします。\n\n・請求番号：{請求番号}\n・金額：{請求金額}（税込）\n・お支払期限：{支払期限}',
   '["{取引先名}","{請求月}","{請求番号}","{請求金額}","{支払期限}"]', FALSE, 6),

  ('inv_late', '入金遅れの督促', '支払期限の翌日', 'internal', 'inapp', '経理 ・ 自社担当',
   '［未入金］{取引先名} {請求番号}',
   E'支払期限を過ぎた請求があります。\n\n・請求番号：{請求番号}\n・金額：{請求金額}\n・期限：{支払期限}（{遅延日数} 日超過）',
   '["{取引先名}","{請求番号}","{請求金額}","{支払期限}","{遅延日数}"]', TRUE, 7),

  ('po_send', '発注書の送付', '発注を確定したとき', 'external', 'mail', '仕入先',
   '【発注】{案件名}（{発注番号}）',
   E'{仕入先名} ご担当者様\n\n下記のとおり発注いたします。\n\n・発注番号：{発注番号}\n・作業日：{作業日}\n・金額：{発注金額}（税抜）\n・支払日：{支払日}',
   '["{仕入先名}","{案件名}","{発注番号}","{作業日}","{発注金額}","{支払日}"]', FALSE, 8),

  ('tk_due', 'タスクの期限前通知', '期限の 2 日前 9:00', 'internal', 'inapp', 'タスクの担当者',
   '［まもなく期限］{タスク名}',
   E'{タスク名} の期限が {期限日} です。\n案件：{案件名}',
   '["{タスク名}","{期限日}","{案件名}"]', TRUE, 9),

  ('eq_return', '機材の返却遅れ', '返却予定日の翌日', 'internal', 'inapp', '技術部 ・ 借用者',
   '［未返却］{機材名}',
   E'{機材名} が返却予定日を過ぎています。\n借用者：{借用者名} ／ 予定日：{返却予定日}',
   '["{機材名}","{借用者名}","{返却予定日}"]', TRUE, 10),

  ('sys_invite', 'メンバー招待', 'メンバーを招待したとき', 'internal', 'mail', '招待した人',
   'GMO ONAiR へのご招待',
   E'{招待者名} さんから GMO ONAiR に招待されました。\n下のリンクからパスワードを設定してください。\n\n{招待リンク}（有効期限 {有効期限}）',
   '["{招待者名}","{招待リンク}","{有効期限}"]', FALSE, 11),

  -- モックには無いが、**社外の時刻型2本の代わり**に社内へ出す 2 本（ご判断）。
  -- 送信はしないが「送る時期が来た」ことは知らせないと、見落としが減らない
  ('bk_remind_todo', '利用前日のご案内を送る（社内）', '利用日の前日 17:00', 'internal', 'inapp', '案件の担当者',
   '［明日ご利用］{案件名} の前日案内をまだ送っていません',
   E'明日 {利用日} にご利用の予約があります。\n「利用前日のご連絡」の文面をコピーして送ってください。',
   '["{案件名}","{利用日}"]', TRUE, 12),

  ('inv_send_todo', '請求書を送る（社内）', '締め日の翌営業日', 'internal', 'inapp', '経理',
   '［請求書］{取引先名} 宛の請求書をまだ出していません',
   E'締め日を過ぎた請求があります。\n「請求書の送付」の文面をコピーして送ってください。\n\n・金額：{請求金額}\n・支払期限：{支払期限}',
   '["{取引先名}","{請求金額}","{支払期限}"]', TRUE, 13)
ON CONFLICT (id) DO NOTHING;
