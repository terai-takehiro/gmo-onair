import { Router } from 'express';
import { queryAll } from '../../../shared/db/connection';
import { requireAuth, meetsPermissionLevel } from '../../../shared/middleware/auth';

const router = Router();

/**
 * 横断検索は種類ごとに権限を見る。
 *
 * 以前は `requireAuth` だけだったので、**ログインしているだけで**
 * 案件名・GLS番号・お客様の名前・仕入先の名前が誰にでも出ていた
 * (開くと 403 で止まるが、名前はもう見えている)。機材だけの権限の人にも見えた。
 *
 * 権限が無い種類は**空配列で返す**。「N件あるが見せない」も漏れになるので、
 * 件数も出さない。
 *
 * 判定は `requirePermission` と同じ `meetsPermissionLevel` を通す。
 * 判定を写すと片方だけ緩くなる
 * (v2.9.207 で MCP が HTTP の requirePermission をバイパスしていたのと同じ形)。
 */
const SEARCH_MODULES = {
  projects: 'sales',
  customers: 'sales',
  vendors: 'budget',
  // **機材を足したのはモックの文言に合わせるため**（上辺バーは
  // 「案件・お客様・機材を探す」と書いてある）。書いてあるのに探せないと、
  // 押した人は「壊れている」と受け取り、以後この窓を使わなくなる
  equipment: 'equipment',
} as const;

// GET /search?q=keyword - Cross-search across entities
router.get('/', requireAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';

  const can = (kind: keyof typeof SEARCH_MODULES) =>
    meetsPermissionLevel(req.user?.role, req.user?.permissions?.[SEARCH_MODULES[kind]], 'reader');

  if (!q || q.length < 1) {
    res.json({ success: true, data: { projects: [], customers: [], vendors: [], equipment: [] } });
    return;
  }

  const safe = q.replace(/[%_\\]/g, '\\$&');
  const like = `%${safe}%`;

  const projects = can('projects')
    ? await queryAll(
        `SELECT id, code, gls_number, name, stage FROM projects WHERE (name ILIKE ? ESCAPE '\\' OR code ILIKE ? ESCAPE '\\' OR gls_number ILIKE ? ESCAPE '\\') AND deleted_at IS NULL LIMIT 10`,
        [like, like, like]
      )
    : [];

  const customers = can('customers')
    ? await queryAll(
        /*
         * ⚠️ **電話番号と担当者も返す**（レビューでの指摘 #73）。
         * お客様の詳細（`/sales/customers/:id`）は**スマホでは PC 専用の案内**に
         * 差し替わるので、**外から電話をかけたい人は番号に辿り着けません**
         * （仕入先は `/budget/vendors` を開けるのに、お客様だけ道が無い）。
         * 探すの行に番号を出せば、**画面を開かずに答えになります**。
         *
         * Phase 3-2a: `/sales/customers/:id` の id 空間は `companies.id` に
         * 揃えたので、ここも `customers` ではなく `companies`（`is_customer = TRUE`）
         * から返す（この検索結果の id をそのままリンク先に使えるように）。
         * **`customers` 行が生きている会社に限る**（レビュー指摘・PR #199 P2 の2巡目）
         * — 消えていないと、削除済みの顧客がこの全体検索に残り続けてしまう。
         */
        `SELECT co.id, co.name, co.short_name, co.phone, co.contact_name FROM companies co
          WHERE co.is_customer = TRUE AND (co.name ILIKE ? ESCAPE '\\' OR co.short_name ILIKE ? ESCAPE '\\')
          AND co.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM customers cu WHERE cu.company_id = co.id AND cu.deleted_at IS NULL)
          LIMIT 5`,
        [like, like]
      )
    : [];

  /*
   * `customers` の検索結果とは違い、この結果の `id` はどこにもリンクしていない
   * （`/budget/vendors` を開くだけ・`SearchPage.tsx`/`SearchPalette.tsx`）ので
   * `companies.id` に揃える理由が無い。**名前・区分は `vendors` を読む**（レビュー指摘・
   * PR #202 P1 の2巡目）— `budget:editor` は `sales:owner` を持たなくても
   * `vendors` の名前・区分を直せるので、`companies` から読むと保存直後も
   * この検索結果だけ古い名前のまま残っていた。
   *
   * ⚠️ **仕入先ロールが外れた・削除済みの会社は除く**（レビュー指摘・PR #207 3巡目）。
   * `vendors` を単体で読むだけだと、`companies` 側で `is_vendor` を外したり
   * 論理削除しても `vendors` の子行はそのまま残るため、この全体検索にだけ
   * 生き続けてしまう（`companies.routes.ts` の削除・ロール解除は `vendors` を消さない）。
   */
  const vendors = can('vendors')
    ? await queryAll(
        `SELECT v.id, v.name, v.vendor_type
           FROM vendors v
           JOIN companies co ON co.id = v.company_id AND co.is_vendor = TRUE AND co.deleted_at IS NULL
          WHERE (v.name ILIKE ? ESCAPE '\\' OR v.vendor_type ILIKE ? ESCAPE '\\') AND v.deleted_at IS NULL
          LIMIT 5`,
        [like, like]
      )
    : [];

  // 機材は名前・機材コード・型番で引く（現場は型番で探すことが多い）
  const equipment = can('equipment')
    ? await queryAll(
        `SELECT id, eq_code, name, model_number FROM equipment_items
          WHERE (name ILIKE ? ESCAPE '\\' OR eq_code ILIKE ? ESCAPE '\\' OR model_number ILIKE ? ESCAPE '\\')
            AND deleted_at IS NULL LIMIT 5`,
        [like, like, like],
      )
    : [];

  res.json({ success: true, data: { projects, customers, vendors, equipment } });
});

export default router;
