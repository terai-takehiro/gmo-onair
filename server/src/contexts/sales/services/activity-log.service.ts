import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface ActivityLogFilter {
  projectId?: string;
  customerId?: string;
  userId?: string;
  activityType?: string;
  search?: string;
}

export class ActivityLogService {
  async list(filter: ActivityLogFilter, page: number, limit: number, offset: number) {
    let where = 'WHERE a.deleted_at IS NULL';
    const params: unknown[] = [];
    if (filter.projectId) { where += ' AND a.project_id = ?'; params.push(filter.projectId); }
    if (filter.customerId) { where += ' AND a.customer_id = ?'; params.push(filter.customerId); }
    if (filter.userId) { where += ' AND a.user_id = ?'; params.push(filter.userId); }
    if (filter.activityType) { where += ' AND a.activity_type = ?'; params.push(filter.activityType); }
    if (filter.search) { where += ' AND (a.subject ILIKE ? OR a.description ILIKE ?)'; params.push(`%${filter.search}%`, `%${filter.search}%`); }

    const total = ((await queryOne(`SELECT COUNT(*) as c FROM activity_logs a ${where}`, params)) as any).c;
    const rows = await queryAll(
      `SELECT a.*, u.name as user_name,
              p.code as project_code, p.name as project_name,
              c.name as customer_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       ${where}
       ORDER BY a.activity_date DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total, page, limit };
  }

  async getById(id: string) {
    const row = await queryOne(
      `SELECT a.*, u.name as user_name,
              p.code as project_code, p.name as project_name,
              c.name as customer_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.id = ? AND a.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    return row;
  }

  async create(data: Record<string, unknown>, userId: string) {
    const { project_id, customer_id, activity_type, activity_date, subject, description, next_action, next_action_date } = data;
    if (!activity_type || !activity_date || !subject) {
      throw new AppError(400, 'VALIDATION_ERROR', '活動種別、日付、件名は必須です');
    }
    const id = uuidv4();
    await execute(
      `INSERT INTO activity_logs (id, project_id, customer_id, user_id, activity_type, activity_date, subject, description, next_action, next_action_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, project_id || null, customer_id || null, userId, activity_type, activity_date, subject, description || null, next_action || null, next_action_date || null, userId]
    );
    return this.getById(id);
  }

  async update(id: string, data: Record<string, unknown>) {
    const existing = await queryOne('SELECT id FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');

    const { project_id, customer_id, activity_type, activity_date, subject, description, next_action, next_action_date } = data;
    await execute(
      `UPDATE activity_logs SET project_id=?, customer_id=?, activity_type=?, activity_date=?, subject=?, description=?, next_action=?, next_action_date=?, updated_at=NOW() WHERE id=?`,
      [project_id || null, customer_id || null, activity_type, activity_date, subject, description || null, next_action || null, next_action_date || null, id]
    );
    return this.getById(id);
  }

  async delete(id: string) {
    await execute(`UPDATE activity_logs SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL`, [id]);
  }

  async getUpcomingActions(userId: string, daysAhead: number = 7) {
    return await queryAll(
      `SELECT a.*, p.code as project_code, p.name as project_name, c.name as customer_name
       FROM activity_logs a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.deleted_at IS NULL
         AND a.user_id = ?
         AND a.next_action IS NOT NULL
         AND a.next_action_date IS NOT NULL
         AND a.next_action_date <= (CURRENT_DATE + (? || ' days')::interval)::text
       ORDER BY a.next_action_date ASC`,
      [userId, daysAhead]
    );
  }
}

export const activityLogService = new ActivityLogService();
