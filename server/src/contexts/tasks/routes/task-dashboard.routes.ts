import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { queryAll } from '../../../shared/db/connection';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth, requirePermission('sales'));

// GET /task-dashboard
// 完了・失注を除く全案件のカラム + タスクを返す
router.get('/', wrap(async (req, res) => {
  const projects = (await queryAll(
    `SELECT id, gls_number, name, stage
     FROM projects
     WHERE deleted_at IS NULL
       AND stage NOT IN ('s_completed', 'e_lost')
     ORDER BY gls_number NULLS LAST, name`
  )) as unknown as { id: string; gls_number: string | null; name: string; stage: string }[];

  if (projects.length === 0) {
    res.json({ success: true, data: { projects: [], columns: [], tasks: [] } });
    return;
  }

  const projectIds = projects.map((p) => p.id);

  const columns = (await queryAll(
    `SELECT id, project_id, name, color, sort_order
     FROM task_columns
     WHERE project_id = ANY($1::text[])
       AND deleted_at IS NULL
     ORDER BY project_id, sort_order, created_at`,
    [projectIds]
  )) as unknown as { id: string; project_id: string; name: string; color: string | null; sort_order: number }[];

  const tasks = await queryAll(
    `SELECT
       t.id, t.project_id, t.episode_id, t.column_id,
       t.title, t.description, t.task_type, t.production_step,
       t.start_date::text AS start_date, t.due_date::text AS due_date,
       t.assigned_to, u.name AS assigned_to_name,
       t.is_completed, t.completed_at, t.sort_order, t.parent_task_id,
       tc.name AS column_name, tc.color AS column_color,
       t.created_at, t.updated_at,
       p.gls_number AS project_gls_number,
       p.name AS project_name,
       p.stage AS project_stage
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN task_columns tc ON tc.id = t.column_id AND tc.deleted_at IS NULL
     WHERE t.project_id = ANY($1::text[])
       AND t.deleted_at IS NULL
       AND t.parent_task_id IS NULL
     ORDER BY p.gls_number NULLS LAST, t.column_id NULLS LAST, t.sort_order, t.created_at`,
    [projectIds]
  );

  res.json({ success: true, data: { projects, columns, tasks } });
}));

export default router;
