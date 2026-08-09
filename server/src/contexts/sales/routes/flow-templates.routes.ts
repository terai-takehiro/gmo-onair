/**
 * 標準工程テンプレート（案件）の API — v4 案件管理 ⑦
 *
 * 読むのは `sales` の reader（案件をつくる人が下見を見る）。
 * 型を直せるのは `sales` の manager だけ — 型を変えると**以後すべての案件**に
 * 効くので、案件を1件直すのと同じ権限では緩すぎます。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  listTemplates, templatesFor, preview, apply, duplicate, datesOf,
  updateTemplate, updateTask, addTask, removeTask, removeTemplate,
} from '../services/flow-template.service';
import { classificationKey, classificationOf } from '../services/project-classification';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
const p1 = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v ?? '');

const router = Router();
router.use(requireAuth, requirePermission('sales'));
const canEdit = requirePermission('sales', 'manager');
const userOf = (req: Request) => req.user!.id;

/**
 * 型の一覧。`classification`（`客入れ:分類`）で絞れる。
 *
 * **旧 `project_type` でも受けます。** migration 181 より前から動いている
 * 呼び出し（旧い画面・MCP）を 400 で止めると、工程を入れる導線が黙って消えます。
 * 受けたら2段に読み替えてから当てるので、返るものは同じです。
 */
router.get('/', wrap(async (req, res) => {
  const asked = req.query.classification ? String(req.query.classification) : null;
  const legacy = req.query.project_type ? String(req.query.project_type) : null;
  const back = legacy ? classificationOf(legacy) : null;
  const key = asked ?? (back ? classificationKey(back.audience, back.project_category) : null);
  res.json({ success: true, data: key ? await templatesFor(key) : await listTemplates() });
}));

/**
 * 案件に入れる前の下見。**保存しない**
 *
 * `project_id` を渡すと**サーバーが日付を読む**。画面から日付を送らせると、
 * 下見に出た期限と実際に入る期限が食い違う（見たときは 9/21 だったのに
 * 9/20 で入る）。日付を直接渡せるのは案件がまだ無いとき用。
 */
router.post('/:id/preview', wrap(async (req, res) => {
  const { project_id, intake_date, event_date } = req.body ?? {};
  const d = project_id
    ? await datesOf(String(project_id))
    : { intake: intake_date || null, event: event_date || null };
  res.json({ success: true, data: await preview(p1(req.params.id), d.intake, d.event) });
}));

/** 選んだ工程を案件に入れる。**書き込みなので editor 以上** */
router.post('/:id/apply', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { project_id, task_ids } = req.body ?? {};
  if (!project_id) throw new AppError(400, 'VALIDATION_ERROR', '案件を指定してください');
  const ids = Array.isArray(task_ids) ? task_ids.map(String) : [];
  res.json({ success: true, data: await apply(String(project_id), p1(req.params.id), ids, userOf(req)) });
}));

router.post('/:id/duplicate', canEdit, wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '新しい型の名前を入れてください');
  res.status(201).json({ success: true, data: { id: await duplicate(p1(req.params.id), name) } });
}));

router.put('/:id', canEdit, wrap(async (req, res) => {
  await updateTemplate(p1(req.params.id), req.body ?? {});
  res.json({ success: true });
}));

router.delete('/:id', canEdit, wrap(async (req, res) => {
  await removeTemplate(p1(req.params.id));
  res.json({ success: true, message: '工程の型を消しました' });
}));

router.post('/phases/:phaseId/tasks', canEdit, wrap(async (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title) throw new AppError(400, 'VALIDATION_ERROR', '工程の名前を入れてください');
  res.status(201).json({ success: true, data: { id: await addTask(p1(req.params.phaseId), title) } });
}));

router.put('/tasks/:taskId', canEdit, wrap(async (req, res) => {
  await updateTask(p1(req.params.taskId), req.body ?? {});
  res.json({ success: true });
}));

router.delete('/tasks/:taskId', canEdit, wrap(async (req, res) => {
  await removeTask(p1(req.params.taskId));
  res.json({ success: true });
}));

export default router;
