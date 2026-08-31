-- ============================================================
-- 246: 通知の「ゴミ」を減らす — 死んだひな形・並び順の衝突・出るべきでなかった督促
--
-- ── なぜ要るか（ユーザーからの指摘）──────────────────────────
-- 「通知の未入金ですが／入金予定日を超えているものだけ通知するように／
--   これもゴミ通知が多い／真に必要な通知を見極めて」
--
-- 本体（何を・誰に・どのくらいの頻度で出すか）はコード側で直した
-- （`scheduler.service.ts` の `inv_late` / `inv_send_todo` / `eq_return` /
--   `weekly_unreviewed` と、節目を決める `shared/services/reminder-bucket.ts`）。
-- この migration は、**その変更に合わせて表の側で辻褄を合わせる**ぶん。
--
-- ⚠️ **過去の通知は1件も消さない。** 「届いた」ことは記録で、消すと
-- 「あの督促は本当に来ていたのか」を誰も確かめられなくなる。
-- 下でやるのは `read_at` を打つ（既読にする）だけ。

-- ── ① 一度も出ない死んだひな形 `q_approve` を止める ─────────────
--
-- 「見積の承認依頼」は 177 で `enabled = TRUE` で入っているが、
-- **この文面から通知を出すコードが1行も無い**（`templateId: 'q_approve'` を
-- 書いている場所がゼロ）。値引き上限を超えた保存を止める仕組みは別にあり、
-- 承認者への通知だけが作られないまま残っていた。
--
-- 画面には「有効」と出ているので、**設定を見た人は「出ている」と思う**。
-- 出ていないものを有効と表示し続けるほうが害が大きいので `FALSE` にし、
-- きっかけの文にも「この文面からは自動では出ません」と書く。
--
-- **行は消さない。** 承認の通知を作る日にここへ戻ってこられるようにしておく
-- （「直さないと決めたものも表から消さない」— CLAUDE.md）。
-- `subject` / `body` は触らない（人が直した文面を上書きしないため）。
UPDATE notification_templates
   SET enabled = FALSE,
       trigger = '値引き上限を超えて保存したとき（この文面から自動では出ません）',
       updated_at = NOW()
 WHERE id = 'q_approve';

-- ── ② `sort_order` の衝突をほどく ───────────────────────────
--
-- 設定 ⑦ の一覧は `ORDER BY sort_order` だけで並べるので、**同じ値が2つあると
-- 並び順が Postgres 任せ**になる（同じ画面を開き直しただけで順番が入れ替わる）。
-- 実際に 17 と 19 が2つずつあった:
--   17 … `dg_new`(239) と `sales_ai_review_draft`(241)
--   19 … `pj_tidy_candidate`(238) と `dg_comment`(240)
-- あとから足した2本を末尾へ送る（既存の並びを動かさない置き方）。
UPDATE notification_templates SET sort_order = 21, updated_at = NOW() WHERE id = 'dg_comment';
UPDATE notification_templates SET sort_order = 22, updated_at = NOW() WHERE id = 'sales_ai_review_draft';

-- ── ③ きっかけと宛先の文を、実際の動きに合わせる ──────────────
--
-- `trigger` と `send_to` は**人が読むためだけの文**（判定はコードが持つ）。
-- 画面はこの文を出すので、コードだけ直すと**画面が嘘をつく**。
-- ⚠️ `subject` / `body` は触らない（system_admin が直した文面を消さないため）。
UPDATE notification_templates
   SET trigger = '支払期限の超過 1・7・30 日目、以後30日ごと（請求書を出したものだけ）',
       send_to = '案件管理の manager ・ その売上を作った人',
       updated_at = NOW()
 WHERE id = 'inv_late';

UPDATE notification_templates
   SET trigger = '締め日から 1・7・30 日目、以後30日ごと（請求書がまだのものだけ）',
       send_to = '案件管理の manager ・ その売上を作った人',
       updated_at = NOW()
 WHERE id = 'inv_send_todo';

UPDATE notification_templates
   SET trigger = '返却予定日の超過 1・7・30 日目、以後30日ごと',
       send_to = '機材管理の manager ・ 貸し出した人（借用者本人には届きません）',
       updated_at = NOW()
 WHERE id = 'eq_return';

UPDATE notification_templates
   SET name = '週報の未確認督促（まとめて1通）',
       trigger = '未確認が14日を超えた週報の件数か、いちばん古い週が変わったとき',
       send_to = '日常業務の manager',
       updated_at = NOW()
 WHERE id = 'weekly_unreviewed';

-- ── ④ そもそも出るべきでなかった未入金の督促を既読にする ────────
--
-- `inv_late` は「入金が遅れています」の督促だが、直す前は
-- `paid_date IS NULL` だけを見ており、**請求書をまだ出していない売上**まで
-- 対象にしていた。出していない売上の `payment_due_date` は登録時に自動計算
-- されるだけなので、超過に意味が無い — 押しても入金は来ない
-- （`shared/services/billing-state.ts` と `billing.routes.ts` の `overdue` の説明）。
-- しかも毎朝1通ずつ出ていたので、未読の山の大半がこれになっている。
--
-- **消さずに既読にする。** 記録は残したうえで、ベルの未読からは下ろす
-- （残したままだと、本当に見るべき督促がこの山に埋もれたままになる）。
-- 対象は「いまも請求書が出ていない売上あて」の `inv_late` だけ —
-- 発行済みで本当に入金が遅れているものには手を触れない。
UPDATE notifications n
   SET read_at = NOW()
 WHERE n.read_at IS NULL
   AND n.template_id = 'inv_late'
   AND n.ref_type = 'revenue'
   AND EXISTS (
     SELECT 1 FROM revenues r
      WHERE r.id = n.ref_id
        AND (r.invoice_issued IS NOT TRUE)
   );
