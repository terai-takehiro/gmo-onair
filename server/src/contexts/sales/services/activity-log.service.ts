import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface ActivityLogFilter {
  opportunityId?: string;
  customerId?: string;
  performedBy?: string;
  activityType?: string;
  search?: string;
}

export class ActivityLogService {
  list(filter: ActivityLogFilter, page: number, limit: number, offset: number) {
    let where = 'WHERE a.deleted_at IS NULL';
    const params: unknown[] = [];
    if (filter.opportunityId) { where += ' AND a.opportunity_id = ?'; params.push(filter.opportunityId); }
    if (filter.customerId) { where += ' AND a.customer_id = ?'; params.push(filter.customerId); }
    if (filter.performedBy) { where += ' AND a.performed_by = ?'; params.push(filter.performedBy); }
    if (filter.activityType) { where += ' AND a.activity_type = ?'; params.push(filter.activityType); }
    if (filter.search) { where += ' AND (a.subject LIKE ? OR a.description LIKE ?)'; params.push(`%${filter.search}%`, `%${filter.search}%`); }

    const total = (queryOne(`SELECT COUNT(*) as c FROM activity_logs a ${where}`, params) as any).c;
    const rows = queryAll(
      `SELECT a.*, u.name as performed_by_name,
              o.opp_code, o.title as opportunity_title,
              c.name as customer_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.performed_by
       LEFT JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN customers c ON c.id = a.customer_id
       ${where}
       ORDER BY a.activity_date DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total, page, limit };
  }

  getById(id: string) {
    const row = queryOne(
      `SELECT a.*, u.name as performed_by_name,
              o.opp_code, o.title as opportunity_title,
              c.name as customer_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.performed_by
       LEFT JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.id = ? AND a.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    return row;
  }

  create(data: Record<string, unknown>, userId: string) {
    const { opportunity_id, customer_id, activity_type, activity_date, duration_minutes, subject, description, next_action, next_action_date } = data;
    if (!activity_type || !activity_date || !subject) {
      throw new AppError(400, 'VALIDATION_ERROR', '活動種別、日付、件名は必須です');
    }
    const id = uuidv4();
    execute(
      `INSERT INTO activity_logs (id, opportunity_id, customer_id, activity_type, activity_date, duration_minutes, subject, description, next_action, next_action_date, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, opportunity_id || null, customer_id || null, activity_type, activity_date, duration_minutes || null, subject, description || null, next_action || null, next_action_date || null, userId]
    );
    return this.getById(id);
  }

  update(id: string, data: Record<string, unknown>, userId: string) {
    const existing = queryOne('SELECT id FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');

    const { opportunity_id, customer_id, activity_type, activity_date, duration_minutes, subject, description, next_action, next_action_date } = data;
    execute(
      `UPDATE activity_logs SET opportunity_id=?, customer_id=?, activity_type=?, activity_date=?, duration_minutes=?, subject=?, description=?, next_action=?, next_action_date=?, updated_at=datetime('now') WHERE id=?`,
      [opportunity_id || null, customer_id || null, activity_type, activity_date, duration_minutes || null, subject, description || null, next_action || null, next_action_date || null, id]
    );
    return this.getById(id);
  }

  delete(id: string) {
    execute(`UPDATE activity_logs SET deleted_at=datetime('now') WHERE id=? AND deleted_at IS NULL`, [id]);
  }

  /** 次回アクション期日が近い・過ぎている活動を取得 */
  getUpcomingActions(userId: string, daysAhead: number = 7) {
    const rows = queryAll(
      `SELECT a.*, o.opp_code, o.title as opportunity_title, c.name as customer_name
       FROM activity_logs a
       LEFT JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.deleted_at IS NULL
         AND a.performed_by = ?
         AND a.next_action IS NOT NULL
         AND a.next_action_date IS NOT NULL
         AND a.next_action_date <= date('now', '+' || ? || ' days')
       ORDER BY a.next_action_date ASC`,
      [userId, daysAhead]
    );
    return rows;
  }
}

export const activityLogService = new ActivityLogService();
