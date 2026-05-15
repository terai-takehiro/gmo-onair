import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface ProjectTask {
  id: string;
  project_id: string;
  episode_id: string | null;
  column_id: string | null;
  title: string;
  description: string | null;
  task_type: 'free' | 'checklist' | 'production_step' | 'sales';
  production_step: 'script' | 'materials' | 'recording' | null;
  start_date: string | null;
  due_date: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  parent_task_id: string | null;
  column_name: string | null;
  column_color: string | null;
  children?: ProjectTask[];
  created_at: string;
  updated_at: string;
}

const SELECT_TASK = `
  SELECT
    t.id, t.project_id, t.episode_id, t.column_id,
    t.title, t.description, t.task_type, t.production_step,
    t.start_date::text AS start_date, t.due_date::text AS due_date,
    t.assigned_to, u.name AS assigned_to_name,
    t.is_completed, t.completed_at, t.sort_order, t.parent_task_id,
    tc.name AS column_name, tc.color AS column_color,
    t.created_at, t.updated_at
  FROM project_tasks t
  LEFT JOIN users u ON u.id = t.assigned_to
  LEFT JOIN task_columns tc ON tc.id = t.column_id AND tc.deleted_at IS NULL
`;

export interface TaskFilter {
  episodeId?: string | null;
  columnId?: string;
}

