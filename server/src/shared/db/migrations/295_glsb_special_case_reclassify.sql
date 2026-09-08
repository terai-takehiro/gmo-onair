-- ============================================================
-- 295: GLS-B006 / B009 / B010 の3件だけを、番号はそのまま案件(GLS-A)扱いに直す
--
-- ── 経緯 ────────────────────────────────────────────────────
--
-- 利用者から: この3件は実際には工事・構築のプロジェクト管理案件ではなく、
-- 通常の撮影・収録・イベント業務だが、gls_category が 'B' のまま発番されて
-- しまっていた。すでに見積書を発行済みのため GLS 番号自体（GLS-B006 等）は
-- 変えられない（採り直すと番号・BOXフォルダ名・回のコードが変わり、
-- 発行済み見積との対応が崩れる）。3件に限った特例として、
-- 「番号はそのまま・gls_category だけ 'A' に直す」対応を行う。
--
-- 通常の A↔B 切替（PATCH /projects/:id/gls-category・changeGlsCategory）は
-- 発番済みの案件では必ず新番号を採り直す作りなので使えない。この3件限りの
-- 一度きりの是正として、ここで直接 UPDATE する（対象は id で名指し・
-- 汎用の「番号を変えずに切替える」経路は作らない）。
--
-- ── 直した内容 ──────────────────────────────────────────────
--
-- ・GLS-B006「紹介動画撮影」/ GLS-B010「GMOインターネット キックオフMTG」:
--   すでに audience/project_category/project_type は正しく
--   （無観客・収録）入っていた ── gls_category が 'B' なのに2段分類が
--   入っている状態で、案件台帳の整合性チェック「GLS-B なのに2段分類が
--   入っている」に引っかかっていた。gls_category を 'A' に直すだけでよい。
--
-- ・GLS-B009「ようが夏まつり」:
--   2段分類は決めごと通り NULL のままだったが、gpm_kind = 'self_build'
--   （プロジェクト管理の印）が付いていた。GPM を離れ通常の案件として扱うため
--   gpm_kind を外す（`gpm_kind IS NOT NULL` は `gls_category = 'B'` 必須という
--   CHECK 制約〈migration 179〉があり、外さないと gls_category='A' への
--   更新が制約違反で失敗する）。実態は「有観客のイベント（会場のみ）」との
--   ことなので、2段分類をその値で埋め、`project-classification.ts` の対応表
--   どおり project_type は 'offline_event' に揃える。実施日は GPM 側の
--   started_on/ends_on にすでに入っていた 2026-08-13 を event_start/end に
--   引き継ぐ（A案件は event_start/end を見るため。空のままだと整合性チェック
--   「受注しているのに実施日が無い」に新たに引っかかる）。
--
-- ── 対象の外にあるもの ──────────────────────────────────────
--
-- pm_company / started_on / ends_on / gpm_template_id は制約が無く実害も無いため
-- 残す（GPM だった履歴として）。GLS-B010 の実施日が未入力な点は本対応とは別件
-- （案件台帳の整合性チェック「受注しているのに実施日が無い」から個別に拾える）。

UPDATE projects
   SET gls_category = 'A',
       updated_at = NOW()
 WHERE id IN ('914bf759-a469-4a99-a51b-583c6ee5a55b', '2bc142ee-fe51-46a7-8c87-db508a0a5d88')
   AND gls_category = 'B';

UPDATE projects
   SET gls_category = 'A',
       gpm_kind = NULL,
       audience = 'with_audience',
       project_category = 'event',
       project_type = 'offline_event',
       event_start = COALESCE(event_start, started_on::text),
       event_end = COALESCE(event_end, ends_on::text),
       updated_at = NOW()
 WHERE id = 'e3516123-fad3-4386-9c60-d7ac4d5275ac'
   AND gls_category = 'B';
