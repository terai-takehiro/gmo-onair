import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateEstimatePdf } from '../../../shared/services/pdf.service';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';
import { buildExcelWorkbook, excelResponse } from '../../../shared/utils/excel';
import { buildRevenueWhere, buildRevenueOrder } from '../list-query';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

// 売上一覧
router.get('/', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const projectId = req.query.project_id as string;
  const { where, params } = buildRevenueWhere(req.query);
  const orderBy = buildRevenueOrder(req.query);

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id ${where}`, params)) as any).c;

  // allocated_amount: グループ按分時はこのプロジェクトへの配分額
  const allocJoin = projectId
    ? `LEFT JOIN revenue_allocations ra ON ra.revenue_id = r.id AND ra.project_id = ?`
    : '';
  const allocParams: unknown[] = projectId ? [projectId] : [];
  const allocCol = projectId ? ', ra.allocated_amount, pg.name as group_name' : '';

  const rows = await queryAll(
    `SELECT r.*, p.name as project_name, p.gls_number, p.project_type, p.event_end, c.name as customer_name, e.episode_code${allocCol}
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN episodes e ON e.id = r.episode_id
     ${allocJoin}
     ${projectId ? 'LEFT JOIN project_groups pg ON pg.id = r.group_id' : ''}
     ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...allocParams, ...params, limit, offset]
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
  const row = await queryOne(`SELECT r.*, p.name as project_name, p.gls_number, p.project_type, p.event_end, c.name as customer_name, e.episode_code FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN episodes e ON e.id = r.episode_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

  const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]);
  row.items = items;
  res.json({ success: true, data: row });
});

// PDF出力
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT r.*, p.name as project_name, p.gls_number, e.episode_code,
              p.event_start as project_start, p.event_end as project_end,
              c.name as customer_name,
              c.address as customer_address,
              c.contact_name as customer_contact
       FROM revenues r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
       WHERE r.id = ? AND r.deleted_at IS NULL`,
      [req.params.id]
    ) as any;
    if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

    const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]) as any[];

    // ?type=estimate|invoice|inspection で帳票種別を明示指定可 (未指定は売上ステータスに従う)。
    // これにより確定売上からも「見積書」を、概算見積からも「請求書」を、いずれからも「検収書」を発行できる。
    const typeParam = req.query.type as string | undefined;
    const docStatus = typeParam === 'estimate' ? 'estimate'
      : typeParam === 'invoice' ? 'confirmed'
      : typeParam === 'inspection' ? 'inspection'
      : (row.status || 'confirmed');

    const pdfBuffer = await generateEstimatePdf({
      billing_key: row.billing_key,
      subtitle: row.subtitle,
      customer_name: row.customer_name || '',
      customer_address: row.customer_address || null,
      customer_contact: row.customer_contact || null,
      project_name: row.project_name || '',
      // 月次ユニット等エピソード紐づき時は帳票ヘッダーにも月コード (GLS-B005-2607) を出す
      gls_number: row.episode_code || row.gls_number,
      tax_category: row.tax_category,
      amount: row.amount,
      recognition_date: row.recognition_date,
      billing_date: row.billing_date,
      payment_due_date: row.payment_due_date,
      notes: row.notes,
      status: docStatus,
      project_start: row.project_start || null,
      project_end: row.project_end || null,
      items: items.map((it: any) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
        period_start: it.period_start || null,
        period_end: it.period_end || null,
        item_notes: it.item_notes || null,
        category: it.category || null,
      })),
    });

    const docLabel = docStatus === 'estimate' ? '見積書' : docStatus === 'inspection' ? '検収書' : '請求書';
    // v2.8.107+: ファイル名は project.gls_number (live) を使う。
    // billing_key は revenue 作成時のスナップショット (例: "GLS001-001-1") のため、
    // 後で project の GLS を変更してもそのままだと古い GLS のファイル名で出てしまう。
    // billing_key の最初のダッシュまでが GLS-prefix なので、そこだけを live gls_number で
    // 置換し、エピソード/税枝番のサフィックスは保つ。GLS 未発番ケースは billing_key そのまま。
    let filenameKey = row.billing_key || '';
    if (row.gls_number && filenameKey) {
      const dash = filenameKey.indexOf('-');
      if (dash > 0 && /^GLS\d+$/i.test(filenameKey.slice(0, dash))) {
        filenameKey = row.gls_number + filenameKey.slice(dash);
      }
    }
    const filename = `${docLabel}_${filenameKey}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// 請求書 Excel 出力 (業務推進への監査提出用・BOX 格納フォーマット準拠)
// 1 明細行 = 1 レコードのフラットな表 (請求先情報は各行に反復)。
router.get('/:id/excel', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT r.*, p.name as project_name, p.gls_number, e.episode_code,
              p.event_start as project_start, p.event_end as project_end,
              c.name as customer_name,
              c.address as customer_address,
              c.contact_name as customer_contact
       FROM revenues r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
       WHERE r.id = ? AND r.deleted_at IS NULL`,
      [req.params.id]
    ) as any;
    if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

    const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]) as any[];

    // YYYY/M/D 形式 (ゼロ埋めなし)
    const dateSlash = (d: string | null | undefined): string => {
      if (!d) return '';
      const p = String(d).slice(0, 10).split('-');
      return p.length >= 3 ? `${parseInt(p[0])}/${parseInt(p[1])}/${parseInt(p[2])}` : String(d);
    };
    // 税区分 → 税率ラベル + 税込への係数
    const tc = row.tax_category as string;
    const rateLabel = tc === 'tax8' ? '8%' : tc === 'exempt' ? '非課税' : '10%';
    const rateMul = tc === 'tax8' ? 1.08 : tc === 'exempt' ? 1 : 1.1;
    const inclusive = (net: number): number => (tc === 'exempt' ? net : Math.round(net * rateMul));

    // 請求先住所は 1 カラムのため住所1 に全文を入れる (郵便番号/建物名は分離保持していない)
    const addr1 = (row.customer_address || '').replace(/\n/g, ' ').trim();

    // 明細行 → フラット行。明細が無ければ売上金額で 1 行組み立てる。
    type Src = { description: string; quantity: number; unit_price: number; amount: number; period_start: string | null; period_end: string | null; item_notes: string | null };
    const srcItems: Src[] = items.length > 0
      ? items.map((it) => ({
          description: it.description || '',
          quantity: it.quantity ?? 1,
          unit_price: it.unit_price ?? 0,
          amount: it.amount ?? 0,
          period_start: it.period_start || null,
          period_end: it.period_end || null,
          item_notes: it.item_notes || null,
        }))
      : [{
          description: row.subtitle || row.project_name || '',
          quantity: 1,
          unit_price: row.amount ?? 0,
          amount: row.amount ?? 0,
          period_start: null,
          period_end: null,
          item_notes: row.notes || null,
        }];

    const rows = srcItems.map((it, i) => {
      const pS = it.period_start || row.project_start;
      const pE = it.period_end || row.project_end;
      const period = pS || pE ? `${dateSlash(pS)}${pE ? '～' + dateSlash(pE) : ''}` : '';
      const net = it.amount ?? 0;
      return {
        billTo: row.customer_name || '',
        billZip: '',
        billAddr1: addr1,
        billBldg: '',
        contact: row.customer_contact || '',
        honorific: '様',
        no: i + 1,
        itemCode: 'M' + String(10000 * 1000 + i + 1).padStart(11, '0'),
        period,
        productName: it.description,
        note: it.item_notes || '',
        net,
        rate: rateLabel,
        inclusive: inclusive(net),
        paymentDue: dateSlash(row.payment_due_date),
      };
    });

    const buffer = buildExcelWorkbook([
      {
        name: '請求データ',
        columns: [
          { key: 'billTo', header: '請求先名称', width: 24 },
          { key: 'billZip', header: '請求先郵便番号', width: 14 },
          { key: 'billAddr1', header: '請求先住所1', width: 30 },
          { key: 'billBldg', header: '請求先住所(建物名）', width: 20 },
          { key: 'contact', header: '担当者名', width: 14 },
          { key: 'honorific', header: '敬称', width: 6 },
          { key: 'no', header: 'No', width: 6 },
          { key: 'itemCode', header: '明細番号', width: 16 },
          { key: 'period', header: '期間', width: 22 },
          { key: 'productName', header: '商品名', width: 30 },
          { key: 'note', header: '備考', width: 30 },
          { key: 'net', header: '税抜', width: 12 },
          { key: 'rate', header: '消費税率', width: 10 },
          { key: 'inclusive', header: '消費税込', width: 12 },
          { key: 'paymentDue', header: '入金予定日', width: 14 },
        ],
        rows,
      },
    ]);

    // ファイル名は project.gls_number (live) を優先 (PDF と同じ方針)
    let filenameKey = row.billing_key || '';
    if (row.gls_number && filenameKey) {
      const dash = filenameKey.indexOf('-');
      if (dash > 0 && /^GLS\d+$/i.test(filenameKey.slice(0, dash))) {
        filenameKey = row.gls_number + filenameKey.slice(dash);
      }
    }
    excelResponse(res, `請求書_${filenameKey || row.id}.xlsx`, buffer);
  } catch (err) {
    next(err);
  }
});

