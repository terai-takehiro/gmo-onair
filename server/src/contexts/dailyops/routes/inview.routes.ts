import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { inviewService } from '../services/inview.service';

// 日常業務アプリ (dailyops) — 内覧会 来場予約 API。
// 一覧/回サマリーは reader、登録の作成・編集・来場チェックは editor。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

// 一覧 (?from=&to=&upcoming=1)
router.get('/inview', ...canRead, async (req, res) => {
  const rows = await inviewService.list({
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    upcoming: req.query.upcoming === '1' || req.query.upcoming === 'true',
  });
  res.json({ success: true, data: rows });
});

// 回 (セッション) サマリー
router.get('/inview/sessions', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await inviewService.listSessions() });
});

// 詳細
router.get('/inview/:id', ...canRead, async (req, res) => {
  const row = await inviewService.getById(String(req.params.id));
  if (!row) throw new AppError(404, '来場予約が見つかりません', 'NOT_FOUND');
  res.json({ success: true, data: row });
});

// 登録の作成 (手動)。source は既定 manual (メール取込は MCP 経由で kairos3)
router.post('/inview', ...canEdit, async (req, res) => {
  const { row, action } = await inviewService.create({ ...req.body, source: req.body?.source ?? 'manual', created_by: req.user!.id });
  res.status(action === 'created' ? 201 : 200).json({ success: true, data: row, action });
});

// 登録の編集
router.put('/inview/:id', ...canEdit, async (req, res) => {
  const row = await inviewService.update(String(req.params.id), req.body ?? {});
  res.json({ success: true, data: row });
});

// 来場チェック (body: { checked_in: boolean })
router.post('/inview/:id/check-in', ...canEdit, async (req, res) => {
  const checkedIn = req.body?.checked_in !== false; // 既定 true
  const row = await inviewService.setCheckIn(String(req.params.id), checkedIn, req.user!.name);
  res.json({ success: true, data: row });
});

// 登録の削除 (論理削除)
router.delete('/inview/:id', ...canEdit, async (req, res) => {
  await inviewService.remove(String(req.params.id));
  res.json({ success: true, data: { deleted: true } });
});

export default router;
