import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name ILIKE ? OR short_name ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM customers ${where}`, params)) as any).c;
  // v2.9.198+: AI 登録判定 (MCP create_customer) を mcp_audit_log から逆引き (activity-log.service と同形)
  const rows = await queryAll(
    `SELECT customers.*, (ai.audit_id IS NOT NULL) as is_ai_created, ai.requested_by as ai_requested_by
     FROM customers
     LEFT JOIN LATERAL (
       SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
       WHERE m.tool_name = 'create_customer' AND m.result_summary->>'created_id' = customers.id
       ORDER BY m.created_at ASC LIMIT 1
     ) ai ON TRUE
     ${where} ORDER BY name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as Record<string, unknown> | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  // AI 登録判定 (projects.routes の単体 enrichment と同形)
  const audit = await queryOne(
    `SELECT requested_by FROM mcp_audit_log
     WHERE tool_name = 'create_customer' AND result_summary->>'created_id' = ?
     ORDER BY created_at ASC LIMIT 1`,
    [row.id]
  ) as Record<string, unknown> | null;
  row.is_ai_created = !!audit;
  row.ai_requested_by = audit?.requested_by ?? null;
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('sales', 'owner'), async (req, res) => {
  const { name, short_name, contact_name, email, phone, address, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '顧客名は必須です');
  const id = uuidv4();
  await execute('INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, short_name || null, contact_name || null, email || null, phone || null, address || null, notes || null, req.user!.id]);
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('sales', 'owner'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  const { name, short_name, contact_name, email, phone, address, notes } = req.body;
  await execute(`UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, short_name || null, contact_name || null, email || null, phone || null, address || null, notes || null, req.user!.id, req.params.id]);
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(`UPDATE customers SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
