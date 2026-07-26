/**
 * 見積 (デザイン 30章 37a) の HTTP 口
 *
 * **`sales` 権限で開ける**のが要点。見積を作るのは営業で、`budget` (お金) 権限を
 * 持っていないことが普通。既存の売上ルート (`/revenues`) は budget 権限のため、
 * そこに相乗りすると営業が自分の案件の見積を作れない。
 *
 * 返すのはこの案件の見積だけ (他の案件の金額は出さない)。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne, queryAll, execute } from '../../../shared/db/connection';
import { generateEstimatePdf } from '../../../shared/services/pdf.service';
import { isBoxConfigured, uploadToBox, extractFolderId } from '../../../shared/services/box';
import {
  getEstimate, saveEstimate, confirmEstimate, markEstimateSent, draftEstimateWithAi,
} from '../services/estimate.service';

const router = Router();
router.use(requireAuth, requirePermission('sales'));

const actorOf = (req: any) => ({ userId: String(req.user?.id ?? '') });

// GET /projects/:id/estimate — 画面1枚ぶん (見積・明細・合計・似た案件・送付期限)
router.get('/:id/estimate', async (req, res) => {
  res.json({ success: true, data: await getEstimate(String(req.params.id)) });
});

// PUT /projects/:id/estimate — 下書きのまま保存 (想定金額・ステージには触らない)
router.put('/:id/estimate', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await saveEstimate(String(req.params.id), req.body ?? {}, actorOf(req)) });
});

// POST /projects/:id/estimate/ai-draft — AI に明細を下書きさせる (作り直しは差し替え)
router.post('/:id/estimate/ai-draft', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await draftEstimateWithAi(String(req.params.id), actorOf(req)) });
});

// POST /projects/:id/estimate/confirm — この金額で確定する
router.post('/:id/estimate/confirm', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await confirmEstimate(String(req.params.id), actorOf(req)) });
});

// POST /projects/:id/estimate/sent — 送ったと記録する (ONAiR は送らない)
router.post('/:id/estimate/sent', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await markEstimateSent(String(req.params.id), actorOf(req), { note: req.body?.note ?? null }) });
});

/**
 * POST /projects/:id/estimate/pdf — 見積書 PDF を出して BOX に残す
 *
 * PDF はブラウザにも返す (その場で確認したい)。BOX は**社外共有可**フォルダへ。
 * BOX が未設定・フォルダ未作成でも PDF は返す — 保管に失敗したからといって
 * 見積が出せなくなるのは困る。保管できなかったことは応答ヘッダーで伝える。
 */
router.post('/:id/estimate/pdf', requirePermission('sales', 'editor'), async (req, res) => {
  const view = await getEstimate(String(req.params.id));
  if (!view.estimate) throw new AppError(400, 'VALIDATION_ERROR', '見積がまだありません');

  const row = await queryOne(
    `SELECT r.*, p.name AS project_name, p.gls_number, p.code AS project_code,
            p.box_url_external, p.event_start AS project_start, p.event_end AS project_end,
            c.name AS customer_name, c.address AS customer_address, c.contact_name AS customer_contact
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN customers c ON c.id = r.customer_id
     WHERE r.id = ? AND r.deleted_at IS NULL`,
    [view.estimate.id],
  ) as Record<string, any>;

  const items = await queryAll(
    `SELECT description, quantity, unit_price, amount, period_start, period_end, item_notes, category
     FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order`,
    [view.estimate.id],
  ) as Array<Record<string, any>>;

  // 値引きは明細を書き換えず持っているので、PDF では 1 行として最後に出す
  const pdfItems = items.map((it) => ({
    description: String(it.description),
    quantity: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    amount: Number(it.amount) || 0,
    period_start: it.period_start ?? null,
    period_end: it.period_end ?? null,
    item_notes: it.item_notes ?? null,
    category: it.category ?? null,
  }));
  if (view.totals.discount_amount > 0) {
    pdfItems.push({
      description: 'お値引き', quantity: 1, unit_price: -view.totals.discount_amount,
      amount: -view.totals.discount_amount,
      period_start: null, period_end: null, item_notes: null,
      category: items.some((it) => it.category) ? '制作・その他' : null,
    });
  }

  const pdf = await generateEstimatePdf({
    billing_key: row.billing_key,
    subtitle: row.subtitle ?? null,
    customer_name: row.customer_name ?? '',
    customer_address: row.customer_address ?? null,
    customer_contact: row.customer_contact ?? null,
    project_name: row.project_name ?? '',
    gls_number: row.gls_number ?? null,
    tax_category: row.tax_category,
    amount: view.totals.subtotal,
    recognition_date: row.recognition_date ?? null,
    billing_date: row.billing_date ?? null,
    payment_due_date: row.payment_due_date ?? null,
    notes: row.notes ?? null,
    status: 'estimate',
    project_start: row.project_start ?? null,
    project_end: row.project_end ?? null,
    items: pdfItems,
  });

  const base = row.gls_number || row.project_code || String(req.params.id).slice(0, 8);
  const filename = `見積書_${base}_第${view.estimate.version}版.pdf`;

  // BOX へ保管 (社外共有可フォルダ)。失敗しても PDF は返す
  let boxSaved = false;
  const folderId = extractFolderId(row.box_url_external);
  if (isBoxConfigured() && folderId) {
    try {
      const up = await uploadToBox(folderId, filename, pdf);
      await execute(
        `UPDATE revenues SET estimate_pdf_box_file_id = ?, updated_at = NOW() WHERE id = ?`,
        [up.id, view.estimate.id],
      );
      boxSaved = true;
    } catch (e) {
      console.warn('[estimate] BOX 保管に失敗 (PDF は返す):', (e as Error).message);
    }
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('X-Estimate-Box-Saved', boxSaved ? '1' : '0');
  res.setHeader('Content-Length', pdf.length);
  res.send(pdf);
});

export default router;
