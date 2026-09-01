import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { taskTemplatesService } from '../services/task-templates.service';
import { taskColumnsService } from '../services/task-columns.service';
import { AppError } from '../../../shared/middleware/errorHandler';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

router.get('/', wrap(async (_req, res) => {
  const templates = await taskTemplatesService.list();
  res.json({ success: true, data: templates });
}));

// POST /task-templates/:id/apply-to-episode
//
// レギュラー番組の回（エピソード）に標準工程を当てる（regular-series.md §10-8）。
// 案件向け「標準工程テンプレート」（`flow-templates`・`ApplyFlowDialog.tsx`）とは
// 別物 — こちらは既存のかんばん列の雛形（`task_column_templates`）をそのまま使い、
// 列ごとに1件ずつ回のタスクを作る（`taskColumnsService.applyToEpisode`）。
router.post('/:id/apply-to-episode', requirePermission('sales'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const { project_id, episode_id } = req.body as { project_id?: string; episode_id?: string };
  if (!project_id || !episode_id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'project_id と episode_id が必要です');
  }
  const userId = (req as { user?: { id: string } }).user!.id;
  const created = await taskColumnsService.applyToEpisode(project_id, episode_id, id, userId);
  res.status(201).json({ success: true, data: created });
}));

export default router;
