import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface TaskColumn {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const taskColumnsService = {
  async listForProject(projectId: string): Promise<TaskColumn[]> {
    return queryAll<TaskColumn>(
      `SELECT id, project_id, name, color, sort_order, created_at, updated_at
       FROM task_columns
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY sort_order, created_at`,
      [projectId]
    );
  },

  async create(
    projectId: string,
    data: { name: string; color?: string | null },
    userId: string
  ): Promise<TaskColumn> {
    const id = uuidv4();
    const maxRow = await queryOne<{ max: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS max
       FROM task_columns WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    const sortOrder = (maxRow?.max ?? -1) + 1;

    await execute(
      `INSERT INTO task_columns (id, project_id, name, color, sort_order, created_at, updated_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $6)`,
      [id, projectId, data.name, data.color ?? null, sortOrder, userId]
    );

    return (await queryOne<TaskColumn>(
      `SELECT id, project_id, name, color, sort_order, created_at, updated_at
       FROM task_columns WHERE id = $1`,
      [id]
    ))!;
  },

  async fromTemplate(
    projectId: string,
    templateId: string,
    userId: string
  ): Promise<TaskColumn[]> {
    const templateCols = await queryAll<{ name: string; color: string | null; sort_order: number }>(
      `SELECT name, color, sort_order
       FROM task_column_template_columns
       WHERE template_id = $1
       ORDER BY sort_order`,
      [templateId]
    );

    if (templateCols.length === 0) {
      throw new AppError(404, 'テンプレートが見つからないか列がありません');
    }

    const maxRow = await queryOne<{ max: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS max
       FROM task_columns WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    let nextOrder = (maxRow?.max ?? -1) + 1;

    const created: TaskColumn[] = [];
    for (const col of templateCols) {
      const id = uuidv4();
      await execute(
        `INSERT INTO task_columns (id, project_id, name, color, sort_order, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $6)`,
        [id, projectId, col.name, col.color, nextOrder, userId]
      );
      nextOrder++;
      const row = await queryOne<TaskColumn>(
        `SELECT id, project_id, name, color, sort_order, created_at, updated_at
         FROM task_columns WHERE id = $1`,
        [id]
      );
      if (row) created.push(row);
    }

    return created;
  },

  async update(
    id: string,
    data: { name?: string; color?: string | null },
    userId: string
  ): Promise<TaskColumn> {
    const existing = await queryOne<TaskColumn>(
      `SELECT id FROM task_columns WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'カラムが見つかりません');

    const sets: string[] = ['updated_at = NOW()', 'updated_by = $2'];
    const params: unknown[] = [id, userId];
    let i = 3;

    if (data.name !== undefined) { sets.push(`name = $${i++}`); params.push(data.name); }
    if (data.color !== undefined) { sets.push(`color = $${i++}`); params.push(data.color); }

    await execute(
      `UPDATE task_columns SET ${sets.join(', ')} WHERE id = $1`,
      params
    );

    return (await queryOne<TaskColumn>(
      `SELECT id, project_id, name, color, sort_order, created_at, updated_at
       FROM task_columns WHERE id = $1`,
      [id]
    ))!;
  },

  async reorder(
    projectId: string,
    items: Array<{ id: string; sort_order: number }>,
    userId: string
  ): Promise<void> {
    for (const item of items) {
      await execute(
        `UPDATE task_columns SET sort_order = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3 AND project_id = $4 AND deleted_at IS NULL`,
        [item.sort_order, userId, item.id, projectId]
      );
    }
  },

  async delete(id: string, userId: string): Promise<void> {
    const existing = await queryOne(
      `SELECT id FROM task_columns WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'カラムが見つかりません');

    // タスクの column_id を NULL化
    await execute(
      `UPDATE project_tasks SET column_id = NULL, updated_at = NOW(), updated_by = $1
       WHERE column_id = $2 AND deleted_at IS NULL`,
      [userId, id]
    );

    await execute(
      `UPDATE task_columns SET deleted_at = NOW(), updated_by = $1 WHERE id = $2`,
      [userId, id]
    );
  },
};
