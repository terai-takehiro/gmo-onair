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
    // **GLS-A（案件）だけ** (migration 179)。GLS-B はプロジェクト管理の持ち物で、
    // 工程のタスクがここに並ぶと案件のタスクが埋もれる。
    // 「自分のタスク」「期限超過」には今までどおり出る（GLS-B 案件のタスクなので正しい）
    `SELECT id, gls_number, gls_category, name, stage
     FROM projects
     WHERE deleted_at IS NULL AND gls_category = 'A'
       AND stage NOT IN ('r_delivered', 's_completed', 'e_lost')
     ORDER BY gls_number NULLS LAST, name`
  )) as unknown as { id: string; gls_number: string | null; gls_category: string | null; name: string; stage: string }[];

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

  // v2.9.198+: AI 作成判定 (MCP create_task) を mcp_audit_log から逆引き (lateral はパラメータ無しのため $n 採番に影響しない)
  //
  // 期限は COALESCE(due_at, due_date+18:00) を唯一の正として読む（根源整理 §3-4）。
  // due_date はその日付部分（後方互換）。これでマイタスク・依頼・投入口で作られた
  // タスク（due_at のみ）もこの一覧で「期限なし」にならない。
  //
  // visibility='private' の行は担当者か作成者が本人のときだけ返す（§3-4 の漏れ修正）。
  // 以前は sales 権限者全員に private タスクの全文が出ていた
  // （getTeamLoad は件数だけに落としているのに、ここは素通しだった）。
  const tasks = await queryAll(
    `SELECT
       t.id, t.project_id, t.episode_id, t.column_id,
       t.title, t.description, t.task_type, t.production_step,
       t.start_date::text AS start_date,
       COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)::date::text AS due_date,
       COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)::text AS due_at,
       t.assigned_to, u.name AS assigned_to_name,
       t.is_completed, t.completed_at, t.work_state, t.progress, t.is_milestone,
       t.sort_order, t.parent_task_id,
       tc.name AS column_name, tc.color AS column_color,
       t.created_at, t.updated_at,
       p.gls_number AS project_gls_number,
       p.name AS project_name,
       p.stage AS project_stage,
       (ai.audit_id IS NOT NULL) AS is_ai_created,
       ai.requested_by AS ai_requested_by
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN task_columns tc ON tc.id = t.column_id AND tc.deleted_at IS NULL
     LEFT JOIN LATERAL (
       SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
       WHERE m.tool_name = 'create_task' AND m.result_summary->>'created_id' = t.id
       ORDER BY m.created_at ASC LIMIT 1
     ) ai ON TRUE
     WHERE t.project_id = ANY($1::text[])
       AND t.deleted_at IS NULL
       AND t.parent_task_id IS NULL
       AND (t.visibility IS DISTINCT FROM 'private'
            OR t.assigned_to = $2 OR t.created_by = $2)
     ORDER BY p.gls_number NULLS LAST, t.column_id NULLS LAST, t.sort_order, t.created_at`,
    [projectIds, req.user!.id]
  );

  res.json({ success: true, data: { projects, columns, tasks } });
}));

export default router;
