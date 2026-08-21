/**
 * 進行表（逆引き）— `GET /documents/:docId/schedule-items`。実装設計: 04-schedule-impl.md §6
 *
 * 二重の権限ゲート: ① canAccessDoc（通らなければ 404）② 表ごとに canAccessSchedule
 * （通らない表の項目は返さない・件数にも入れない）。N+1 を避けるため②は SQL の行条件に埋める。
 *
 * ⚠️ 返す型は `ScheduleItemRef`（必要最小限）。`SELECT i.*` を書かない —
 * `*` は将来足した列（assignee / note など）を自動で漏らす。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { isQsheetAdmin, canAccessDoc } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

router.get('/documents/:docId/schedule-items', wrap(async (req: Request, res: Response) => {
  const doc = await queryOne('SELECT id, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL', [p1(req.params.docId)]);
  if (!doc) throw new NotFoundError('ドキュメントが見つかりません');
  if (!(await canAccessDoc(req.user!, doc.id as string, (doc.created_by as string) ?? null))) {
    throw new NotFoundError('ドキュメントが見つかりません');
  }

  let sql = `
    SELECT i.schedule_id, i.id AS item_id, to_char(s.service_date, 'YYYY-MM-DD') AS service_date,
           c.label AS column_label, c.room_id, r.name AS room_name,
           i.start_min, i.end_min, i.title
    FROM qsheet_schedule_items i
    JOIN qsheet_schedules s ON s.id = i.schedule_id AND s.deleted_at IS NULL
    JOIN qsheet_schedule_columns c ON c.id = i.column_id
    LEFT JOIN studio_rooms r ON r.id = c.room_id
    WHERE i.qsheet_document_id = $1 AND i.deleted_at IS NULL
  `;
  const params: unknown[] = [p1(req.params.docId)];
  if (!isQsheetAdmin(req.user!)) {
    sql += ` AND (s.created_by = $2 OR EXISTS (
               SELECT 1 FROM qsheet_schedule_shares sh WHERE sh.schedule_id = s.id AND sh.user_id = $2))`;
    params.push(req.user!.id);
  }
  sql += ' ORDER BY s.service_date, i.start_min';

  const rows = await queryAll(sql, params);
  const data = rows.map((r) => ({
    scheduleId: r.schedule_id as string,
    itemId: r.item_id as string,
    serviceDate: r.service_date as string,
    columnLabel: (r.room_name as string) || (r.column_label as string),
    startMin: r.start_min as number,
    endMin: r.end_min as number,
    title: r.title as string,
  }));
  res.json({ success: true, data });
}));

export default router;
