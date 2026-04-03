import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateBillingKey } from '../../../shared/services/billing-key.service';

const router = Router();

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.query.project_id as string;
  let where = 'WHERE r.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (r.billing_key ILIKE ? OR r.notes ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (projectId) { where += ` AND r.project_id = ?`; params.push(projectId); }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM revenues r ${where}`, params)) as any).c;
  const rows = await queryAll(`SELECT r.*, p.name as project_name, p.gls_number, c.name as customer_name, e.episode_code FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN episodes e ON e.id = r.episode_id ${where} ORDER BY r.recognition_date DESC, r.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne(`SELECT r.*, p.name as project_name, p.gls_number, c.name as customer_name, e.episode_code FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN episodes e ON e.id = r.episode_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, async (req, res) => {
  const { project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes } = req.body;
  if (!project_id || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と顧客は必須です');
  if (!episode_id) throw new AppError(400, 'VALIDATION_ERROR', 'エピソードは必須です');

  // Look up episode_code for billing_key generation
  const episode = await queryOne('SELECT episode_code FROM episodes WHERE id = ?', [episode_id]) as any;
  if (!episode) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  const billing_key = generateBillingKey(episode.episode_code, tax_category || 'tax10');
  const id = uuidv4();
  await execute(`INSERT INTO revenues (id, billing_key, project_id, customer_id, episode_id, assigned_to, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, customer_id, episode_id, req.user!.id, tax_category || 'tax10', amount || 0, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, req.user!.id]);
  const row = await queryOne('SELECT * FROM revenues WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, async (req, res) => {
  const existing = await queryOne('SELECT * FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  const { billing_key, project_id, customer_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes } = req.body;

  // Regenerate billing_key if tax_category changed
  let finalBillingKey = billing_key || existing.billing_key;
  if (tax_category && tax_category !== existing.tax_category && existing.episode_id) {
    const episode = await queryOne('SELECT episode_code FROM episodes WHERE id = ?', [existing.episode_id]) as any;
    if (episode) {
      finalBillingKey = generateBillingKey(episode.episode_code, tax_category);
    }
  }

  await execute(`UPDATE revenues SET billing_key=?, project_id=?, customer_id=?, tax_category=?, amount=?, recognition_date=?, billing_date=?, payment_due_date=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [finalBillingKey || null, project_id, customer_id, tax_category, amount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, req.user!.id, req.params.id]);
  const row = await queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, async (req, res) => {
  await execute(`UPDATE revenues SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
