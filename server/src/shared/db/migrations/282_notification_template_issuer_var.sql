-- 282: notification_templates の初期4行（社外向けメール）の件名にある固定の社名を
-- 変数 {発行会社} に差し替えた（2026年10月の事業再編・§4.9・§13）
--
-- ── なぜ安全に置き換えられるのか ──────────────────────────────
--
-- 対象の4行（q_send / bk_fix / bk_cancel / inv_send）は、どれも
-- `notification.service.ts` の `template()`（DB から subject/body を読む唯一の関数）＋
-- `fill()`（差し込み）の組で実際にレンダリングされたことがない。呼ばれているのは
-- dg_comment / dg_new / dg_reply の3件だけで、他の通知（督促・週報など）はコード側に
-- 直書きした文面を使っている（サーバー側で確認済み）。加えてこの4行は audience='external'
-- （社外向け）で、`notifications.routes.ts` に「社外あての文面は自動で送りません。
-- 文面をコピーして送ってください」とある通り、そもそも自動送信の対象でもない。
--
-- つまりこの4行の subject/body は、設定画面（system_admin 専用の GET/PUT
-- /platform/templates）に見せる**参考文面**でしかない。{案件名} 等の他のトークンと
-- 同じ「例示のプレースホルダ」として {発行会社} を増やすだけでよく、差し込みを
-- 実際に行うコードは追加しない（既存の他トークンと同じ扱いのまま）。
--
-- ── 手で直した行は上書きしない ────────────────────────────────
--
-- WHERE 句に旧 subject の全文を条件として含めているため、すでに system_admin が
-- 画面から書き換えた行（subject が初期値と一致しない）は対象から自然に外れる。
UPDATE notification_templates SET subject = '【{発行会社}】お見積書のご送付（{案件名}）'
 WHERE id = 'q_send' AND subject = '【GMOグローバルスタジオ】お見積書のご送付（{案件名}）';

UPDATE notification_templates SET subject = '【{発行会社}】ご予約確定のお知らせ（{利用日}）'
 WHERE id = 'bk_fix' AND subject = '【GMOグローバルスタジオ】ご予約確定のお知らせ（{利用日}）';

UPDATE notification_templates SET subject = '【{発行会社}】ご予約取消の受付（{利用日}）'
 WHERE id = 'bk_cancel' AND subject = '【GMOグローバルスタジオ】ご予約取消の受付（{利用日}）';

UPDATE notification_templates SET subject = '【{発行会社}】{請求月} 分ご請求書の送付'
 WHERE id = 'inv_send' AND subject = '【GMOグローバルスタジオ】{請求月} 分ご請求書の送付';
