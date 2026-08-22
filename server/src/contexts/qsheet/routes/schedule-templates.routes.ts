/**
 * ひな形（一覧・下見・適用・編集）。実装設計: 04-schedule-impl.md §4-1（C）・§4-4・§11-1
 *
 * ⚠️ 編集系（POST/PUT/DELETE）は `system_admin` に絞ってある。§11-1 の確認9が
 * 決まるまでの既定（拠点・部屋のマスターと同じ扱い）。適用側は確定で editor。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessSchedule } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { getScheduleRaw } from '../services/schedule.service';
import {
  listTemplates, getTemplate, createTemplate, duplicateTemplate, updateTemplate, removeTemplate,
  addTemplateColumn, removeTemplateColumn, addTemplateItem, updateTemplateItem, removeTemplateItem,
} from '../services/schedule-template.service';
import { previewTemplate, applyTemplate } from '../services/schedule-template-apply.service';

/**
 * ひな形の編集を **`system_admin` だけ**に絞る（§11-1 の確認9・(a)）。
 * `requirePermission('qsheet','manager')` だと `qsheet` の manager/owner も通ってしまい、
 * 「フルアクセス」型が全区画を manager にしている現状ではほぼ無制限になる
 * （`210_simplify_permission_modules.sql`）。ここは意図して `role` だけを見る。
 */
function requireSystemAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '認証が必要です' } });
    return;
  }
  if (req.user.role === 'system_admin') { next(); return; }
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'ひな形を編集できるのは管理者だけです' } });
}

const templatesRouter = Router();
templatesRouter.use(requireAuth, requirePermission('qsheet'));
const requireAdmin = requireSystemAdmin;

templatesRouter.get('/schedule-templates', wrap(async (req: Request, res: Response) => {
  const locationId = typeof req.query.location_id === 'string' ? req.query.location_id : null;
  res.json({ success: true, data: await listTemplates(locationId) });
}));

templatesRouter.post('/schedule-templates', requireAdmin, wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const id = await createTemplate(String(b.name ?? ''), typeof b.description === 'string' ? b.description : null, typeof b.location_id === 'string' ? b.location_id : null);
  res.status(201).json({ success: true, data: { id } });
}));

templatesRouter.post('/schedule-templates/:tplId/duplicate', requireAdmin, wrap(async (req: Request, res: Response) => {
  const name = String((req.body as Record<string, unknown>).name ?? '');
  const id = await duplicateTemplate(p1(req.params.tplId), name);
  res.status(201).json({ success: true, data: { id } });
}));

templatesRouter.post('/schedule-templates/:tplId/preview', wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  if (typeof b.schedule_id !== 'string') throw new ValidationError('schedule_id を指定してください');
  const onairStartMin = typeof b.onair_start_min === 'number' ? b.onair_start_min : null;
  res.json({ success: true, data: await previewTemplate(p1(req.params.tplId), b.schedule_id, onairStartMin) });
}));

templatesRouter.put('/schedule-templates/:tplId', requireAdmin, wrap(async (req: Request, res: Response) => {
  await updateTemplate(p1(req.params.tplId), req.body ?? {});
  res.json({ success: true });
}));

templatesRouter.delete('/schedule-templates/:tplId', requireAdmin, wrap(async (req: Request, res: Response) => {
  await removeTemplate(p1(req.params.tplId));
  res.json({ success: true });
}));

templatesRouter.get('/schedule-templates/:tplId', wrap(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getTemplate(p1(req.params.tplId)) });
}));

templatesRouter.post('/schedule-templates/:tplId/columns', requireAdmin, wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const id = await addTemplateColumn(p1(req.params.tplId), {
    col_group: String(b.col_group ?? ''),
    label: String(b.label ?? ''),
    room_id: typeof b.room_id === 'string' ? b.room_id : null,
    color: typeof b.color === 'string' ? b.color : null,
  });
  res.status(201).json({ success: true, data: { id } });
}));

templatesRouter.delete('/schedule-templates/columns/:columnId', requireAdmin, wrap(async (req: Request, res: Response) => {
  await removeTemplateColumn(p1(req.params.columnId));
  res.json({ success: true });
}));

templatesRouter.post('/schedule-templates/:tplId/items', requireAdmin, wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  if (typeof b.column_id !== 'string') throw new ValidationError('column_id を指定してください');
  const id = await addTemplateItem(p1(req.params.tplId), {
    column_id: b.column_id,
    title: String(b.title ?? ''),
    kind: typeof b.kind === 'string' ? b.kind : undefined,
    anchor: typeof b.anchor === 'string' ? b.anchor : undefined,
    offset_min: typeof b.offset_min === 'number' ? b.offset_min : undefined,
    duration_min: typeof b.duration_min === 'number' ? b.duration_min : undefined,
    is_required: typeof b.is_required === 'boolean' ? b.is_required : undefined,
  });
  res.status(201).json({ success: true, data: { id } });
}));

templatesRouter.put('/schedule-templates/items/:itemId', requireAdmin, wrap(async (req: Request, res: Response) => {
  await updateTemplateItem(p1(req.params.itemId), req.body ?? {});
  res.json({ success: true });
}));

templatesRouter.delete('/schedule-templates/items/:itemId', requireAdmin, wrap(async (req: Request, res: Response) => {
  await removeTemplateItem(p1(req.params.itemId));
  res.json({ success: true });
}));

// ── 適用（スケジュール表側の router に相乗り。行権限が必要なため） ──────
const applyRouter = Router();
applyRouter.use(requireAuth, requirePermission('qsheet'));

applyRouter.post('/schedules/:id/apply-template', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  if (!(await canAccessSchedule(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('スケジュール表が見つかりません');
  }
  const b = req.body as Record<string, unknown>;
  if (typeof b.template_id !== 'string') throw new ValidationError('template_id を指定してください');
  const columnIds = Array.isArray(b.column_ids) ? (b.column_ids as unknown[]).map(String) : [];
  const itemIds = Array.isArray(b.item_ids) ? (b.item_ids as unknown[]).map(String) : [];
  const onairStartMin = typeof b.onair_start_min === 'number' ? b.onair_start_min : null;
  const result = await applyTemplate(p1(req.params.id), b.template_id, columnIds, itemIds, onairStartMin);
  res.json({ success: true, data: result });
}));

export { templatesRouter, applyRouter };
