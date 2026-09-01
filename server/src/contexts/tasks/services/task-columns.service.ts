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

type TemplateCol = { name: string; color: string | null; sort_order: number };

/**
 * レギュラー回向け標準工程テンプレートのID（migration 263・regular-series.md §4・§10-8）。
 * 受注時の第1回自動作成（`project.service.ts` の `ensureFirstEpisode`）と、頻度指定の
 * 一括生成（`episode-generate.routes.ts`）の両方から回を作った直後に当てる
 * （§10 積み残し2）。**1箇所に置いて2箇所から参照する**（両方に同じ文字列を
 * 書き写すと、テンプレートを作り直したときに片方だけ古いIDのまま残る）。
 */
export const REGULAR_EPISODE_TEMPLATE_ID = 'tpl-regular-episode';

export const taskColumnsService = {
  async listForProject(projectId: string): Promise<TaskColumn[]> {
    const rows = await queryAll(
      `SELECT id, project_id, name, color, sort_order, created_at, updated_at
       FROM task_columns
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY sort_order, created_at`,
      [projectId]
    );
    return rows as unknown as TaskColumn[];
  },

  async create(
    projectId: string,
    data: { name: string; color?: string | null },
    userId: string
  ): Promise<TaskColumn> {
    const id = uuidv4();
    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS max
       FROM task_columns WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    const sortOrder = ((maxRow?.max as number) ?? -1) + 1;

    await execute(
      `INSERT INTO task_columns (id, project_id, name, color, sort_order, created_at, updated_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $6)`,
      [id, projectId, data.name, data.color ?? null, sortOrder, userId]
    );

    const row = await queryOne(
      `SELECT id, project_id, name, color, sort_order, created_at, updated_at
       FROM task_columns WHERE id = $1`,
      [id]
    );
    return row as unknown as TaskColumn;
  },

  async fromTemplate(
    projectId: string,
    templateId: string,
    userId: string
  ): Promise<TaskColumn[]> {
    const templateCols = (await queryAll(
      `SELECT name, color, sort_order
       FROM task_column_template_columns
       WHERE template_id = $1
       ORDER BY sort_order`,
      [templateId]
    )) as unknown as TemplateCol[];

    if (templateCols.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つからないか列がありません');
    }

    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS max
       FROM task_columns WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    let nextOrder = ((maxRow?.max as number) ?? -1) + 1;

    const created: TaskColumn[] = [];
    for (const col of templateCols) {
      const id = uuidv4();
      await execute(
        `INSERT INTO task_columns (id, project_id, name, color, sort_order, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $6)`,
        [id, projectId, col.name, col.color, nextOrder, userId]
      );
      nextOrder++;
      const row = await queryOne(
        `SELECT id, project_id, name, color, sort_order, created_at, updated_at
         FROM task_columns WHERE id = $1`,
        [id]
      );
      if (row) created.push(row as unknown as TaskColumn);
    }

    return created;
  },

  /**
   * 回（エピソード）に標準工程テンプレートを当てる（レギュラー番組向け・
   * `docs/design/v4/regular-series.md` §4・§10-8）。
   *
   * テンプレートの列（ブロック）は**案件のかんばん列と共有する** — 既に同じ名前の
   * 列があれば使い回し、無ければ作る。同じ回向けテンプレートを別の回に当てても
   * 列は増えない（§4「標準工程テンプレートの工程名がそのまま状態になる」の前提。
   * 複数の回が同じ列を共有してこそ、列＝状態として意味を持つ）。
   * 列ごとに1件、この回（`episode_id`）に紐づくタスクを作る。
   *
   * ⚠️ **`episodes.status` には一切触れない**（§4の原則）。状態はタスクの
   * 完了状況から導出するだけで、ここでは作るだけ。
   *
   * 二度当てない: この回に同じ由来（`source='episode_task_template'`）の
   * タスクが既にあれば止める（`flow-template.service.ts` の `flow_applied_at` と
   * 同じ判断・同じ理由 — 押し直しで同じタスクが2組できると消す作業が発生する）。
   */
  async applyToEpisode(
    projectId: string,
    episodeId: string,
    templateId: string,
    userId: string
  ): Promise<Array<{ id: string; column_id: string; title: string }>> {
    const episode = await queryOne(
      `SELECT id FROM episodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [episodeId, projectId]
    );
    if (!episode) throw new AppError(404, 'NOT_FOUND', 'この回は見つからないか、この案件のものではありません');

    const already = await queryOne(
      `SELECT id FROM project_tasks
       WHERE episode_id = $1 AND source = 'episode_task_template' AND deleted_at IS NULL LIMIT 1`,
      [episodeId]
    );
    if (already) {
      throw new AppError(400, 'ALREADY_EXISTS',
        'この回にはすでに標準工程を当ててあります。足したいときはタスクタブから1件ずつ入れてください。');
    }

    const templateCols = (await queryAll(
      `SELECT name, color, sort_order
       FROM task_column_template_columns
       WHERE template_id = $1
       ORDER BY sort_order`,
      [templateId]
    )) as unknown as TemplateCol[];
    if (templateCols.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つからないか列がありません');
    }

    const existingCols = (await queryAll(
      `SELECT id, name, sort_order FROM task_columns WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    )) as unknown as Array<{ id: string; name: string; sort_order: number }>;
    const colByName = new Map(existingCols.map((c) => [c.name, c] as const));
    let nextColOrder = existingCols.reduce((max, c) => Math.max(max, c.sort_order), -1) + 1;

    const created: Array<{ id: string; column_id: string; title: string }> = [];
    for (const tc of templateCols) {
      let col = colByName.get(tc.name);
      if (!col) {
        const colId = uuidv4();
        await execute(
          `INSERT INTO task_columns (id, project_id, name, color, sort_order, created_at, updated_at, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $6)`,
          [colId, projectId, tc.name, tc.color, nextColOrder, userId]
        );
        col = { id: colId, name: tc.name, sort_order: nextColOrder };
        colByName.set(tc.name, col);
        nextColOrder++;
      }

      const maxTaskOrder = await queryOne(
        `SELECT COALESCE(MAX(sort_order), -1) AS max FROM project_tasks
         WHERE project_id = $1 AND column_id = $2 AND deleted_at IS NULL AND parent_task_id IS NULL`,
        [projectId, col.id]
      );
      const taskOrder = ((maxTaskOrder?.max as number) ?? -1) + 1;

      const taskId = uuidv4();
      await execute(
        `INSERT INTO project_tasks
           (id, project_id, episode_id, column_id, title, task_type, sort_order, source, source_ref,
            created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, 'free', $6, 'episode_task_template', $7, NOW(), NOW(), $8, $8)`,
        [taskId, projectId, episodeId, col.id, tc.name, taskOrder, templateId, userId]
      );
      created.push({ id: taskId, column_id: col.id, title: tc.name });
    }

    return created;
  },

  async update(
    id: string,
    data: { name?: string; color?: string | null },
    userId: string
  ): Promise<TaskColumn> {
    const existing = await queryOne(
      `SELECT id FROM task_columns WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'カラムが見つかりません');

    const sets: string[] = ['updated_at = NOW()', 'updated_by = $2'];
    const params: unknown[] = [id, userId];
    let i = 3;

    if (data.name !== undefined) { sets.push(`name = $${i++}`); params.push(data.name); }
    if (data.color !== undefined) { sets.push(`color = $${i++}`); params.push(data.color); }

    await execute(
      `UPDATE task_columns SET ${sets.join(', ')} WHERE id = $1`,
      params
    );

    const row = await queryOne(
      `SELECT id, project_id, name, color, sort_order, created_at, updated_at
       FROM task_columns WHERE id = $1`,
      [id]
    );
    return row as unknown as TaskColumn;
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
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'カラムが見つかりません');

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
