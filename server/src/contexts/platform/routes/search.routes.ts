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
  vendors: 'sales', // `budget` は権限モデル単純化で `sales` に統合済み
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
         *
         * Phase 3-3-4（2026-08-18）: 以前は `customers` 行が生きているかの
         * `EXISTS` チェックも必須だった（`DELETE /customers/:id` が
         * `companies.is_customer` を更新していなかったため）。`DELETE` が
         * `companies.is_customer` も更新するようになった（PR #226）ので、
         * `co.is_customer = TRUE AND co.deleted_at IS NULL` だけで足りる
         * （`customers.routes.ts` の一覧・詳細と同じ判定・同じ理由）。
         */
        `SELECT co.id, co.name, co.short_name, co.phone, co.contact_name FROM companies co
          WHERE co.is_customer = TRUE AND (co.name ILIKE ? ESCAPE '\\' OR co.short_name ILIKE ? ESCAPE '\\')
          AND co.deleted_at IS NULL
          LIMIT 5`,
        [like, like]
      )
    : [];

  /*
   * Phase 3-3-9（`vendors` テーブル削除）以降、`finance/routes/vendors.routes.ts`
   * 自身も `companies` だけを正として読み書きするようになったため、この検索も
   * `companies` から読めば表示と保存直後の値が食い違うことはない
   * （`customers` の検索結果と同じ形に揃った）。
   */
  const vendors = can('vendors')
    ? await queryAll(
        `SELECT co.id, co.name, co.vendor_type
           FROM companies co
          WHERE co.is_vendor = TRUE AND co.deleted_at IS NULL
            AND (co.name ILIKE ? ESCAPE '\\' OR co.vendor_type ILIKE ? ESCAPE '\\')
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
