import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { projectTasksService } from '../../tasks/services/project-tasks.service';
import { taskColumnsService } from '../../tasks/services/task-columns.service';
import { taskTemplatesService } from '../../tasks/services/task-templates.service';
import { queryAll } from '../../../shared/db/connection';
import { ok, runTool, clampLimit, audit, REQUESTED_BY, currentActorId } from '../helpers';

// 案件タスク (project_tasks) + かんばん列 (task_columns) の MCP ツール —
// projectTasksService / taskColumnsService / taskTemplatesService を再利用。
// GLS-B (プロジェクト管理) のタスクも同じ表なので、これらのツールで細かい編集
// (start_date / progress / is_milestone / work_state / 依存関係) ができる。

const TASK_TYPES = ['free', 'checklist', 'production_step', 'sales'] as const;
const WORK_STATES = ['todo', 'doing', 'waiting'] as const;
const PRODUCTION_STEPS = ['script', 'materials', 'recording'] as const;

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
        'assigned_to は users.id (list_users で解決)。かんばん列に置く場合は column_id を指定 ' +
        '(list_task_columns で解決・未指定なら列なし)。' +
        'parent_task_id を渡すと子タスク (チェックリスト項目) として親にぶら下がる。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        title: z.string().min(1),
        description: z.string().optional(),
        task_type: z.enum(TASK_TYPES).default('free'),
        production_step: z.enum(PRODUCTION_STEPS).optional()
          .describe('制作工程の種類 (task_type=production_step のとき): script=台本 / materials=素材 / recording=収録'),
        column_id: z.string().optional(),
        episode_id: z.string().optional().describe('回 (エピソード) ID。連続案件で回に紐づける場合'),
        parent_task_id: z.string().optional().describe('親タスク ID (子タスク=チェックリスト項目を作る場合)'),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('開始日 (ガントのバーの左端)'),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('期限日'),
        assigned_to: z.string().optional().describe('担当者の users.id'),
        progress: z.number().int().min(0).max(100).optional().describe('進捗% (0-100)'),
        is_milestone: z.boolean().optional().describe('マイルストーンか (◆・単一日)'),
        work_state: z.enum(WORK_STATES).optional()
          .describe('止まり方: todo=未着手 (既定) / doing=進行中 / waiting=相手待ち'),
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
          production_step: args.production_step ?? null,
          column_id: args.column_id ?? null,
          episode_id: args.episode_id ?? null,
          parent_task_id: args.parent_task_id ?? null,
          start_date: args.start_date ?? null,
          due_date: args.due_date ?? null,
          assigned_to: args.assigned_to ?? null,
          progress: args.progress,
          is_milestone: args.is_milestone,
          work_state: args.work_state,
        },
        currentActorId(),
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
        'タスクを部分更新する (渡したフィールドだけ変更)。completed: true/false で完了状態も切り替えられる。' +
        'GLS-B (プロジェクト管理) のタスクにも使える — ガント用の start_date / progress / ' +
        'is_milestone / work_state はこのツールで直す。',
      inputSchema: {
        id: z.string().min(1).describe('タスク ID'),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        task_type: z.enum(TASK_TYPES).optional(),
        production_step: z.enum(PRODUCTION_STEPS).nullable().optional()
          .describe('制作工程の種類 script/materials/recording (null で解除)'),
        column_id: z.string().nullable().optional(),
        episode_id: z.string().nullable().optional().describe('回 (エピソード) ID / null で回から外す'),
        start_date: z.string().nullable().optional().describe('開始日 (ガントのバーの左端) / null で解除'),
        due_date: z.string().nullable().optional(),
        assigned_to: z.string().nullable().optional().describe('users.id / null で担当解除'),
        progress: z.number().int().min(0).max(100).optional().describe('進捗% (0-100)'),
        is_milestone: z.boolean().optional().describe('マイルストーンか (◆)'),
        work_state: z.enum(WORK_STATES).optional()
          .describe('止まり方: todo=未着手 / doing=進行中 / waiting=相手待ち (完了は completed で)'),
        completed: z.boolean().optional().describe('完了状態の変更'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const data: Record<string, unknown> = {};
      for (const f of ['title', 'description', 'task_type', 'production_step', 'column_id', 'episode_id',
        'start_date', 'due_date', 'assigned_to', 'progress', 'is_milestone', 'work_state'] as const) {
        const argVal = (args as Record<string, unknown>)[f];
        if (argVal !== undefined) data[f] = argVal;
      }
      let task = Object.keys(data).length > 0
        ? await projectTasksService.update(args.id, data, currentActorId())
        : await projectTasksService.getById(args.id);
      if (!task) return ok({ updated: false, error: 'タスクが見つかりません' });

      // completed 指定があり現状と異なる場合のみ toggle (service はトグル式のため)
      if (args.completed !== undefined && Boolean(task.is_completed) !== args.completed) {
        task = await projectTasksService.toggleComplete(args.id, currentActorId());
      }
      const changedFields = Object.keys(args).filter((k) => !['id', 'requested_by'].includes(k));
      audit('update_task', args, { updated_id: args.id, changed_fields: changedFields }, args.requested_by);
      return ok({ updated: true, changed_fields: changedFields, task });
    }),
  );

  server.registerTool(
    'move_task',
    {
      title: 'タスク移動 (かんばん列 / 並び)',
      description:
        'タスクを別のかんばん列へ移動、または列内の並び順を変更する。column_id=null で列なしに。sort_order は列内の位置 (小さいほど上)。',
      inputSchema: {
        id: z.string().min(1).describe('タスク ID'),
        column_id: z.string().nullable().describe('移動先のかんばん列 ID (null で列なし)'),
        sort_order: z.number().int().describe('列内の並び順 (小さいほど上)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await projectTasksService.move(args.id, args.column_id, args.sort_order, currentActorId());
      audit('move_task', args, { moved_id: args.id, column_id: args.column_id, sort_order: args.sort_order }, args.requested_by);
      return ok({ moved: true, task: await projectTasksService.getById(args.id) });
    }),
  );

  server.registerTool(
    'reorder_tasks',
    {
      title: 'タスク並び替え (一括)',
      description: '同一案件内の複数タスクの並び順 (sort_order) を一括更新する。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        items: z.array(z.object({
          id: z.string().min(1),
          sort_order: z.number().int(),
        })).min(1).describe('{id, sort_order} の配列'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await projectTasksService.reorder(args.project_id, args.items, currentActorId());
      audit('reorder_tasks', args, { project_id: args.project_id, count: args.items.length }, args.requested_by);
      return ok({ reordered: true, count: args.items.length });
    }),
  );

  server.registerTool(
    'delete_task',
    {
      title: 'タスク削除',
      description: 'タスクを削除する (soft delete。子タスク=チェックリストも一緒に削除)。',
      inputSchema: {
        id: z.string().min(1).describe('タスク ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await projectTasksService.delete(args.id, currentActorId());
      audit('delete_task', args, { deleted_id: args.id }, args.requested_by);
      return ok({ deleted: true, id: args.id });
    }),
  );

  server.registerTool(
    'bulk_create_tasks',
    {
      title: 'タスク一括作成 (スケジュール投入)',
      description:
        '案件に複数タスクをまとめて作成する。制作/プロジェクトのスケジュール雛形を一気に投入する用途。' +
        '各タスクに start_date / due_date (ガント日程)、assigned_to (users.id・list_users で解決)、column_id を任意で指定可。' +
        '配列の順序どおりに sort_order が付く。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        tasks: z.array(z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          task_type: z.enum(TASK_TYPES).optional(),
          production_step: z.enum(PRODUCTION_STEPS).optional(),
          column_id: z.string().optional(),
          episode_id: z.string().optional(),
          start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          assigned_to: z.string().optional(),
          progress: z.number().int().min(0).max(100).optional(),
          is_milestone: z.boolean().optional(),
          work_state: z.enum(WORK_STATES).optional(),
        })).min(1).max(100).describe('作成するタスクの配列 (最大100件)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const created: Array<{ id: string; title: string }> = [];
      for (const t of args.tasks) {
        const task = await projectTasksService.create(
          args.project_id,
          {
            title: t.title,
            description: t.description ?? null,
            task_type: t.task_type ?? 'free',
            production_step: t.production_step ?? null,
            column_id: t.column_id ?? null,
            episode_id: t.episode_id ?? null,
            start_date: t.start_date ?? null,
            due_date: t.due_date ?? null,
            assigned_to: t.assigned_to ?? null,
            progress: t.progress,
            is_milestone: t.is_milestone,
            work_state: t.work_state,
          },
          currentActorId(),
        );
        created.push({ id: task.id, title: task.title });
      }
      audit('bulk_create_tasks', args, { project_id: args.project_id, created_count: created.length }, args.requested_by);
      return ok({ created: true, count: created.length, tasks: created });
    }),
  );

  server.registerTool(
    'list_task_dependencies',
    {
      title: 'タスク依存関係一覧',
      description: '案件内のタスク依存関係 (先行 predecessor → 後続 successor) を一覧する。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
      },
    },
    async (args) => runTool(async () => {
      const deps = await projectTasksService.listDependencies(args.project_id);
      return ok(deps);
    }),
  );

  server.registerTool(
    'add_task_dependency',
    {
      title: 'タスク依存関係を追加',
      description:
        'タスク間に依存 (先行 → 後続) を追加する。predecessor_id が完了後に successor_id を開始する関係。' +
        '同じ組は冪等。逆向きが既にあると循環になるため拒否。ガントに → 線で表示される。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        predecessor_id: z.string().min(1).describe('先行タスク ID'),
        successor_id: z.string().min(1).describe('後続タスク ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const dep = await projectTasksService.addDependency(args.project_id, args.predecessor_id, args.successor_id, currentActorId());
      audit('add_task_dependency', args, { dependency_id: dep.id, predecessor_id: args.predecessor_id, successor_id: args.successor_id }, args.requested_by);
      return ok({ added: true, dependency: dep });
    }),
  );

  server.registerTool(
    'remove_task_dependency',
    {
      title: 'タスク依存関係を削除',
      description: 'タスク依存関係を削除する。id は list_task_dependencies で取得。',
      inputSchema: {
        id: z.string().min(1).describe('依存関係 ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await projectTasksService.removeDependency(args.id);
      audit('remove_task_dependency', args, { removed_id: args.id }, args.requested_by);
      return ok({ removed: true, id: args.id });
    }),
  );

  // ---- かんばん列 (task_columns) ----
  // これまで move_task は column_id を要求するのに、列を知る・作る口が MCP に無かった。
  // HTTP 側 (`task-columns.routes.ts`) と同じサービスを呼ぶ。

  server.registerTool(
    'list_task_columns',
    {
      title: 'かんばん列の一覧',
      description:
        '案件のかんばん列 (セクション) を一覧する。move_task / create_task の column_id はここで解決する。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
      },
    },
    async (args) => runTool(async () => ok(await taskColumnsService.listForProject(args.project_id))),
  );

  server.registerTool(
    'create_task_column',
    {
      title: 'かんばん列を追加',
      description: '案件にかんばん列 (セクション) を追加する (いちばん右に付く。位置は reorder_task_columns で)。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        name: z.string().min(1).max(100).describe('列の名前'),
        color: z.string().max(20).optional().describe('列の色 (#RRGGBB など・任意)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const column = await taskColumnsService.create(
        args.project_id, { name: args.name, color: args.color ?? null }, currentActorId(),
      );
      audit('create_task_column', args, { created_id: column.id, project_id: args.project_id, name: args.name }, args.requested_by);
      return ok({ created: true, column });
    }),
  );

  server.registerTool(
    'update_task_column',
    {
      title: 'かんばん列を更新',
      description: 'かんばん列の名前・色を変更する (渡したフィールドだけ変更)。',
      inputSchema: {
        id: z.string().min(1).describe('列 ID'),
        name: z.string().min(1).max(100).optional(),
        color: z.string().max(20).nullable().optional().describe('null で色なしに'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const column = await taskColumnsService.update(
        args.id,
        {
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.color !== undefined ? { color: args.color } : {}),
        },
        currentActorId(),
      );
      audit('update_task_column', args, { updated_id: args.id }, args.requested_by);
      return ok({ updated: true, column });
    }),
  );

  server.registerTool(
    'reorder_task_columns',
    {
      title: 'かんばん列の並び替え',
      description: '同一案件内のかんばん列の並び順 (sort_order) を一括更新する。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        items: z.array(z.object({
          id: z.string().min(1),
          sort_order: z.number().int(),
        })).min(1).describe('{id, sort_order} の配列 (小さいほど左)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await taskColumnsService.reorder(args.project_id, args.items, currentActorId());
      audit('reorder_task_columns', args, { project_id: args.project_id, count: args.items.length }, args.requested_by);
      return ok({ reordered: true, count: args.items.length });
    }),
  );

  server.registerTool(
    'delete_task_column',
    {
      title: 'かんばん列を削除',
      description:
        'かんばん列を削除する (soft delete)。**列の中のタスクは消えない** — 列なしに移って残る。',
      inputSchema: {
        id: z.string().min(1).describe('列 ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await taskColumnsService.delete(args.id, currentActorId());
      audit('delete_task_column', args, { deleted_id: args.id }, args.requested_by);
      return ok({ deleted: true, id: args.id });
    }),
  );

  server.registerTool(
    'list_task_column_templates',
    {
      title: 'かんばん列テンプレートの一覧',
      description: 'かんばん列の雛形 (配信案件用・イベント用など) を一覧する。apply_task_column_template に渡す。',
      inputSchema: {},
    },
    async () => runTool(async () => ok(await taskTemplatesService.list())),
  );

  server.registerTool(
    'apply_task_column_template',
    {
      title: 'かんばん列テンプレートを適用',
      description:
        'テンプレートの列一式を案件に追加する (既存の列は消えず、後ろに足される)。' +
        'episode_id を渡すと、案件への列追加のかわりに列ごと1件ずつその回 (エピソード) の' +
        'タスクを作る (レギュラー番組の回向け・列は案件の既存列と名前で共有し増やさない。' +
        '同じ回に二度は当てられない)。' +
        'template_id は list_task_column_templates で解決 (回向けは "tpl-regular-episode")。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        template_id: z.string().min(1).describe('テンプレート ID'),
        episode_id: z.string().optional().describe('回 (エピソード) ID。指定すると案件ではなくこの回にタスクとして適用する'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      if (args.episode_id) {
        const tasks = await taskColumnsService.applyToEpisode(
          args.project_id, args.episode_id, args.template_id, currentActorId(),
        );
        audit('apply_task_column_template', args,
          { project_id: args.project_id, template_id: args.template_id, episode_id: args.episode_id, created_count: tasks.length },
          args.requested_by);
        return ok({ applied: true, count: tasks.length, tasks });
      }
      const columns = await taskColumnsService.fromTemplate(args.project_id, args.template_id, currentActorId());
      audit('apply_task_column_template', args, { project_id: args.project_id, template_id: args.template_id, created_count: columns.length }, args.requested_by);
      return ok({ applied: true, count: columns.length, columns });
    }),
  );
}
