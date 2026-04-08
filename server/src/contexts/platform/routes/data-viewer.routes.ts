import { Router } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requireRole, requirePermission } from '../../../shared/middleware/auth';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('admin'));

const ALLOWED_TABLES = [
  'users', 'customers', 'vendors', 'partners',
  'pricing_categories', 'pricing_items', 'sequences',
  'projects', 'episodes', 'episode_orders',
  'simulations',
  'invoice_groups', 'invoice_group_episodes',
  'revenues', 'purchases',
  'sga_expenses',
  'activity_logs', 'sales_targets',
];

// PostgreSQL identifier quoting (prevents injection in table/column names)
function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

// GET /data-viewer/tables - list tables with row counts
router.get('/tables', requireRole('system_admin'), async (_req, res) => {
  const tables = [];
  for (const name of ALLOWED_TABLES) {
    const row = await queryOne(`SELECT COUNT(*) as count FROM ${quoteIdent(name)}`);
    tables.push({ name, count: (row?.count as number) || 0 });
  }
  res.json({ success: true, data: tables });
});

// GET /data-viewer/tables/:name/schema - column info
router.get('/tables/:name/schema', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }
  const columns = await queryAll(
    `SELECT column_name as name, data_type as type FROM information_schema.columns WHERE table_name = ?`,
    [name]
  ) as Array<{ name: string; type: string }>;
  res.json({ success: true, data: columns });
});

// GET /data-viewer/tables/:name - paginated data
router.get('/tables/:name', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;
  const sort = req.query.sort as string || 'id';
  const order = (req.query.order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const search = req.query.search as string;

  // Validate sort column exists
  const colRows = await queryAll(
    `SELECT column_name as name FROM information_schema.columns WHERE table_name = ?`,
    [name]
  ) as Array<{ name: string }>;
  const validColumns = colRows.map(r => r.name);

  const safeSort = validColumns.includes(sort) ? sort : 'id';

  let where = '';
  const params: unknown[] = [];
  if (search) {
    const safeSearch = String(search).slice(0, 100).replace(/[%_\\]/g, '\\$&');
    // Search across all text columns with quoted identifiers
    const textCols = validColumns.filter(c => c !== 'id');
    const conditions = textCols.map(c => `CAST(${quoteIdent(c)} AS TEXT) ILIKE ? ESCAPE '\\'`);
    where = `WHERE ${conditions.join(' OR ')}`;
    for (let i = 0; i < textCols.length; i++) params.push(`%${safeSearch}%`);
  }

  const quotedTable = quoteIdent(name);
  const totalRow = await queryOne(`SELECT COUNT(*) as c FROM ${quotedTable} ${where}`, params);
  const total = (totalRow?.c as number) || 0;
  const rows = await queryAll(`SELECT * FROM ${quotedTable} ${where} ORDER BY ${quoteIdent(safeSort)} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);

  res.json({
    success: true,
    data: rows,
    columns: validColumns,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /data-viewer/tables/:name/export - CSV export
router.get('/tables/:name/export', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }

  const colRows = await queryAll(
    `SELECT column_name as name FROM information_schema.columns WHERE table_name = ?`,
    [name]
  ) as Array<{ name: string }>;
  const columns = colRows.map(r => r.name);

  const rows = await queryAll(`SELECT * FROM ${quoteIdent(name)}`);

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
