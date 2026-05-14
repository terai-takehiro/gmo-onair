import { queryAll } from '../../../shared/db/connection';

export interface TaskColumnTemplateColumn {
  id: string;
  template_id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface TaskColumnTemplate {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  columns: TaskColumnTemplateColumn[];
}

export const taskTemplatesService = {
  async list(): Promise<TaskColumnTemplate[]> {
    const templates = (await queryAll(
      `SELECT id, name, description, is_system
       FROM task_column_templates
       WHERE deleted_at IS NULL
       ORDER BY is_system DESC, name`
    )) as unknown as Omit<TaskColumnTemplate, 'columns'>[];

    if (templates.length === 0) return [];

    const ids = templates.map((t) => t.id);
    const columns = (await queryAll(
      `SELECT id, template_id, name, color, sort_order
       FROM task_column_template_columns
       WHERE template_id = ANY($1::text[])
       ORDER BY sort_order`,
      [ids]
    )) as unknown as TaskColumnTemplateColumn[];

    const colMap = new Map<string, TaskColumnTemplateColumn[]>();
    for (const col of columns) {
      if (!colMap.has(col.template_id)) colMap.set(col.template_id, []);
      colMap.get(col.template_id)!.push(col);
    }

    return templates.map((t) => ({
      ...t,
      columns: colMap.get(t.id) ?? [],
    }));
  },
};
