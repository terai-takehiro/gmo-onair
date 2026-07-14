import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { financeDocService, inquiryService } from '../services/inbox.service';

// 日常業務アプリ (dailyops) — 見積/請求書 + その他問い合わせ の受信箱 API + アラート集計。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

// ── アラート集計 (案件管理ホーム用: 未処理の見積/請求 + 未対応の問い合わせ 件数) ──
router.get('/alerts', ...canRead, async (_req, res) => {
  const [pendingFinanceDocs, unhandledInquiries] = await Promise.all([
    financeDocService.pendingCount(),
    inquiryService.unhandledCount(),
  ]);
  res.json({ success: true, data: { pendingFinanceDocs, unhandledInquiries } });
});

// ── 見積/請求書 ──────────────────────────────
router.get('/finance-docs', ...canRead, async (req, res) => {
  const rows = await financeDocService.list({
    status: req.query.status ? String(req.query.status) : undefined,
    doc_type: req.query.doc_type ? String(req.query.doc_type) : undefined,
    pendingOnly: req.query.pending === '1' || req.query.pending === 'true',
  });
  res.json({ success: true, data: rows });
});

router.post('/finance-docs', ...canEdit, async (req, res) => {
  const { row, action } = await financeDocService.create({ ...req.body, source: req.body?.source ?? 'manual', created_by: req.user!.id });
  res.status(action === 'created' ? 201 : 200).json({ success: true, data: row, action });
});

router.put('/finance-docs/:id', ...canEdit, async (req, res) => {
  const row = await financeDocService.update(String(req.params.id), { ...req.body, processed_by_user: req.user!.name });
  res.json({ success: true, data: row });
});

router.delete('/finance-docs/:id', ...canEdit, async (req, res) => {
  await financeDocService.remove(String(req.params.id));
  res.json({ success: true, data: { deleted: true } });
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
  const row = await inquiryService.update(String(req.params.id), req.body ?? {});
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
