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
    // v2.9.178+: AI 起票 (MCP create_activity_log) を mcp_audit_log から逆引きして
    // is_ai_created / ai_requested_by (指示者) を付与 (migration 117 の expression index が効く)
    const rows = await queryAll(
      `SELECT a.*, u.name as user_name,
              p.code as project_code, p.name as project_name,
              c.name as customer_name,
              (ai.audit_id IS NOT NULL) as is_ai_created,
              ai.requested_by as ai_requested_by
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN customers c ON c.id = a.customer_id
       LEFT JOIN LATERAL (
         SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
         WHERE m.tool_name = 'create_activity_log' AND m.result_summary->>'created_id' = a.id
         ORDER BY m.created_at ASC
         LIMIT 1
       ) ai ON TRUE
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

  /** 次回アクションを完了にする (営業ダッシュボードのワンタップ操作用) */
  async completeNextAction(id: string) {
    const existing = await queryOne('SELECT id, next_action FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    if (!(existing as any).next_action) throw new AppError(400, 'VALIDATION_ERROR', '次回アクションが設定されていません');
    await execute(`UPDATE activity_logs SET next_action_done_at=NOW(), updated_at=NOW() WHERE id=?`, [id]);
    return this.getById(id);
  }

  /** 次回アクションの期限を延期する (営業ダッシュボードのワンタップ操作用) */
  async postponeNextAction(id: string, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'VALIDATION_ERROR', '延期先の日付 (YYYY-MM-DD) を指定してください');
    }
    const existing = await queryOne('SELECT id, next_action FROM activity_logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
    if (!(existing as any).next_action) throw new AppError(400, 'VALIDATION_ERROR', '次回アクションが設定されていません');
    await execute(`UPDATE activity_logs SET next_action_date=?, next_action_done_at=NULL, updated_at=NOW() WHERE id=?`, [date, id]);
    return this.getById(id);
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
         AND a.next_action_done_at IS NULL
         AND a.next_action_date <= (CURRENT_DATE + (? || ' days')::interval)::text
       ORDER BY a.next_action_date ASC`,
      [userId, daysAhead]
    );
  }
}

export const activityLogService = new ActivityLogService();
