/**
 * 運営マニュアルのページ — 追加・編集・削除・並べ替え（段A）＋キャンバス（blocks）の保存（段B）。
 * production-manual.md §6。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessManual } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import { getManualRaw, getManualPage, addPage, updatePage, deletePage, reorderPages } from '../services/manual.service';
import { enforceRevealAuthorship } from '../services/manual-reveal-authorship.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getManualRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('マニュアルが見つかりません');
  if (!(await canAccessManual(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('マニュアルが見つかりません');
  }
}

router.post('/manuals/:id/pages', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await addPage(p1(req.params.id), req.user!.id, {
    title: typeof b.title === 'string' ? b.title : undefined,
    chapter: typeof b.chapter === 'string' ? b.chapter : undefined,
  });
  res.status(201).json({ success: true, data: row });
}));

router.put('/manuals/:id/pages/:pageId', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  let blocksPatch: unknown[] | undefined;
  if (Array.isArray(b.blocks)) {
    // enforceRevealAuthorship（manual-reveal-authorship.service.ts）が「reveal の中身が
    // 前回と同じか」を突き合わせるための保存直前の状態（レビュー指摘）
    const existingPage = await getManualPage(p1(req.params.id), p1(req.params.pageId));
    const existingBlocks = Array.isArray(existingPage?.blocks) ? (existingPage.blocks as unknown[]) : [];
    blocksPatch = enforceRevealAuthorship(b.blocks, existingBlocks, req.user!.id);
  }
  const row = await updatePage(p1(req.params.id), p1(req.params.pageId), req.user!.id, {
    title: typeof b.title === 'string' ? b.title : undefined,
    ...('chapter' in b ? { chapter: b.chapter as string | null } : {}),
    blocks: blocksPatch,
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.delete('/manuals/:id/pages/:pageId', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  await deletePage(p1(req.params.id), p1(req.params.pageId), req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.pageId) } });
}));

router.post('/manuals/:id/pages/reorder', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const order = (req.body as Record<string, unknown>).order;
  const rows = await reorderPages(p1(req.params.id), req.user!.id, Array.isArray(order) ? order as { id: string; sort_order: number }[] : []);
  res.json({ success: true, data: rows });
}));

export default router;
