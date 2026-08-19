-- 週報が「未確認」のまま止まっているものを督促するひな形
-- （UXレポート 2026-08-18 指摘・docs/reviews/2026-08-19-uiux-operation-report-response.md 5-2）
--
-- ── なぜ通知が要るのか ──────────────────────────────────────
--
-- 週報 (ops_reports.kind='weekly_activity') は「確定する（公開）」と同時にしか
-- reviewed_at が打刻されない作りで、確認するかどうかは人任せ。他の督促
-- （未入金・機材返却）と同じ形で、一定期間（14日）未確認のまま残っている
-- 週報を担当（dailyops を編集できる人）に知らせる。
--
-- ── `enabled` を TRUE にしてある ────────────────────────────
--
-- 社内向け（internal / inapp）で、社外メールのような取り返しのつかない事故が
-- 起きない。tk_due / inv_late / eq_return と同じ判断。
--
-- ── 既にあれば触らない ──────────────────────────────────────
--
-- 文面を直した人の変更を、次のデプロイで上書きしないため。

INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('weekly_unreviewed', '週報の未確認督促', '未確認のまま14日経過', 'internal', 'inapp', '日常業務の編集者',
   '［週報］{週} の週の報告がまだ確認されていません',
   E'{週} の週報がまだ確認されていません。\n確定（公開）していなくても構いません。内容を見て「確認済みにする」を押してください。',
   '["{週}"]', TRUE, 15)
ON CONFLICT (id) DO NOTHING;
