import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateBillingKey } from '../../../shared/services/billing-key.service';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';
import { buildPurchaseWhere, buildPurchaseOrder } from '../list-query';
import { assertVendorCompanyId } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

router.get('/', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const projectId = req.query.project_id as string;
  const { where, params } = buildPurchaseWhere(req.query);
  const orderBy = buildPurchaseOrder(req.query);

  const allocJoin = projectId
    ? `LEFT JOIN purchase_allocations pa ON pa.purchase_id = pu.id AND pa.project_id = ?`
    : '';
  const allocCol = projectId ? ', pa.allocated_amount' : '';
  const allocParams = projectId ? [projectId] : [];

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM purchases pu LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL LEFT JOIN projects p ON p.id = pu.project_id ${allocJoin} ${where}`, [...allocParams, ...params])) as any).c;
  const rows = await queryAll(
    `SELECT pu.*, p.name as project_name, p.gls_number, p.code as project_code, v.name as vendor_name, pg.name as group_name, e.episode_code${allocCol}
     FROM purchases pu
     LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL
     LEFT JOIN project_groups pg ON pg.id = pu.group_id
     LEFT JOIN episodes e ON e.id = pu.episode_id
     ${allocJoin}
     ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...allocParams, ...params, limit, offset]
  );
  // 一覧の下に出す合計。**表示中のページではなく絞り込み全体**（めくるたびに変わらない）
  const joins = `FROM purchases pu
     LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL ${allocJoin}`;
  const sum = (await queryOne(
    `SELECT COALESCE(SUM(pu.amount), 0) as s ${joins} ${where}`, [...allocParams, ...params])) as { s: string } | null;

  /*
   * ⚠️ **案件で絞ったときは「この案件のぶん」も返す**（レビューでの指摘 #87・売上と同じ形）。
   * `pu.amount` は分け合う仕入なら全体の額なので、案件詳細が行を足すと
   * 他案件のぶんまで原価に乗ります。しかも 100 件で切って足していました。
   */
  const alloc = projectId ? (await queryOne(
    `SELECT COALESCE(SUM(COALESCE(pa.allocated_amount, pu.amount)), 0) AS s ${joins} ${where}`,
    [...allocParams, ...params],
  )) as { s: string } | null : null;

  // 絞り込みチップの件数。**state 以外の絞り込みだけ**を掛けて数える
  const { state: _state, ...restQuery } = req.query as Record<string, unknown>;
  const base = buildPurchaseWhere(restQuery as typeof req.query);
  const counts = (await queryOne(
    `SELECT COUNT(*) FILTER (WHERE pu.is_provisional IS NOT TRUE) as fixed,
            COUNT(*) FILTER (WHERE pu.is_provisional = true) as prov,
            COUNT(*) FILTER (WHERE pu.settlement_url IS NULL OR pu.settlement_url = '') as nourl,
            COUNT(*) as all
     ${joins} ${base.where}`, [...allocParams, ...base.params])) as Record<string, string>;

  res.json({
    ...paginatedResponse(rows, total, page, limit),
    total_amount: Number(sum?.s ?? 0),
    // 案件で絞ったときだけ。分け合う仕入は**この案件への配分額**で足す
    ...(alloc ? { total_allocated_amount: Number(alloc.s) } : {}),
    state_counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, Number(v)])),
  });
});

