-- リード経路に「内覧会」を足す（ご要望）
--
-- ── なぜ内覧会だけで、WEBフォームは足さないのか ────────────────────────
--
-- ご要望は「**内覧会** と **WEBフォーム** の2つを足す」でしたが、
-- **WEBフォームに当たる値はすでにあります**（`web`・画面のラベルは「Web」）。
-- 別の値として `webform` を足すと、
--
--   ・プルダウンに「Web」と「WEBフォーム」が並び、**誰も違いを説明できない**
--   ・**同じ意味の引き合いが2つの値に分かれ**、あとから集計できなくなる
--
-- ので、**`web` のラベルを「WEBフォーム」に変える**ほうを選びました
-- （`client/.../projectList/intake.ts`）。画面には**内覧会と WEBフォームの2つが増えます**。
-- モックのリード経路も メール／電話／**内覧会**／紹介／**Webフォーム** で、
-- 素の「Web」は持っていません。
--
-- ⚠️ **既存データは1行も書き換えません。** いま `web` が入っている引き合いは
-- 「Web から来た」＝ 問い合わせフォーム経由なので、名前が変わっても意味は同じです。
--
-- ── 内覧会は本当に別の入口 ──────────────────────────────────────
--
-- 定期内覧会は来場予約フォームから申し込みが入り（`inview_attendees`）、
-- そこで話した相手が後日そのまま案件になります。`web`（問い合わせフォーム）とも
-- `meeting`（打合せ）とも別の入口なので、値を分ける意味があります。

DO $$
BEGIN
  ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_projects_intake_channel;
  ALTER TABLE projects ADD CONSTRAINT chk_projects_intake_channel
    CHECK (intake_channel IS NULL
           OR intake_channel IN ('mail', 'phone', 'inview', 'referral', 'web',
                                 'meeting', 'group', 'other'));
END $$;

COMMENT ON COLUMN projects.intake_channel IS
  'リード経路 mail/phone/inview/referral/web/meeting/group/other。'
  'web は問い合わせフォーム（画面では「WEBフォーム」）。'
  'group はお客様がグループ会社のとき自動で入る';
