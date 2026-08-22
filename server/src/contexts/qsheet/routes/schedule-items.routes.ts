/**
 * スケジュール表の項目 — CRUD ＋ 一括更新（ドラッグ確定）＋ 台本への橋。
 * 実装設計: 04-schedule-impl.md §4-1（B・D）・§4-2・§4-5
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessSchedule } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { getScheduleRaw } from '../services/schedule.service';
import { createItem, updateItem, deleteItem, bulkUpdateItems } from '../services/schedule-item.service';
import { createAndLinkDocument, setDocumentLink } from '../services/schedule-bridge.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  if (!(await canAccessSchedule(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('スケジュール表が見つかりません');
  }
}

router.post('/schedules/:id/items', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  if (typeof b.column_id !== 'string') throw new ValidationError('column_id を指定してください');
  if (typeof b.start_min !== 'number' || typeof b.end_min !== 'number') throw new ValidationError('start_min / end_min を指定してください');
  const row = await createItem(p1(req.params.id), {
    columnId: b.column_id,
    title: typeof b.title === 'string' ? b.title : '',
    kind: typeof b.kind === 'string' ? b.kind : undefined,
    startMin: b.start_min,
    endMin: b.end_min,
    assignee: typeof b.assignee === 'string' ? b.assignee : null,
    note: typeof b.note === 'string' ? b.note : null,
  });
  res.status(201).json({ success: true, data: row });
}));

router.put('/schedules/:id/items/bulk', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const items = (req.body as Record<string, unknown>).items;
  const entries = (Array.isArray(items) ? items : []).map((e: Record<string, unknown>) => ({
    id: String(e.id ?? ''),
    columnId: typeof e.column_id === 'string' ? e.column_id : undefined,
    startMin: typeof e.start_min === 'number' ? e.start_min : undefined,
    endMin: typeof e.end_min === 'number' ? e.end_min : undefined,
    expectedUpdatedAt: e.expected_updated_at,
  }));
  const rows = await bulkUpdateItems(p1(req.params.id), req.user!.id, entries);
  res.json({ success: true, data: { items: rows } });
}));

router.put('/schedules/:id/items/:itemId', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateItem(p1(req.params.id), p1(req.params.itemId), req.user!.id, {
    columnId: typeof b.column_id === 'string' ? b.column_id : undefined,
    title: typeof b.title === 'string' ? b.title : undefined,
    kind: typeof b.kind === 'string' ? b.kind : undefined,
    startMin: typeof b.start_min === 'number' ? b.start_min : undefined,
    endMin: typeof b.end_min === 'number' ? b.end_min : undefined,
    assignee: 'assignee' in b ? (b.assignee as string | null) : undefined,
    note: 'note' in b ? (b.note as string | null) : undefined,
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.delete('/schedules/:id/items/:itemId', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  await deleteItem(p1(req.params.id), p1(req.params.itemId));
  res.json({ success: true, data: { id: p1(req.params.itemId) } });
}));

// ── 台本への橋（§4-5） ──────────────────────────────────────
router.post('/schedules/:id/items/:itemId/qsheet', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const { item, document } = await createAndLinkDocument(p1(req.params.id), p1(req.params.itemId), req.user!.id);
  res.status(201).json({ success: true, data: { item, document } });
}));

router.put('/schedules/:id/items/:itemId/qsheet', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const documentId = (req.body as Record<string, unknown>).qsheet_document_id;
  if (documentId !== null && typeof documentId !== 'string') throw new ValidationError('qsheet_document_id を指定してください');
  const row = await setDocumentLink(p1(req.params.id), p1(req.params.itemId), documentId, req.user!);
  res.json({ success: true, data: row });
}));

export default router;
