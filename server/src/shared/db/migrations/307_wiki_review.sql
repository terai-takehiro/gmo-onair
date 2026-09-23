-- ============================================================
-- 307: Wiki 段F（見直しとコメント）
--
-- 設計: docs/design/v4/wiki.md §6-⑦（見直し）・§6-⑧（コメントは担当に通知）・
-- §7-3 条件5（「仕組み（通知と『見直した』の記録）は段F で作る」）。
--
-- コメントの表（wiki_comments）は 303 で作ってあるので**足さない**。
-- ここで足すのは2つだけ:
--
--   ① 「見直した」の記録（wiki_reviews）
--   ② 通知のひな形2本（コメント・毎月1日の見直し）
--
-- ⚠️ **「見直した」を wiki_page_versions に混ぜない。** 版は本文の履歴で、
--    見直しは**本文を変えずに**「読んで、まだ正しいと確かめた」という別のできごと。
--    混ぜると「第12版」が本文の12回目の保存を指さなくなり、履歴の差分が壊れる。
-- ⚠️ **見直しても wiki_pages.updated_at は動かさない**（コード側の約束）。
--    動かすと「最終更新」が本文を直した日を指さなくなり、見直しの一覧
--    （最終更新の列）が「見直した日」の写しになって使えなくなる。
--    最後に見直した日はこの表の reviewed_at が正。
-- ⚠️ 通知のひな形は**無効にできる**（設定 ⑦ の画面）。定時実行は
--    `notification_templates.enabled` を見て止まる（scheduler.service.ts）。
-- ============================================================

-- ── ①「見直した」の記録（§6-⑦・§7-3 条件5）────────────────
CREATE TABLE IF NOT EXISTS wiki_reviews (
  id             TEXT PRIMARY KEY,
  page_id        TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  reviewed_by    TEXT REFERENCES users(id),
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 押す前の予定日（入っていなければ NULL）。何日ぶん先送りしたかが後から読める
  prev_review_by DATE,
  -- 入れ直した次の予定日
  next_review_by DATE,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS idx_wiki_reviews_page
  ON wiki_reviews(page_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wiki_reviews_at
  ON wiki_reviews(reviewed_at DESC);

-- ── ② 通知のひな形2本 ──────────────────────────────────────
-- 宛先（ページの担当・スペースの担当）はコード側が決める。send_to は人が読む文で、
-- 判定には使わない（notification.service.ts 冒頭の決めごと）。
INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('wiki_comment', 'Wiki のページへのコメント', 'ページにコメントが付いたとき', 'internal', 'inapp',
   'ページの担当（返信のときは元のコメントを書いた人にも）',
   E'［コメント］{ページ名}',
   E'{投稿者名} さんが「{ページ名}」にコメントしました。\n\n{本文}',
   '["{投稿者名}", "{ページ名}", "{本文}"]', TRUE, 24),
  ('wiki_review_monthly', 'Wiki の今月の見直し', '毎月1日 03:45', 'internal', 'inapp',
   '各スペースの担当（wiki_spaces.owner_user_id）',
   E'［見直し］{スペース名} に見直すページが {件数}件あります',
   -- ⚠️ 「期限切れ」と言わない（§10 #10）。予定日を過ぎても中身は無効にならない
   E'{スペース名} の今月の見直しです。要見直し {要見直し}件／14日以内 {まもなく}件／担当が空 {担当なし}件。\n見直しの画面で「見直した」を押すと、次の予定日が入ります。',
   '["{スペース名}", "{件数}", "{要見直し}", "{まもなく}", "{担当なし}"]', TRUE, 25)
ON CONFLICT (id) DO NOTHING;
