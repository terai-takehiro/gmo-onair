-- 改番の督促（移行センター・§4.8）の通知ひな形 — 2026年10月の事業再編・P1残作業
--
-- ── 「毎朝、残0になるまで」（§4.8）── ──────────────────────
--
-- 他の督促（inv_late 等）は `reminderBucket()` で節目だけに間引くが、これは
-- 意図して間引かない。10/1 という動かせない締切に向けたカウントダウンで、
-- 対象は少数（本番規模・§2.6）かつ高優先度（放置すると発行者を誤った請求書が
-- 外に出る）——`ref_date` に当日を入れ、対象で無くなる（＝改番される）まで
-- 毎朝1通で自然に止まる（scheduler.service.ts の renumber_needed ジョブ参照）。
--
-- ── メールも明示的に送る ────────────────────────────────────
--
-- `channel='inapp'`（ベルの enabled 検査にだけ使う）。メール送信は
-- migration 177 の設計どおり自動化していないため、`renumber_needed` ジョブの
-- 実装側から `sendMailAsync` を直接呼ぶ（`channel` には頼らない）。

INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('renumber_needed', '改番が必要です', '毎朝9:15（対象がある間）', 'internal', 'inapp', '案件の主担当',
   '［改番が必要］{案件名}（{現番号}）',
   E'{案件名}（現番号 {現番号}）は10月の事業再編で {新会社} の番号への改番が必要です。\n\n・お客様：{お客様名}\n・実施日：{実施日}\n\n設定 ＞「10月の切替」の移行センターから改番してください。',
   '["{案件名}","{現番号}","{新会社}","{お客様名}","{実施日}"]', TRUE, 23)
ON CONFLICT (id) DO NOTHING;
