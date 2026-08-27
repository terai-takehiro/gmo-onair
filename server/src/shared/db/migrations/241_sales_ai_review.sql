-- 241: 営業側の月次 AI レビュー（docs/core-redesign-plan.md Phase 2 ②）
--
-- 制作側（migration 226 / ops_reports.kind='ai_review_production'）と同じ形で、
-- 営業系 AI（task_intake / activity_format / next_action_short / minutes_draft /
-- kpt_draft / project_draft / estimate_draft / inquiry_intake / finance_doc_intake）の
-- 月次ふりかえり下書きを ops_reports.kind='ai_review_sales' に貯める。
--
-- スキーマ変更は不要（確認済み・ここに根拠を残す）:
--   - ops_reports.kind に CHECK は無い（migration 118 の設計判断
--     「メニュー追加を migration レスにするため」）。'ai_review_sales' はそのまま入る。
--   - reviewed_at / reviewed_by も migration 118 から最初からある列で、
--     制作側の実施率（reviewCompletionRate）が読むのと同じ列を使う。
--
-- → この migration は通知のひな形1本だけ。

-- ── 月次 AI レビュー下書きの通知ひな形（migration 226 の営業版）──────
-- 社内向け（internal / inapp）。qsheet_ai_review_draft と同じ判断で enabled=TRUE。
-- 通知の実体（宛先=sales の manager 全員・重複防止）はコード側
-- （sales-ai-review.service.ts + notifications の一意索引）が持つ。
INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('sales_ai_review_draft', '営業 AI 月次レビューの下書き', '毎月1日 03:35', 'internal', 'inapp',
   '案件管理の manager',
   '［AIレビュー］{対象月} 分の営業 AI の下書きができました',
   E'{対象月} の営業系 AI（起票・見積・投入・議事録・取込ほか）のふりかえり下書きができました。\n無修正採用率・見送り率・よく直されるフィールドを確認し、プロンプトを直すかを決めてください。',
   '["{対象月}"]', TRUE, 17)
ON CONFLICT (id) DO NOTHING;
