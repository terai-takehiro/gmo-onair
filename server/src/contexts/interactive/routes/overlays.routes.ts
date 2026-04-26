/**
 * interactive/routes/overlays.routes.ts — Phase 3 v2.6.9
 * SQL は services/overlay.service.ts に集約。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { overlayService } from '../services/overlay.service';

const router = Router();
router.use(requireAuth, requirePermission('interactive'));

// テンプレート一覧
router.get('/', async (_req, res) => {
  res.json({ success: true, data: await overlayService.list() });
});

// テンプレート作成
router.post('/', requirePermission('interactive', 'editor'), async (req, res) => {
  const row = await overlayService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, data: row });
});

// テンプレート更新
router.put('/:id', requirePermission('interactive', 'editor'), async (req, res) => {
  const row = await overlayService.update(req.params.id as string, req.body);
  res.json({ success: true, data: row });
});

// テンプレート削除
router.delete('/:id', requirePermission('interactive', 'editor'), async (req, res) => {
  await overlayService.delete(req.params.id as string);
  res.json({ success: true, message: '削除しました' });
});

export default router;
