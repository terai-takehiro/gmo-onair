import { Router } from 'express';
import { queryAll } from '../db/connection';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /search?q=keyword - Cross-search across entities
router.get('/', requireAuth, (req, res) => {
  const q = req.query.q as string;

  if (!q || q.length < 1) {
    res.json({ success: true, data: { opportunities: [], projects: [], customers: [], vendors: [] } });
    return;
  }

  const like = `%${q}%`;

  const opportunities = queryAll(
    `SELECT id, opp_code, title, stage FROM opportunities WHERE (title LIKE ? OR opp_code LIKE ?) AND deleted_at IS NULL LIMIT 5`,
    [like, like]
  );

  const projects = queryAll(
    `SELECT id, gls_number, name, status FROM projects WHERE (name LIKE ? OR gls_number LIKE ?) AND deleted_at IS NULL LIMIT 5`,
    [like, like]
  );

  const customers = queryAll(
    `SELECT id, name, short_name FROM customers WHERE (name LIKE ? OR short_name LIKE ?) AND deleted_at IS NULL LIMIT 5`,
    [like, like]
  );

  const vendors = queryAll(
    `SELECT id, name, vendor_type FROM vendors WHERE (name LIKE ? OR vendor_type LIKE ?) AND deleted_at IS NULL LIMIT 5`,
    [like, like]
  );

  res.json({ success: true, data: { opportunities, projects, customers, vendors } });
});

export default router;
