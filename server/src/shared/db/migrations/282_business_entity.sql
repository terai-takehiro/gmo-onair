-- 282: 事業主体（business entity）— 隔週キープの数字を主体別に出すための列（2026-09-06 ご判断）
--
-- ── 決めごと（docs/design/v4/keep-report.md §4）──────────────────────────
--
-- 2026年10月の会社分割で、スタジオの仕事は 3 つの「主体」に分かれる:
--   gss  … GMOサムライスタジオ（旧 GMOグローバルスタジオ）
--   gscs … GMOサムライコンテンツスタジオ（合弁）
--   gig  … GMOインターネットグループ人格として行うもの（GMO Yours・第1本社の会場など）
--
-- 主体は**お客様の区分から自動で決める**（`customer_type` と同じく保存のたびに導出する）:
--   グループ内（customer_type = 'internal'）→ gss
--   外部     （customer_type = 'external'）→ gscs
-- `gig` は自動では付かない。人が案件で上書きしたときだけ `entity_manual = TRUE` の印を付け、
-- 以後はお客様を変えても自動で戻さない（上書きを null で送ると自動に戻る）。
-- 決める場所は `server/src/contexts/sales/services/project-entity.ts`（写しが
-- `shared/src/keepReport/entity.ts`。`shared/tests/keepReportEntity.test.ts` が一致を固定）。
--
-- ── なぜ列で持つか ──────────────────────────────────────────────────
-- `customer_type` と同じ理由（migration 192）: 取引先マスターの「いまの」印で過去の案件を
-- 塗り替えず、案件を取った当時の姿で数える。10月より前の月も同じ決まりで遡って分けて出す
-- （お客様の区分は当時の値が残っている）。収支は主体別 ＋ 全体（統合）の両方を出す。
--
-- ── 既存行の backfill ────────────────────────────────────────────────
-- `entity_manual = FALSE` の行だけ customer_type から入れる（人の上書きは触らない）。
-- ⚠️ `createCore` を通らない登録（Excel 取込・決算取込・GPM）は既定の gss で入る。
--    次にその案件を保存したとき（`project.service.update`）にお客様から引き直される。
--
-- ── あわせて足す列 ───────────────────────────────────────────────────
--   projects.keep_pick      … ヨミ表の「資料に載せる」の印（案件ページの材料。§3）
--   companies.samurai_group … 「サムライ関連」の別表に出すお客様（サムライパートナーズ／
--                             GMOサムライコンテンツスタジオ）。主体ではなく**お客様**で決める（§4）

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS entity TEXT NOT NULL DEFAULT 'gss' CHECK (entity IN ('gss', 'gscs', 'gig'));
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS entity_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- 人が上書きした行（entity_manual = TRUE）は触らない
UPDATE projects
   SET entity = CASE WHEN customer_type = 'external' THEN 'gscs' ELSE 'gss' END
 WHERE entity_manual = FALSE;

CREATE INDEX IF NOT EXISTS idx_projects_entity ON projects(entity);

COMMENT ON COLUMN projects.entity IS
  '事業主体。お客様の区分から自動: グループ内→gss（GMOサムライスタジオ）／外部→gscs（GMOサムライコンテンツスタジオ）。gig はグループ人格で行うもの（人が上書き）';
COMMENT ON COLUMN projects.entity_manual IS
  '人が事業主体を上書きした印。TRUE の間はお客様を変えても自動で引き直さない';

-- ヨミ表の「資料に載せる」の印（隔週キープの案件ページに出す案件）
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS keep_pick BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN projects.keep_pick IS '隔週キープの資料に案件ページとして載せる印（ヨミ表の「資料」チェック）';

-- 「サムライ関連」の別表（相手がサムライパートナーズ／GMOサムライコンテンツスタジオの案件）
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS samurai_group BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE companies
   SET samurai_group = TRUE
 WHERE name LIKE '%サムライパートナーズ%' OR name LIKE '%サムライコンテンツスタジオ%';
COMMENT ON COLUMN companies.samurai_group IS
  '隔週キープのヨミ表で「サムライ関連」の別表に出すお客様（サムライパートナーズ／GMOサムライコンテンツスタジオ）';
