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
        `SELECT id, name, short_name FROM customers WHERE (name ILIKE ? ESCAPE '\\' OR short_name ILIKE ? ESCAPE '\\') AND deleted_at IS NULL LIMIT 5`,
        [like, like]
      )
    : [];

  const vendors = can('vendors')
    ? await queryAll(
        `SELECT id, name, vendor_type FROM vendors WHERE (name ILIKE ? ESCAPE '\\' OR vendor_type ILIKE ? ESCAPE '\\') AND deleted_at IS NULL LIMIT 5`,
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
