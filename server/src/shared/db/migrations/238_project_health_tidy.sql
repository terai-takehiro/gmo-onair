-- ============================================================
-- 238: 案件の健全性（スヌーズ）と自動整理 — docs/core-redesign-plan.md §3-1 / §3-2
--
-- ── スヌーズ（`snooze_until`）────────────────────────────────
--
-- 「お待たせ中」のような**独立の待ち状態は作らない**（同計画 §2-2）。
-- 待ちは「未来日付＋期限切れ時の自動再浮上」で表す — 日付必須なので
-- **無期限の待ちがそもそも作れない**。期日が来たら列は残るが判定
-- （`project-health.ts`）が普通に戻るだけで、消す処理は要らない。
--
-- ── 見送りと失注を分ける（`lost_reason_categories`）─────────
--
-- ゴミが溜まる根本は「そもそも案件ではなかったもの」を閉じるのに
-- 「失注」と言わされること（心理的に不当で、失注分析のノイズにもなる）。
-- 「見送り（案件化せず）」「自動整理（長期放置）」を理由マスタに足し、
-- 既存の「その他」（sort_order 99）より手前に並べる。
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS snooze_until DATE;

COMMENT ON COLUMN projects.snooze_until IS
  'この日まで意図して寝かせる（スヌーズ）。未来なら停滞にも自動整理にも出さない。無期限は作れない（日付必須）';

-- スヌーズ中の案件だけを引く部分索引。ほとんどの行は NULL のままなので、
-- 全行に索引を張ると書き込みだけが重くなる
CREATE INDEX IF NOT EXISTS idx_projects_snooze_until
  ON projects(snooze_until) WHERE snooze_until IS NOT NULL;

INSERT INTO lost_reason_categories (id, name, sort_order) VALUES
  ('lr_08', '見送り（案件化せず）', 7),
  ('lr_09', '自動整理（長期放置）', 8)
ON CONFLICT DO NOTHING;

-- ── 自動整理の通知ひな形（migration 177 の様式）──────────────
--
-- 日次ジョブ `project_tidy`（scheduler.service.ts）が使う2本。どちらも社内のベル。
-- ジョブ本体はステージも動かす裏方仕事なので**ひな形では止めない**
-- （templateId は null。止め方は環境変数 PROJECT_TIDY_DAILY=off）。
-- ここの `enabled` は**通知を出すかどうかだけ**を切る。
-- sort_order は 19/20 — 既存は 16（qsheet_ai_review_draft）まで使用済みで、
-- 同時に入る 239 の依頼通知（dg_new/dg_reply）が 17/18 を取るため（重複させない）。
INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('pj_tidy_candidate', '案件の整理候補', 'ネタが生存証拠なしで60日動かなかった朝 7:30', 'internal', 'inapp', '起票した人',
   '［整理候補］{案件名} が60日動いていません',
   E'{案件名} は次の一手（次回アクション・期限つきタスク・実施日・スヌーズ）が無いまま {放置日数} 日動いていません。\nこのまま30日動きが無ければ、自動で「見送り」に移します。\n続けるなら次の一手を入れるか、スヌーズしてください。',
   '["{案件名}","{放置日数}"]', TRUE, 19),

  ('pj_tidy_auto', '案件の自動見送り', 'ネタが生存証拠なしで90日動かなかった朝 7:30', 'internal', 'inapp', '起票した人',
   '［自動見送り］{案件名} を見送りにしました',
   E'{案件名} は90日以上動きが無かったため、自動で「見送り（自動整理・長期放置）」にしました。\n間違いであれば、案件のステージ帯からいつでも戻せます（削除はしていません）。',
   '["{案件名}"]', TRUE, 20)
ON CONFLICT (id) DO NOTHING;
