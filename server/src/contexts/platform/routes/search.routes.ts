import { Router } from 'express';
import { queryAll } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';

const router = Router();

// GET /search?q=keyword - Cross-search across entities
router.get('/', requireAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';

  if (!q || q.length < 1) {
    res.json({ success: true, data: { projects: [], customers: [], vendors: [] } });
    return;
  }

  const safe = q.replace(/[%_\\]/g, '\\$&');
  const like = `%${safe}%`;

  // ⌘K が「案件名 / 顧客名」の2行で出せるよう customer_name を同梱 (既存レスポンスへの追加)
  const projects = await queryAll(
    `SELECT p.id, p.code, p.gls_number, p.name, p.stage, c.name AS customer_name
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id AND c.deleted_at IS NULL
      WHERE (p.name ILIKE ? ESCAPE '\\' OR p.code ILIKE ? ESCAPE '\\' OR p.gls_number ILIKE ? ESCAPE '\\')
        AND p.deleted_at IS NULL
      LIMIT 10`,
    [like, like, like]
  );

  const customers = await queryAll(
    `SELECT id, name, short_name FROM customers WHERE (name ILIKE ? ESCAPE '\\' OR short_name ILIKE ? ESCAPE '\\') AND deleted_at IS NULL LIMIT 5`,
    [like, like]
  );

  const vendors = await queryAll(
    `SELECT id, name, vendor_type FROM vendors WHERE (name ILIKE ? ESCAPE '\\' OR vendor_type ILIKE ? ESCAPE '\\') AND deleted_at IS NULL LIMIT 5`,
    [like, like]
  );

  res.json({ success: true, data: { projects, customers, vendors } });
});

export default router;
