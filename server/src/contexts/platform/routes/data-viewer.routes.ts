import { Router } from 'express';
import { getDb, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';

const router = Router();

const ALLOWED_TABLES = [
  'users', 'customers', 'vendors', 'partners',
  'pricing_categories', 'pricing_items', 'sequences',
  'opportunities', 'opportunity_dates', 'opportunity_simulations',
  'project_groups', 'projects', 'episodes', 'episode_orders',
  'invoice_groups', 'invoice_group_episodes',
  'revenues', 'purchases', 'purchase_allocations',
  'sga_expenses', 'purchase_episode_allocations',
];

// GET /data-viewer/tables - list tables with row counts
router.get('/tables', requireAuth, requireRole('system_admin'), (_req, res) => {
  const tables = ALLOWED_TABLES.map(name => {
    const row = queryOne(`SELECT COUNT(*) as count FROM ${name}`);
    return { name, count: (row?.count as number) || 0 };
  });
  res.json({ success: true, data: tables });
});

// GET /data-viewer/tables/:name/schema - column info
router.get('/tables/:name/schema', requireAuth, requireRole('system_admin'), (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }
  const db = getDb();
  const stmt = db.prepare(`PRAGMA table_info(${name})`);
  const columns: Array<{ name: string; type: string }> = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    columns.push({ name: row.name as string, type: row.type as string });
  }
  stmt.free();
  res.json({ success: true, data: columns });
});

// GET /data-viewer/tables/:name - paginated data
router.get('/tables/:name', requireAuth, requireRole('system_admin'), (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;
  const sort = req.query.sort as string || 'rowid';
  const order = (req.query.order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const search = req.query.search as string;

  // Validate sort column exists
  const db = getDb();
  const pragmaStmt = db.prepare(`PRAGMA table_info(${name})`);
  const validColumns: string[] = [];
  while (pragmaStmt.step()) {
    validColumns.push(pragmaStmt.getAsObject().name as string);
  }
  pragmaStmt.free();

  const safeSort = validColumns.includes(sort) ? sort : 'rowid';

  let where = '';
  const params: unknown[] = [];
  if (search) {
    // Search across all text columns
    const textCols = validColumns.filter(c => c !== 'rowid');
    const conditions = textCols.map(c => `CAST(${c} AS TEXT) LIKE ?`);
    where = `WHERE ${conditions.join(' OR ')}`;
    for (let i = 0; i < textCols.length; i++) params.push(`%${search}%`);
  }

  const totalRow = queryOne(`SELECT COUNT(*) as c FROM ${name} ${where}`, params);
  const total = (totalRow?.c as number) || 0;
  const rows = queryAll(`SELECT * FROM ${name} ${where} ORDER BY ${safeSort} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);

  res.json({
    success: true,
    data: rows,
    columns: validColumns,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /data-viewer/tables/:name/export - CSV export
router.get('/tables/:name/export', requireAuth, requireRole('system_admin'), (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }

  const db = getDb();
  const pragmaStmt = db.prepare(`PRAGMA table_info(${name})`);
  const columns: string[] = [];
  while (pragmaStmt.step()) { columns.push(pragmaStmt.getAsObject().name as string); }
  pragmaStmt.free();

  const rows = queryAll(`SELECT * FROM ${name}`);

  // BOM for Excel UTF-8 compatibility
  let csv = '\uFEFF' + columns.join(',') + '\n';
  for (const row of rows) {
    csv += columns.map(c => {
      const val = (row as any)[c];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${name}.csv`);
  res.send(csv);
});

export default router;
