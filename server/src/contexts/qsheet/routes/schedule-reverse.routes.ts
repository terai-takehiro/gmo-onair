/**
 * 進行表（逆引き）— `GET /documents/:docId/schedule-items`。実装設計: 04-schedule-impl.md §6
 *
 * 二重の権限ゲート: ① canAccessDoc（通らなければ 404）② 表ごとに canAccessSchedule
 * （通らない表の項目は返さない・件数にも入れない）。N+1 を避けるため②は SQL の行条件に埋める。
 *
 * ⚠️ 返す型は `ScheduleItemRef`（必要最小限）。`SELECT i.*` を書かない —
 * `*` は将来足した列（assignee / note など）を自動で漏らす。
 *
 * ⚠️ **PR7a で見つけて直したバグ**: ②の行条件が `canAccessSchedule`（`access.ts`）と
 * 揃っていなかった。案件メンバーの自動共有（14-schedule-v2-plan.md §3-2・2026-09-06 決定）を
 * `canAccessSchedule` に足した PR2 のとき、この一覧固有の SQL 条件（作成者／明示共有のみ）は
 * 直し忘れていた——「逆引きと AI 提案は canAccessSchedule 経由なので自動で揃う」という同計画書
 * §3-2 の記述は、AI 提案（`canAccessProposal`）には当てはまるが、行条件を自前の SQL に
 * 埋め込んでいるこの一覧には当てはまらなかった（コードは関数を呼んでおらず、条件を複製していた）。
 * 案件メンバーは表自体は見えるのに、この逆引きの一覧にだけ出ない状態だったため、
 * `canAccessSchedule` と同じ「案件メンバー／主担当」の OR 条件を SQL に足して揃えた。
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
    // canAccessSchedule と同じ4条件（作成者／明示共有／案件メンバー／案件の主担当）。OR を1つでも
    // 落とすと、その条件だけで表にアクセスできる人にこの一覧の項目が見えなくなる（上の注記参照）
    sql += ` AND (s.created_by = $2 OR EXISTS (
               SELECT 1 FROM qsheet_schedule_shares sh WHERE sh.schedule_id = s.id AND sh.user_id = $2)
             OR (s.project_id IS NOT NULL AND (
               EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = s.project_id AND pm.user_id = $2 AND pm.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM projects p2 WHERE p2.id = s.project_id AND p2.assigned_to = $2)
             )))`;
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
