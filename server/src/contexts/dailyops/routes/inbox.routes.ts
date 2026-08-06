import { Router } from 'express';
import { requireAuth, requirePermission, requireAnyPermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { financeDocService, inquiryService } from '../services/inbox.service';
import { handoffDoc, undoHandoff, type HandoffKind } from '../../finance/services/doc-handoff.service';

// 日常業務アプリ (dailyops) — 見積/請求書 + その他問い合わせ の受信箱 API + アラート集計。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

/**
 * 受け取った書類は**経理も見る**。
 *
 * 中身は 請求書・見積書・注文書 ＋ 金額・締月・支払期日・GLS番号 で、
 * 完全に経理の仕事の道具なのに `dailyops` だけを要求していました。
 * その結果、**請求書が届いているのに支払う側の経理が開けません**でした
 * (実測: budget editor の利用者が 403)。
 *
 * v4 で画面を財務へ移したので、`dailyops` か `budget` のどちらかで通します。
 * **いま見られる人は見られたまま**、経理が見られるようになります。
 */
const docsRead = [requireAuth, requireAnyPermission(['dailyops', 'budget'], 'reader')] as const;
const docsEdit = [requireAuth, requireAnyPermission(['dailyops', 'budget'], 'editor')] as const;

// ── アラート集計 (案件管理ホーム用: 未処理の見積/請求 + 未対応の問い合わせ 件数) ──
router.get('/alerts', ...canRead, async (_req, res) => {
  const [pendingFinanceDocs, unhandledInquiries] = await Promise.all([
    financeDocService.pendingCount(),
    inquiryService.unhandledCount(),
  ]);
  res.json({ success: true, data: { pendingFinanceDocs, unhandledInquiries } });
});

// ── 見積/請求書 ──────────────────────────────
router.get('/finance-docs', ...docsRead, async (req, res) => {
  const rows = await financeDocService.list({
    status: req.query.status ? String(req.query.status) : undefined,
    doc_type: req.query.doc_type ? String(req.query.doc_type) : undefined,
    pendingOnly: req.query.pending === '1' || req.query.pending === 'true',
  });
  res.json({ success: true, data: rows });
});

router.post('/finance-docs', ...docsEdit, async (req, res) => {
  const { row, action } = await financeDocService.create({ ...req.body, source: req.body?.source ?? 'manual', created_by: req.user!.id });
  res.status(action === 'created' ? 201 : 200).json({ success: true, data: row, action });
});

router.put('/finance-docs/:id', ...docsEdit, async (req, res) => {
  // `created_by` は**誰が直したか**として AI の修正差分に残る（会社方針・条件2）
  const row = await financeDocService.update(String(req.params.id), {
    ...req.body, processed_by_user: req.user!.name, created_by: req.user!.id,
  });
  res.json({ success: true, data: row });
});

router.delete('/finance-docs/:id', ...docsEdit, async (req, res) => {
  await financeDocService.remove(String(req.params.id));
  res.json({ success: true, data: { deleted: true } });
});

/**
 * 受け取った書類を台帳（仕入 / 販管費）へ渡す。
 *
 * **これが「処理完了」の中身です。** 以前は状態が変わるだけで台帳に何も作られず、
 * 同じ請求書を2回入力していました（届いた記録 ＋ 台帳の記録）。
 */
router.post('/finance-docs/:id/handoff', ...docsEdit, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const kind = b.kind === 'sga' ? 'sga' : b.kind === 'purchase' ? 'purchase' : null;
  if (!kind) throw new AppError(400, 'VALIDATION_ERROR', '仕入か販管費かを指定してください');

  const result = await handoffDoc(String(req.params.id), {
    kind: kind as HandoffKind,
    amount: Number(b.amount),
    tax_category: typeof b.tax_category === 'string' ? b.tax_category : undefined,
    recognition_date: String(b.recognition_date ?? ''),
    payment_due_date: typeof b.payment_due_date === 'string' ? b.payment_due_date : null,
    description: typeof b.description === 'string' ? b.description : null,
    project_id: typeof b.project_id === 'string' ? b.project_id : null,
    vendor_id: typeof b.vendor_id === 'string' ? b.vendor_id : null,
    vendor_name: typeof b.vendor_name === 'string' ? b.vendor_name : null,
    expense_type: typeof b.expense_type === 'string' ? b.expense_type : null,
  }, req.user!.id);

  res.status(201).json({ success: true, data: result });
});

/** 渡したのを取り消す。**台帳の行は消さない**（経理が直しているかもしれない） */
router.post('/finance-docs/:id/handoff/undo', ...docsEdit, async (req, res) => {
  res.json({ success: true, data: await undoHandoff(String(req.params.id), req.user!.id) });
});

// ── その他問い合わせ ──────────────────────────────
router.get('/inquiries', ...canRead, async (req, res) => {
  const rows = await inquiryService.list({
    importance: req.query.importance ? String(req.query.importance) : undefined,
    unhandledOnly: req.query.unhandled === '1' || req.query.unhandled === 'true',
  });
  res.json({ success: true, data: rows });
});

router.post('/inquiries', ...canEdit, async (req, res) => {
  if (!req.body?.summary) throw new AppError(400, '要約 (summary) は必須です', 'VALIDATION_ERROR');
  const { row, action } = await inquiryService.create({ ...req.body, source: req.body?.source ?? 'manual', created_by: req.user!.id });
  res.status(action === 'created' ? 201 : 200).json({ success: true, data: row, action });
});

router.put('/inquiries/:id', ...canEdit, async (req, res) => {
  const row = await inquiryService.update(String(req.params.id), { ...(req.body ?? {}), created_by: req.user!.id });
  res.json({ success: true, data: row });
});

router.post('/inquiries/:id/handle', ...canEdit, async (req, res) => {
  const handled = req.body?.handled !== false; // 既定 true
  const row = await inquiryService.setHandled(String(req.params.id), handled, req.user!.name);
  res.json({ success: true, data: row });
});

router.delete('/inquiries/:id', ...canEdit, async (req, res) => {
  await inquiryService.remove(String(req.params.id));
  res.json({ success: true, data: { deleted: true } });
});

export default router;
