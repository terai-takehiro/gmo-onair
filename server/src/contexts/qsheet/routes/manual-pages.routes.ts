/**
 * 運営マニュアルのページ — 追加・編集・削除・並べ替え（段A）＋紙面（blocks）の保存（段B）。
 * production-manual.md §6。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessManual } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import { getManualRaw, addPage, updatePage, deletePage, reorderPages } from '../services/manual.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getManualRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('冊子が見つかりません');
  if (!(await canAccessManual(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('冊子が見つかりません');
  }
}

/**
 * `link.reveal.by`（秘密（配信の鍵・WEB会議のパスコード）を紙に出したユーザー）は
 * §7-2 の安全策の1つ＝あとから誰でも辿れる監査証跡。`manual.service.ts` の `blocks` は
 * 「型はここでは検証しない — クライアントの契約を信じる」設計だが、`reveal.by` だけは
 * この契約の例外にする——ここで強制しないと、devtools でリクエストボディを書き換えて
 * 任意の他ユーザーIDを詐称でき、監査証跡が意味を持たなくなる（レビュー指摘）。
 * ブロックの残りの中身（形・座標・自由ブロックの content 等）は従来どおり検証しない。
 */
function enforceRevealAuthorship(blocks: unknown[], userId: string): unknown[] {
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return block;
    const b = block as Record<string, unknown>;
    if (b.kind !== 'linked' || !b.link || typeof b.link !== 'object') return block;
    const link = b.link as Record<string, unknown>;
    if (!link.reveal || typeof link.reveal !== 'object') return block;
    return { ...b, link: { ...link, reveal: { ...(link.reveal as Record<string, unknown>), by: userId } } };
  });
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
  const row = await updatePage(p1(req.params.id), p1(req.params.pageId), req.user!.id, {
    title: typeof b.title === 'string' ? b.title : undefined,
    ...('chapter' in b ? { chapter: b.chapter as string | null } : {}),
    blocks: Array.isArray(b.blocks) ? enforceRevealAuthorship(b.blocks, req.user!.id) : undefined,
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
