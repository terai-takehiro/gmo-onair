import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { projectTasksService } from '../../tasks/services/project-tasks.service';
import { queryAll } from '../../../shared/db/connection';
import { config } from '../../../config';
import { ok, runTool, clampLimit, audit, REQUESTED_BY } from '../helpers';

// 案件タスク (project_tasks) の MCP ツール — projectTasksService を再利用。

const TASK_TYPES = ['free', 'checklist', 'production_step', 'sales'] as const;

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    'list_tasks',
    {
      title: 'タスク一覧',
      description:
        'タスクを一覧する。project_id を指定するとその案件のタスク (子タスク込み)、' +
        '未指定なら進行中案件を横断した一覧 (完了/失注案件は除外)。既定では未完了のみ。',
      inputSchema: {
        project_id: z.string().optional(),
        assigned_to: z.string().optional().describe('担当者の users.id で絞り込み'),
        include_completed: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async (args) => runTool(async () => {
      if (args.project_id) {
        let tasks = await projectTasksService.list(args.project_id);
        if (!args.include_completed) tasks = tasks.filter((t) => !t.is_completed);
        if (args.assigned_to) tasks = tasks.filter((t) => t.assigned_to === args.assigned_to);
        return ok(tasks.slice(0, clampLimit(args.limit, 50)));
      }

      // 横断一覧 (task-dashboard と同様: 完了/失注案件は除外)
      let where = `WHERE t.deleted_at IS NULL AND t.parent_task_id IS NULL
                   AND p.deleted_at IS NULL AND p.stage NOT IN ('s_completed', 'e_lost')`;
      const params: unknown[] = [];
      if (!args.include_completed) where += ' AND t.is_completed = FALSE';
      if (args.assigned_to) { where += ' AND t.assigned_to = ?'; params.push(args.assigned_to); }
      const rows = await queryAll(
        `SELECT t.id, t.project_id, p.name AS project_name, p.gls_number, t.title, t.description,
                t.task_type, t.start_date::text AS start_date, t.due_date::text AS due_date,
                t.assigned_to, u.name AS assigned_to_name, t.is_completed, tc.name AS column_name
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assigned_to
         LEFT JOIN task_columns tc ON tc.id = t.column_id AND tc.deleted_at IS NULL
         ${where}
         ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
         LIMIT ?`,
        [...params, clampLimit(args.limit, 50)],
      );
      return ok(rows);
    }),
  );

  server.registerTool(
    'create_task',
    {
      title: 'タスク作成',
      description:
        '案件にタスクを追加する。task_type: free=フリー (既定), checklist=チェックリスト, production_step=制作工程, sales=営業。' +
        'assigned_to は users.id (list_users で解決)。かんばん列に置く場合は column_id を指定 (未指定なら列なし)。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        title: z.string().min(1),
        description: z.string().optional(),
        task_type: z.enum(TASK_TYPES).default('free'),
        column_id: z.string().optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('期限日'),
        assigned_to: z.string().optional().describe('担当者の users.id'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const task = await projectTasksService.create(
        args.project_id,
        {
          title: args.title,
          description: args.description ?? null,
          task_type: args.task_type,
          column_id: args.column_id ?? null,
          start_date: args.start_date ?? null,
          due_date: args.due_date ?? null,
          assigned_to: args.assigned_to ?? null,
        },
        config.mcpActorId,
      );
      audit('create_task', args, { created_id: task.id, title: args.title, project_id: args.project_id }, args.requested_by);
      return ok({ created: true, task });
    }),
  );

  server.registerTool(
    'update_task',
    {
      title: 'タスク更新',
      description:
        'タスクを部分更新する (渡したフィールドだけ変更)。completed: true/false で完了状態も切り替えられる。',
      inputSchema: {
        id: z.string().min(1).describe('タスク ID'),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        column_id: z.string().nullable().optional(),
        start_date: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        assigned_to: z.string().nullable().optional().describe('users.id / null で担当解除'),
        completed: z.boolean().optional().describe('完了状態の変更'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const data: Record<string, unknown> = {};
      for (const f of ['title', 'description', 'column_id', 'start_date', 'due_date', 'assigned_to'] as const) {
        const argVal = (args as Record<string, unknown>)[f];
        if (argVal !== undefined) data[f] = argVal;
      }
      let task = Object.keys(data).length > 0
        ? await projectTasksService.update(args.id, data, config.mcpActorId)
        : await projectTasksService.getById(args.id);
      if (!task) return ok({ updated: false, error: 'タスクが見つかりません' });

      // completed 指定があり現状と異なる場合のみ toggle (service はトグル式のため)
      if (args.completed !== undefined && Boolean(task.is_completed) !== args.completed) {
        task = await projectTasksService.toggleComplete(args.id, config.mcpActorId);
      }
      const changedFields = Object.keys(args).filter((k) => !['id', 'requested_by'].includes(k));
      audit('update_task', args, { updated_id: args.id, changed_fields: changedFields }, args.requested_by);
      return ok({ updated: true, changed_fields: changedFields, task });
    }),
  );
}
