/**
 * 社内取引（SCS⇄GSS）の API — 2026年10月の事業再編・P2 Round 2
 *
 * 「サムライスタジオへ社内発注」の入口。作成・編集・削除は必ずこの経路を通す
 * （`revenues.routes.ts`/`purchases.routes.ts` の通常の PUT/DELETE は
 * リンク済みの行を 409 で止める・`intercompany.service.ts` 冒頭のコメント参照）。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  createIntercompanyPurchase, updateIntercompanyLink, deleteIntercompanyLink,
  getIntercompanyDetail, listIntercompanyByProject, suggestIntercompanyAmount,
} from '../services/intercompany.service';

const router = Router();
router.use(requireAuth, requirePermission('sales', 'editor'));

/** 案件の社内取引の一覧（案件詳細の仕入タブが使う） */
router.get('/', async (req, res) => {
  const projectId = req.query.project_id as string | undefined;
  if (!projectId) throw new AppError(400, 'VALIDATION_ERROR', '案件を指定してください');
  res.json({ success: true, data: await listIntercompanyByProject(projectId) });
});

/** 金額入力欄の初期値の下見（§4.12）。**保存はしない** */
router.get('/suggest-amount', async (req, res) => {
  const projectId = req.query.project_id as string | undefined;
  if (!projectId) throw new AppError(400, 'VALIDATION_ERROR', '案件を指定してください');
  res.json({ success: true, data: await suggestIntercompanyAmount(projectId) });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await getIntercompanyDetail(req.params.id as string) });
});

router.post('/', async (req, res) => {
  const { project_id, episode_id, amount, recognition_date, tax_category, notes } = req.body ?? {};
  if (!project_id || !episode_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と回は必須です');
  const result = await createIntercompanyPurchase({
    projectId: project_id,
    episodeId: episode_id,
    amount: Number(amount),
    recognitionDate: recognition_date || null,
    taxCategory: tax_category || undefined,
    notes: notes || null,
    userId: req.user!.id,
  });
  res.status(201).json({ success: true, data: result });
});

router.put('/:id', async (req, res) => {
  const { amount, recognition_date, episode_id, notes } = req.body ?? {};
  const result = await updateIntercompanyLink(req.params.id as string, {
    amount: amount !== undefined ? Number(amount) : undefined,
    recognitionDate: recognition_date !== undefined ? recognition_date : undefined,
    episodeId: episode_id !== undefined ? episode_id : undefined,
    notes: notes !== undefined ? notes : undefined,
  }, req.user!.id);
  res.json({ success: true, data: result });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await deleteIntercompanyLink(req.params.id as string, req.user!.id);
  res.json({ success: true, message: '削除しました' });
});

export default router;
