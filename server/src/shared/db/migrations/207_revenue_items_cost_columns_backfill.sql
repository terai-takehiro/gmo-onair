-- ============================================================
-- 207: revenue_items に unit/cost_amount/cost_vendor_id/is_ai_suggested を
--      後追いで追認する（実DBにはあるが、このリポジトリのどの migration
--      ファイルにも作成する記述が無かった列）
--
-- 経緯（詳細: docs/reviews/db-drift-audit.md・docs/reviews/phase3-2-plan.md）
--
-- `revenue-item-carryover.service.ts` のコメントに「migration 145 / 147 で
-- 追加された」とあるが、145・147 は現在のリポジトリに存在しない
-- （v3.2.0 のUI/UX刷新に向けたロールバックで `main` の祖先から外れた旧番号帯・
-- migration 206 で削除した23テーブルと同じ episode）。実DBにはこれらの列が
-- あり、`revenue-item-carryover.service.ts`/`revenues.routes.ts`/
-- `project-groups.routes.ts` が現に読み書きしている「生きている列」なので、
-- `npm run verify:fresh` で作るDBにも同じ形を持たせる。
--
-- `cost_vendor_id` は実DBでは `vendors(id)` を指すFKだったが、この migration
-- では最初から `companies(id)` を指す形で作る（`vendors` テーブル自体を
-- 削除する208番と同一PR/デプロイのため。実データはすべてNULLであることを
-- 確認済み・docs/reviews/phase3-2-plan.md「2026-08-19 引き継ぎメモ」）。
-- 実DBに対しては、既存のFK（vendors 向き）を companies 向きに張り替える形で
-- 追随する（下記）。

ALTER TABLE revenue_items
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS cost_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_vendor_id TEXT,
  ADD COLUMN IF NOT EXISTS is_ai_suggested BOOLEAN NOT NULL DEFAULT FALSE;

-- 実DBでは cost_vendor_id の既存FKが vendors(id) を指している（列自体は今回
-- 初めて追認するが、実DBには既に存在し、208 で vendors を削除する前に
-- companies(id) へ張り替えておく必要がある）。フレッシュDB（このmigrationで
-- 今initFKを作る場合）でも同じ文で構わない（IF EXISTS で無ければ何もしない）。
ALTER TABLE revenue_items DROP CONSTRAINT IF EXISTS revenue_items_cost_vendor_id_fkey;
ALTER TABLE revenue_items ADD CONSTRAINT revenue_items_cost_vendor_id_fkey
  FOREIGN KEY (cost_vendor_id) REFERENCES companies(id);