export const projectTasksService = {
  async list(projectId: string, filter: TaskFilter = {}): Promise<ProjectTask[]> {
    const params: unknown[] = [projectId];
    let idx = 2;

    let episodeClause = '';
    if (filter.episodeId !== undefined) {
      if (filter.episodeId === null) {
        episodeClause = '';
      } else {
        episodeClause = `AND (t.episode_id IS NULL OR t.episode_id = $${idx++})`;
        params.push(filter.episodeId);
      }
    }

    const colClause = filter.columnId
      ? `AND t.column_id = $${idx++}`
      : '';
    if (filter.columnId) params.push(filter.columnId);

    const rows = (await queryAll(
      `${SELECT_TASK}
       WHERE t.project_id = $1
         AND t.deleted_at IS NULL
         AND t.parent_task_id IS NULL
         ${episodeClause}
         ${colClause}
       ORDER BY t.column_id NULLS LAST, t.sort_order, t.created_at`,
      params
    )) as unknown as ProjectTask[];

    if (rows.length === 0) return [];

    const parentIds = rows.map((r) => r.id);
    const children = (await queryAll(
      `${SELECT_TASK}
       WHERE t.parent_task_id = ANY($1::text[])
         AND t.deleted_at IS NULL
       ORDER BY t.sort_order, t.created_at`,
      [parentIds]
    )) as unknown as ProjectTask[];

    const childMap = new Map<string, ProjectTask[]>();
    for (const child of children) {
      const pid = child.parent_task_id as string;
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(child);
    }

    return rows.map((r) => ({ ...r, children: childMap.get(r.id) ?? [] }));
  },

  async getById(id: string): Promise<ProjectTask | null> {
    const task = (await queryOne(
      `${SELECT_TASK} WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [id]
    )) as unknown as ProjectTask | undefined;
    if (!task) return null;

    const children = (await queryAll(
      `${SELECT_TASK}
       WHERE t.parent_task_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.sort_order, t.created_at`,
      [id]
    )) as unknown as ProjectTask[];

    return { ...task, children };
  },

  async create(
    projectId: string,
    data: {
      title: string;
      description?: string | null;
      task_type?: ProjectTask['task_type'];
      production_step?: ProjectTask['production_step'];
      episode_id?: string | null;
      column_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
      assigned_to?: string | null;
      parent_task_id?: string | null;
    },
    userId: string
  ): Promise<ProjectTask> {
    const id = uuidv4();

    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS max
       FROM project_tasks
       WHERE project_id = $1
         AND column_id IS NOT DISTINCT FROM $2
         AND deleted_at IS NULL
         AND parent_task_id IS NULL`,
      [projectId, data.column_id ?? null]
    );
    const sortOrder = ((maxRow?.max as number) ?? -1) + 1;

    await execute(
      `INSERT INTO project_tasks
         (id, project_id, episode_id, column_id, title, description,
          task_type, production_step, start_date, due_date,
          assigned_to, sort_order, parent_task_id,
          created_at, updated_at, created_by, updated_by)
       VALUES
         ($1, $2, $3, $4, $5, $6,
          $7, $8, $9::date, $10::date,
          $11, $12, $13,
          NOW(), NOW(), $14, $14)`,
      [
        id, projectId,
        data.episode_id ?? null, data.column_id ?? null,
        data.title, data.description ?? null,
        data.task_type ?? 'free', data.production_step ?? null,
        data.start_date ?? null, data.due_date ?? null,
        data.assigned_to ?? null, sortOrder,
        data.parent_task_id ?? null,
        userId,
      ]
    );

    return (await this.getById(id))!;
  },

  async update(
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      task_type: ProjectTask['task_type'];
      production_step: ProjectTask['production_step'];
      episode_id: string | null;
      column_id: string | null;
      start_date: string | null;
      due_date: string | null;
      assigned_to: string | null;
    }>,
    userId: string
  ): Promise<ProjectTask> {
    const existing = await queryOne(
      `SELECT id FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');

    const sets: string[] = ['updated_at = NOW()', 'updated_by = $2'];
    const params: unknown[] = [id, userId];
    let i = 3;

    const fields = [
      'title', 'description', 'task_type', 'production_step',
      'episode_id', 'column_id', 'assigned_to',
    ] as const;

    for (const f of fields) {
      if (f in data) { sets.push(`${f} = $${i++}`); params.push((data as Record<string, unknown>)[f]); }
    }
    if ('start_date' in data) { sets.push(`start_date = $${i++}::date`); params.push(data.start_date); }
    if ('due_date' in data) { sets.push(`due_date = $${i++}::date`); params.push(data.due_date); }

    await execute(
      `UPDATE project_tasks SET ${sets.join(', ')} WHERE id = $1`,
      params
    );

    return (await this.getById(id))!;
  },

  async toggleComplete(id: string, userId: string): Promise<ProjectTask> {
    const existing = (await queryOne(
      `SELECT is_completed FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )) as unknown as { is_completed: boolean } | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');

    const next = !existing.is_completed;
    await execute(
      `UPDATE project_tasks
       SET is_completed = $1,
           completed_at = $2,
           updated_at = NOW(), updated_by = $3
       WHERE id = $4`,
      [next, next ? new Date().toISOString() : null, userId, id]
    );

    return (await this.getById(id))!;
  },

  async move(
    id: string,
    columnId: string | null,
    sortOrder: number,
    userId: string
  ): Promise<void> {
    const existing = await queryOne(
      `SELECT id FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');

    await execute(
      `UPDATE project_tasks
       SET column_id = $1, sort_order = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $4`,
      [columnId, sortOrder, userId, id]
    );
  },

  async reorder(
    projectId: string,
    items: Array<{ id: string; sort_order: number }>,
    userId: string
  ): Promise<void> {
    for (const item of items) {
      await execute(
        `UPDATE project_tasks
         SET sort_order = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3 AND project_id = $4 AND deleted_at IS NULL`,
        [item.sort_order, userId, item.id, projectId]
      );
    }
  },

  async delete(id: string, userId: string): Promise<void> {
    const existing = await queryOne(
      `SELECT id FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');

    await execute(
      `UPDATE project_tasks
       SET deleted_at = NOW(), updated_by = $1
       WHERE parent_task_id = $2 AND deleted_at IS NULL`,
      [userId, id]
    );

    await execute(
      `UPDATE project_tasks
       SET deleted_at = NOW(), updated_by = $1
       WHERE id = $2`,
      [userId, id]
    );
  },
};
