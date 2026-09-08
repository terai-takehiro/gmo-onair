-- ============================================================
-- 296: グループ会社の案件で、リード経路が空のまま残っていたものを埋め戻す
--
-- ── 経緯 ────────────────────────────────────────────────────
--
-- 利用者から: 「グループ内案件はリード経路でグループ内としてロックされてるはず」
-- というご指摘。`client/.../projectList/intake.ts` の `INTAKE_CHANNEL_LABEL` は
-- 「人が選ぶ値ではありません（migration 182）。お客様が取引先マスターでグループ
-- 会社になっているとき、案件作成が固定でこの値を入れます」と明記している。
--
-- 実際に固定していたのは**画面の新規登録フォーム**（`useNewProjectForm.ts`）
-- だけだった。サーバー（`project.service.ts` の `createCore`/`update`）は
-- 渡された値をそのまま受けるだけで、グループ会社かどうかで固定していなかった。
-- MCP の `create_project`/`update_project` はそもそも `group` を選択肢に持たず
-- （人が選ぶ値ではないため）、Excel・決算取込もこの列を送らない。
-- 結果、画面の新規登録フォーム以外の経路（AI/MCP・取込・古いデータ）で作られた
-- グループ会社の案件は、リード経路が空のまま残り、案件台帳の整合性チェック
-- 「リード経路が入っていない」に引っかかり続けていた
-- （例: GLS-B006「紹介動画撮影」・GLS-B009「ようが夏まつり」— いずれもグループ
-- 会社の案件）。同じ回でサーバー側にも `customer_type` と同じ「常に確定させる」
-- 導出を足した（`project.service.ts`）ので、以後の作成・更新では起きない。
--
-- ── このマイグレーションでやること ──────────────────────────
--
-- 既存データを同じ規則（`companies.is_gmo_group`）で埋め戻す。
-- **空（NULL）のものだけ埋める** — 人が明示的に別の値を選んでいた行を
-- 上書きしない（migration 203 の「NULL のときだけ埋める」と同じ方針）。
UPDATE projects p
   SET intake_channel = 'group',
       updated_at = NOW()
  FROM companies c
 WHERE p.customer_id = c.id
   AND c.is_gmo_group = TRUE
   AND p.deleted_at IS NULL
   AND (p.intake_channel IS NULL OR p.intake_channel = '');
