import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { opsReportService } from '../services/ops-report.service';
import { getWeeklyStats } from '../services/weekly-stats.service';

// 日常業務アプリ (dailyops) — レポート API。
// 一覧/詳細は reader、行の追記・確認・確定は editor。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

// 一覧 (メタのみ)
router.get('/reports', ...canRead, async (req, res) => {
  const { kind, status } = req.query;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const { rows, total } = await opsReportService.listReports({
    kind: kind ? String(kind) : undefined,
    status: status ? String(status) : undefined,
    page, limit,
  });
  res.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// kind + period_key で 1 本取得 (日付ナビ用)。無ければ data: null (404 にしない)
router.get('/reports/by-period', ...canRead, async (req, res) => {
  const { kind, period_key } = req.query;
  if (!kind || !period_key) throw new AppError(400, 'kind と period_key は必須です', 'VALIDATION_ERROR');
  const report = await opsReportService.getReportByPeriod(String(kind), String(period_key));
  res.json({ success: true, data: report ?? null });
});

// 週次集計 (ウィークリー活動報告のデータソース)
router.get('/weekly-stats', ...canRead, async (req, res) => {
  const week = req.query.week ? String(req.query.week) : undefined;
  const stats = await getWeeklyStats(week);
  res.json({ success: true, data: stats });
});

// 詳細 (items 込み)
router.get('/reports/:id', ...canRead, async (req, res) => {
  const report = await opsReportService.getReportById(String(req.params.id));
  if (!report) throw new AppError(404, 'レポートが見つかりません', 'NOT_FOUND');
  res.json({ success: true, data: report });
});

// 空レポートの確保 (人が AI より先に記入し始めるケース用)
router.post('/reports/ensure', ...canEdit, async (req, res) => {
  const { kind, period_key } = req.body ?? {};
  if (!kind || !period_key) throw new AppError(400, 'kind と period_key は必須です', 'VALIDATION_ERROR');
  const report = await opsReportService.ensureReport(String(kind), String(period_key), req.user!.id);
  res.json({ success: true, data: { ...report, items: await opsReportService.getReportItems(report.id as string) } });
});

// 行追加 (人間)
router.post('/reports/:id/items', ...canEdit, async (req, res) => {
  const { category, content, note, url, ai_related, pick } = req.body ?? {};
  if (!content || !String(content).trim()) throw new AppError(400, '内容 (content) は必須です', 'VALIDATION_ERROR');
  await opsReportService.addItems(String(req.params.id), [{
    category: category ?? null,
    content: String(content),
    note: note ?? null,
    url: url ?? null,
    ai_related: typeof ai_related === 'boolean' ? ai_related : null,
    pick: pick ?? null,
  }], { source: 'human', recordedBy: req.user!.name });
  const report = await opsReportService.getReportById(String(req.params.id));
  res.status(201).json({ success: true, data: report });
});

/**
 * デイリーニュースの行を**その日が属する週の週報へ写す** (migration 167)。
 *
 * 移すのではなく写す — ニュースはその日の記録として残り続ける。
 * 2回押しても増えない（`already: true` を返すだけ）。
 */
router.post('/items/:itemId/to-weekly', ...canEdit, async (req, res) => {
  const r = await opsReportService.sendItemToWeekly(String(req.params.itemId), req.user!.id);
  res.json({ success: true, data: r });
});

// 行編集
router.put('/items/:itemId', ...canEdit, async (req, res) => {
  const { category, content, note, url, ai_related, pick } = req.body ?? {};
  const item = await opsReportService.updateItem(String(req.params.itemId), {
    ...(category !== undefined ? { category } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(ai_related !== undefined ? { ai_related } : {}),
    ...(pick !== undefined ? { pick } : {}),
  });
  res.json({ success: true, data: item });
});

// 行削除 (論理削除)
router.delete('/items/:itemId', ...canEdit, async (req, res) => {
  await opsReportService.deleteItem(String(req.params.itemId));
  res.json({ success: true, data: { deleted: true } });
});

// 確定 (週報: published + reviewed)
router.post('/reports/:id/publish', ...canEdit, async (req, res) => {
  const report = await opsReportService.publishReport(String(req.params.id), req.user!.id);
  res.json({ success: true, data: report });
});

// 確認のみ (日次ニュースの既読)
router.post('/reports/:id/review', ...canEdit, async (req, res) => {
  const report = await opsReportService.reviewReport(String(req.params.id), req.user!.id);
  res.json({ success: true, data: report });
});

export default router;
