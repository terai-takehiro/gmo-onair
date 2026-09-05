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

/**
 * 担当者（`assigned_to`）が実在するユーザーかを確かめる。`purchases.assigned_to` に
 * FK 制約が無いため（`vendor_id` と同じ理由）、アプリ側で確認しないと存在しない
 * ID・削除済みユーザーの ID がそのまま保存できてしまう（レビュー指摘）。
 */
async function assertAssignedToExists(userId: string): Promise<void> {
  const row = await queryOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!row) throw new AppError(400, 'VALIDATION_ERROR', '担当者が見つかりません');
}

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

/**
 * Phase 3-3-9（`vendors` テーブル削除）以降、仕入先名は `companies` から
 * 直接読む。以前は `vendors` を正としつつ削除済み仕入先は `companies` へ
 * 落とす形だったが（`vendors.routes.ts` が `budget:editor` 単独編集を
 * `vendors` だけに留めていたため）、`vendors.routes.ts` 自身も `companies` を
 * 直接読み書きするようになったので、このフォールバックは不要になった。
 */
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

  // ⚠️ **`companies vco` を必ず入れる。** `buildPurchaseWhere` は検索で `vco.name` を
  // 見るので、この join が無いと `?search=` で `missing FROM-clause entry` になる
  // （行を引くクエリだけ join があり、COUNT/SUM/件数には無かったのが 500 の原因）。
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM purchases pu LEFT JOIN projects p ON p.id = pu.project_id LEFT JOIN companies vco ON vco.id = pu.vendor_id ${allocJoin} ${where}`, [...allocParams, ...params])) as any).c;
  const rows = await queryAll(
    `SELECT pu.*, p.name as project_name, p.gls_number, p.code as project_code, vco.name as vendor_name, pg.name as group_name, e.episode_code, au.name as assigned_to_name${allocCol}
     FROM purchases pu
     LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN companies vco ON vco.id = pu.vendor_id
     LEFT JOIN project_groups pg ON pg.id = pu.group_id
     LEFT JOIN episodes e ON e.id = pu.episode_id
     LEFT JOIN users au ON au.id = pu.assigned_to
     ${allocJoin}
     ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...allocParams, ...params, limit, offset]
  );
  // 一覧の下に出す合計。**表示中のページではなく絞り込み全体**（めくるたびに変わらない）
  // ⚠️ 検索が `vco.name` を見るので `companies vco` は必須（上と同じ理由）
  const joins = `FROM purchases pu
     LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN companies vco ON vco.id = pu.vendor_id ${allocJoin}`;
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
router.get('/export', requirePermission('sales', 'exporter'), async (_req, res) => {
  const rows = await queryAll(
    // ⚠️ **役務提供完了日だけ DATE 型**なので `TO_CHAR` で文字列にする。素で取ると
    // `String(Date)` されて `Mon Aug 31 2026 00:00:00 GMT+0000 (...)` がセルに入る
    `SELECT vco.name as vendor_name, p.name as project_name, pu.description, pu.amount, pu.tax_category as tax, pu.amount as total, pu.recognition_date as date,
            TO_CHAR(pu.service_completed_date, 'YYYY-MM-DD') as service_completed_date
     FROM purchases pu
     LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN companies vco ON vco.id = pu.vendor_id
     WHERE pu.deleted_at IS NULL
     ORDER BY pu.recognition_date DESC, pu.created_at DESC`
  ) as Record<string, unknown>[];
  // ⚠️ **末尾に足すこと。** 既存の列の位置がずれると、この CSV を読んでいる
  // 手元の Excel やマクロが黙って壊れる
  const columns = ['vendor_name', 'project_name', 'description', 'amount', 'tax', 'total', 'date', 'service_completed_date'];
  csvResponse(res, 'purchases.csv', generateCsv(rows, columns));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne(
    `SELECT pu.*, p.name as project_name, p.gls_number, vco.name as vendor_name, e.episode_code, au.name as assigned_to_name
     FROM purchases pu LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN companies vco ON vco.id = pu.vendor_id
     LEFT JOIN episodes e ON e.id = pu.episode_id
     LEFT JOIN users au ON au.id = pu.assigned_to
     WHERE pu.id = ? AND pu.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const { project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, settlement_url,
          tax_category, invoice_qualified, amount, description,
          recognition_date, inspection_date, payment_due_date, notes, is_provisional,
          service_completed_date } = req.body;
  if (!project_id || !vendor_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と仕入先は必須です');
  // `vendor_id` は companies.id（Phase 3-2b）を直接指すため、DB の FK は
  // 「仕入先ロールの会社か」を保証しない（`revenues.routes.ts` の customer_id と同じ理由）
  await assertVendorCompanyId(vendor_id);

  // `assigned_to` は任意項目（SGA・売上と同水準）。**欄自体を送らない古い呼び出し
  // （Excel取込・MCP等）だけ作成者に落とす** — 画面が「担当者なし」を明示的に選び
  // `null` を送ったときまで作成者にすり替えると、消したはずの選択が嘘になる
  // （レビュー指摘。`assigned_to || req.user!.id` は `null` も未指定も区別できていなかった）
  const assignedToValue = assigned_to === undefined ? req.user!.id : (assigned_to || null);
  if (assignedToValue) await assertAssignedToExists(assignedToValue);

  let billing_key: string | null = null;
  if (episode_id) {
    const episode = await queryOne('SELECT episode_code FROM episodes WHERE id = ?', [episode_id]) as any;
    if (episode) billing_key = generateBillingKey(episode.episode_code, tax_category || 'tax10');
  }

  const id = uuidv4();
  await execute(
    `INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, settlement_url, tax_category, invoice_qualified, amount, description, recognition_date, inspection_date, payment_due_date, notes, is_provisional, service_completed_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, episode_id || null, vendor_id, assignedToValue,
     settlement_method || null, settlement_number || null, settlement_url || null, tax_category || 'tax10',
     invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
     amount || 0, description || null, recognition_date || null,
     inspection_date || null, payment_due_date || null, notes || null, is_provisional ? true : false,
     service_completed_date || null, req.user!.id]
  );
  const row = await queryOne('SELECT * FROM purchases WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');

  const { project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, settlement_url,
          tax_category, invoice_qualified, amount, description,
          recognition_date, inspection_date, payment_due_date, notes, is_provisional,
          service_completed_date } = req.body;
  // 新しく渡された vendor_id・assigned_to だけ確かめる（`revenues.routes.ts` の PUT と
  // 同じ理由。既存値は再検証しない）。**「渡された値」ではなく「変わった値」で
  // 判定する** — 担当者がこの検証を足す前から削除済み・存在しないIDを指していた
  // 行を編集フォームがそのまま送り返してくると、担当者と無関係な項目を1つ直す
  // だけの更新まで拒否してしまう（レビュー指摘）
  if (vendor_id) await assertVendorCompanyId(vendor_id);
  if (assigned_to && assigned_to !== existing.assigned_to) await assertAssignedToExists(assigned_to);
  // 部分更新契約: 送られなかったフィールドは既存値を保持する (省略で NOT NULL 違反・
  // 計上日消失・適格 0 への強制降格が起きていたのを防ぐ)。空文字は null 化する。
  await execute(
    `UPDATE purchases SET project_id=?, episode_id=?, vendor_id=?, assigned_to=?, settlement_method=?, settlement_number=?, settlement_url=?,
     tax_category=?, invoice_qualified=?, amount=?, description=?,
     recognition_date=?, inspection_date=?, payment_due_date=?, notes=?, is_provisional=?, service_completed_date=?,
     updated_at=NOW(), updated_by=? WHERE id=?`,
    [project_id !== undefined ? project_id : existing.project_id,
     episode_id !== undefined ? (episode_id || null) : existing.episode_id,
     vendor_id !== undefined ? vendor_id : existing.vendor_id,
     assigned_to !== undefined ? (assigned_to || null) : existing.assigned_to,
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

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(`UPDATE purchases SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