// 新規売上（明細行対応、episode_id任意）
router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  const { project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle, status: reqStatus, is_advance_payment, invoice_issued } = req.body;
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

  // 月次ユニット等でエピソードに紐づく場合は、そのエピソードコードを請求KEYの基底にする
  // (例: GLS-B001-2607 → GLS-B001-2607-1)。月締め請求で「1月=1請求単位」を成立させる。
  let episodeCode: string | null = null;
  if (episode_id) {
    const ep = await queryOne('SELECT episode_code FROM episodes WHERE id = ? AND deleted_at IS NULL', [episode_id]) as any;
    episodeCode = ep?.episode_code || null;
  }

  let billing_key: string;
  if (revenueStatus === 'estimate') {
    // 概算見積: EST-OPPコード-連番-税枝番
    billing_key = `EST-${seqNum}-${taxSuffix}`;
  } else if (episodeCode) {
    // エピソード (月次ユニット等) 紐づき: {エピソードコード}-税枝番
    billing_key = `${episodeCode}-${taxSuffix}`;
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

  const isAdvancePayment = is_advance_payment ? true : false;
  const invoiceIssued = invoice_issued ? true : false;

  await execute(`INSERT INTO revenues (id, billing_key, project_id, customer_id, episode_id, assigned_to, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, subtitle, status, is_advance_payment, invoice_issued, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, customer_id, episode_id || null, req.user!.id, tax_category || 'tax10', finalAmount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, subtitle || null, revenueStatus, isAdvancePayment, invoiceIssued, req.user!.id]);

  // 明細行を保存
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await execute(
        `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order, period_start, period_end, item_notes, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1, it.period_start || null, it.period_end || null, it.item_notes || null, it.category || null]
      );
    }
  }

  // 売上/概算見積登録時: 案件の想定金額を同期（estimateでも常に最新値で上書き）
  if (finalAmount > 0) {
    await execute(`UPDATE projects SET expected_amount = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [finalAmount, project_id]);
  }

  const row = await queryOne('SELECT * FROM revenues WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// 売上更新（明細行対応）
router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  const { billing_key, project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle, is_advance_payment, invoice_issued } = req.body;

  // 税区分変更時はbilling_keyの末尾税枝番を更新
  let finalBillingKey = existing.billing_key;
  if (tax_category && tax_category !== existing.tax_category) {
    const taxSuffix = tax_category === 'tax8' ? '2' : (tax_category === 'exempt' ? '0' : '1');
    // 末尾の税枝番を置換 (GLS-A004-001-1 → GLS-A004-001-2)
    finalBillingKey = existing.billing_key.replace(/-\d$/, `-${taxSuffix}`);
  }

  // 明細行がある場合は合計を計算
  // items が未送信の場合は既存の revenue_items から再計算して revenues.amount を同期
  let finalAmount: number;
  if (Array.isArray(items) && items.length > 0) {
    finalAmount = items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0);
  } else if (!Array.isArray(items)) {
    const existingItemsData = await queryOne(
      'SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM revenue_items WHERE revenue_id = ?',
      [req.params.id]
    ) as any;
    finalAmount = Number(existingItemsData.cnt) > 0
      ? Number(existingItemsData.total)
      : (amount !== undefined ? amount : existing.amount);
  } else {
    finalAmount = amount !== undefined ? amount : existing.amount;
  }

  const isAdvancePayment = is_advance_payment !== undefined ? (is_advance_payment ? true : false) : existing.is_advance_payment;
  const invoiceIssued = invoice_issued !== undefined ? (invoice_issued ? true : false) : existing.invoice_issued;

  await execute(`UPDATE revenues SET billing_key=?, project_id=?, customer_id=?, episode_id=?, tax_category=?, amount=?, recognition_date=?, billing_date=?, payment_due_date=?, notes=?, subtitle=?, is_advance_payment=?, invoice_issued=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [finalBillingKey || null, project_id || existing.project_id, customer_id || existing.customer_id, episode_id !== undefined ? (episode_id || null) : existing.episode_id, tax_category || existing.tax_category, finalAmount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, subtitle !== undefined ? (subtitle || null) : existing.subtitle, isAdvancePayment, invoiceIssued, req.user!.id, req.params.id]);

  // 明細行を置換
  if (Array.isArray(items)) {
    await execute('DELETE FROM revenue_items WHERE revenue_id = ?', [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await execute(
        `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order, period_start, period_end, item_notes, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), req.params.id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1, it.period_start || null, it.period_end || null, it.item_notes || null, it.category || null]
      );
    }
  }

  // 売上/概算見積更新時: 案件の想定金額を同期（estimateでも常に最新値で上書き）
  const finalProjectId = project_id || existing.project_id;
  if (finalAmount > 0) {
    await execute(`UPDATE projects SET expected_amount = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [finalAmount, finalProjectId]);
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
