import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateEstimatePdf } from '../../../shared/services/pdf.service';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

// 売上一覧
router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.query.project_id as string;
  let where = 'WHERE r.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (r.billing_key ILIKE ? OR r.notes ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }

  // プロジェクト絞込み: 直接売上 + グループ按分された売上
  if (projectId) {
    where += ` AND ((r.project_id = ? AND r.group_id IS NULL) OR r.id IN (SELECT revenue_id FROM revenue_allocations WHERE project_id = ?))`;
    params.push(projectId, projectId);
  }
  const status = req.query.status as string;
  if (status) { where += ` AND r.status = ?`; params.push(status); }
  else if (!projectId) { where += ` AND r.status = 'confirmed'`; }

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM revenues r ${where}`, params)) as any).c;

  // allocated_amount: グループ按分時はこのプロジェクトへの配分額
  const allocJoin = projectId
    ? `LEFT JOIN revenue_allocations ra ON ra.revenue_id = r.id AND ra.project_id = '${projectId.replace(/'/g, "''")}'`
    : '';
  const allocCol = projectId ? ', ra.allocated_amount, pg.name as group_name' : '';

  const rows = await queryAll(
    `SELECT r.*, p.name as project_name, p.gls_number, p.project_type, c.name as customer_name, e.episode_code${allocCol}
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN episodes e ON e.id = r.episode_id
     ${allocJoin}
     ${projectId ? 'LEFT JOIN project_groups pg ON pg.id = r.group_id' : ''}
     ${where} ORDER BY r.billing_key ASC, r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // プロジェクト絞込み時は明細行も付与
  if (projectId) {
    for (const row of rows as any[]) {
      row.items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [row.id]);
    }
  }

  res.json(paginatedResponse(rows, total, page, limit));
});

// CSV Export
router.get('/export', requirePermission('budget', 'exporter'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.name as project_name, r.subtitle, r.amount, r.tax_category, r.amount as total, r.status, r.recognition_date as date
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     WHERE r.deleted_at IS NULL
     ORDER BY r.billing_key ASC, r.created_at DESC`
  ) as Record<string, unknown>[];
  const columns = ['project_name', 'subtitle', 'amount', 'tax_category', 'total', 'status', 'date'];
  csvResponse(res, 'revenues.csv', generateCsv(rows, columns));
});

// 売上詳細（明細行つき）
router.get('/:id', async (req, res) => {
  const row = await queryOne(`SELECT r.*, p.name as project_name, p.gls_number, p.project_type, c.name as customer_name, e.episode_code FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN episodes e ON e.id = r.episode_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

  const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]);
  row.items = items;
  res.json({ success: true, data: row });
});

// PDF出力
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const row = await queryOne(`SELECT r.*, p.name as project_name, p.gls_number, c.name as customer_name FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]) as any;
    if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

    const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]) as any[];

    const pdfBuffer = await generateEstimatePdf({
      billing_key: row.billing_key,
      subtitle: row.subtitle,
      customer_name: row.customer_name || '',
      project_name: row.project_name || '',
      gls_number: row.gls_number,
      tax_category: row.tax_category,
      amount: row.amount,
      recognition_date: row.recognition_date,
      billing_date: row.billing_date,
      payment_due_date: row.payment_due_date,
      notes: row.notes,
      status: row.status || 'confirmed',
      items: items.map((it: any) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
      })),
    });

    const isEstimate = row.status === 'estimate';
    const filename = `${isEstimate ? '見積書' : '請求書'}_${row.billing_key}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// 新規売上（明細行対応、episode_id任意）
router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  const { project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle, status: reqStatus } = req.body;
  if (!project_id || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と顧客は必須です');

  const revenueStatus = reqStatus === 'estimate' ? 'estimate' : 'confirmed';

  // billing_key生成
  const project = await queryOne('SELECT gls_number, code FROM projects WHERE id = ?', [project_id]) as any;
  const existingCount = ((await queryOne(
    `SELECT COUNT(*) as c FROM revenues WHERE project_id = ? AND deleted_at IS NULL`,
    [project_id]
  )) as any).c;
  const seqNum = String(existingCount + 1).padStart(3, '0');
  const taxSuffix = (tax_category || 'tax10') === 'tax8' ? '2' : (tax_category === 'exempt' ? '0' : '1');

  let billing_key: string;
  if (revenueStatus === 'estimate') {
    // 概算見積: EST-OPPコード-連番-税枝番
    billing_key = `EST-${seqNum}-${taxSuffix}`;
  } else {
    // 確定: GLS番号-連番-税枝番
    const base = project?.gls_number || 'REV';
    billing_key = `${base}-${seqNum}-${taxSuffix}`;
  }

  const id = uuidv4();

  // 明細行がある場合は合計を計算
  const finalAmount = Array.isArray(items) && items.length > 0
    ? items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0)
    : (amount || 0);

  await execute(`INSERT INTO revenues (id, billing_key, project_id, customer_id, episode_id, assigned_to, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, subtitle, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, customer_id, episode_id || null, req.user!.id, tax_category || 'tax10', finalAmount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, subtitle || null, revenueStatus, req.user!.id]);

  // 明細行を保存
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await execute(`INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1]);
    }
  }

  const row = await queryOne('SELECT * FROM revenues WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// 売上更新（明細行対応）
router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  const { billing_key, project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle } = req.body;

  // 税区分変更時はbilling_keyの末尾税枝番を更新
  let finalBillingKey = existing.billing_key;
  if (tax_category && tax_category !== existing.tax_category) {
    const taxSuffix = tax_category === 'tax8' ? '2' : (tax_category === 'exempt' ? '0' : '1');
    // 末尾の税枝番を置換 (GLS-A004-001-1 → GLS-A004-001-2)
    finalBillingKey = existing.billing_key.replace(/-\d$/, `-${taxSuffix}`);
  }

  // 明細行がある場合は合計を計算
  const finalAmount = Array.isArray(items) && items.length > 0
    ? items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0)
    : (amount !== undefined ? amount : existing.amount);

  await execute(`UPDATE revenues SET billing_key=?, project_id=?, customer_id=?, episode_id=?, tax_category=?, amount=?, recognition_date=?, billing_date=?, payment_due_date=?, notes=?, subtitle=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [finalBillingKey || null, project_id || existing.project_id, customer_id || existing.customer_id, episode_id !== undefined ? (episode_id || null) : existing.episode_id, tax_category || existing.tax_category, finalAmount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, subtitle !== undefined ? (subtitle || null) : existing.subtitle, req.user!.id, req.params.id]);

  // 明細行を置換
  if (Array.isArray(items)) {
    await execute('DELETE FROM revenue_items WHERE revenue_id = ?', [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await execute(`INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), req.params.id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1]);
    }
  }

  const row = await queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// 売上削除
router.delete('/:id', requirePermission('budget', 'manager'), async (req, res) => {
  await execute(`UPDATE revenues SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