// CSV Export
router.get('/export', requirePermission('budget', 'exporter'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT v.name as vendor_name, p.name as project_name, pu.description, pu.amount, pu.tax_category as tax, pu.amount as total, pu.recognition_date as date
     FROM purchases pu
     LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL
     WHERE pu.deleted_at IS NULL
     ORDER BY pu.recognition_date DESC, pu.created_at DESC`
  ) as Record<string, unknown>[];
  const columns = ['vendor_name', 'project_name', 'description', 'amount', 'tax', 'total', 'date'];
  csvResponse(res, 'purchases.csv', generateCsv(rows, columns));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne(
    `SELECT pu.*, p.name as project_name, p.gls_number, v.name as vendor_name, e.episode_code
     FROM purchases pu LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL LEFT JOIN episodes e ON e.id = pu.episode_id
     WHERE pu.id = ? AND pu.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  const { project_id, episode_id, vendor_id, settlement_method, settlement_number, settlement_url,
          tax_category, invoice_qualified, amount, description,
          recognition_date, inspection_date, payment_due_date, notes, is_provisional,
          service_completed_date } = req.body;
  if (!project_id || !vendor_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と仕入先は必須です');
  // `vendor_id` は companies.id（Phase 3-2b）を直接指すため、DB の FK は
  // 「仕入先ロールの会社か」を保証しない（`revenues.routes.ts` の customer_id と同じ理由）
  await assertVendorCompanyId(vendor_id);

  let billing_key: string | null = null;
  if (episode_id) {
    const episode = await queryOne('SELECT episode_code FROM episodes WHERE id = ?', [episode_id]) as any;
    if (episode) billing_key = generateBillingKey(episode.episode_code, tax_category || 'tax10');
  }

  const id = uuidv4();
  await execute(
    `INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, settlement_url, tax_category, invoice_qualified, amount, description, recognition_date, inspection_date, payment_due_date, notes, is_provisional, service_completed_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, episode_id || null, vendor_id, req.user!.id,
     settlement_method || null, settlement_number || null, settlement_url || null, tax_category || 'tax10',
     invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
     amount || 0, description || null, recognition_date || null,
     inspection_date || null, payment_due_date || null, notes || null, is_provisional ? true : false,
     service_completed_date || null, req.user!.id]
  );
  const row = await queryOne('SELECT * FROM purchases WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');

  const { project_id, episode_id, vendor_id, settlement_method, settlement_number, settlement_url,
          tax_category, invoice_qualified, amount, description,
          recognition_date, inspection_date, payment_due_date, notes, is_provisional,
          service_completed_date } = req.body;
  // 新しく渡された vendor_id だけ確かめる（`revenues.routes.ts` の PUT と同じ理由。
  // 既存値は再検証しない）
  if (vendor_id) await assertVendorCompanyId(vendor_id);
  // 部分更新契約: 送られなかったフィールドは既存値を保持する (省略で NOT NULL 違反・
  // 計上日消失・適格 0 への強制降格が起きていたのを防ぐ)。空文字は null 化する。
  await execute(
    `UPDATE purchases SET project_id=?, episode_id=?, vendor_id=?, settlement_method=?, settlement_number=?, settlement_url=?,
     tax_category=?, invoice_qualified=?, amount=?, description=?,
     recognition_date=?, inspection_date=?, payment_due_date=?, notes=?, is_provisional=?, service_completed_date=?,
     updated_at=NOW(), updated_by=? WHERE id=?`,
    [project_id !== undefined ? project_id : existing.project_id,
     episode_id !== undefined ? (episode_id || null) : existing.episode_id,
     vendor_id !== undefined ? vendor_id : existing.vendor_id,
     settlement_method !== undefined ? (settlement_method || null) : existing.settlement_method,
     settlement_number !== undefined ? (settlement_number || null) : existing.settlement_number,
     settlement_url !== undefined ? (settlement_url || null) : existing.settlement_url,
     tax_category !== undefined ? tax_category : existing.tax_category,
     invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : existing.invoice_qualified,
     amount !== undefined ? amount : existing.amount,
     description !== undefined ? (description || null) : existing.description,
     recognition_date !== undefined ? (recognition_date || null) : existing.recognition_date,
     inspection_date !== undefined ? (inspection_date || null) : existing.inspection_date,
     payment_due_date !== undefined ? (payment_due_date || null) : existing.payment_due_date,
     notes !== undefined ? (notes || null) : existing.notes,
     is_provisional !== undefined ? !!is_provisional : existing.is_provisional,
     service_completed_date !== undefined ? (service_completed_date || null) : existing.service_completed_date,
     req.user!.id, req.params.id]
  );
  const row = await queryOne('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('budget', 'manager'), async (req, res) => {
  await execute(`UPDATE purchases SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
