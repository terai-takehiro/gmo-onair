/**
 * Excel 書き出し。実装設計: 04-schedule-impl.md §4-1（E）・§7
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessSchedule } from '../access';
import { excelResponse } from '../../../shared/utils/excel';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import { getScheduleRaw, getScheduleWithMeta, getScheduleColumns, getScheduleItems } from '../services/schedule.service';
import { getBreakdown } from '../services/schedule-breakdown.service';
import { buildScheduleWorkbook, scheduleFilename } from '../excel/schedule-workbook';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

// exporter は実効 reader と同値（auth.ts の LEVEL_ORDER）だが、後で「持ち出しだけ止めたい」
// と言われたときに1文字で変えられるよう書き分ける（excel-resource.ts:82 の前例）
router.get('/schedules/:id/export-xlsx', requirePermission('qsheet', 'exporter'), wrap(async (req: Request, res: Response) => {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  if (!(await canAccessSchedule(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('スケジュール表が見つかりません');
  }

  const schedule = await getScheduleWithMeta(p1(req.params.id));
  if (!schedule) throw new NotFoundError('スケジュール表が見つかりません');
  const [columns, items, breakdown] = await Promise.all([
    getScheduleColumns(p1(req.params.id)),
    getScheduleItems(p1(req.params.id)),
    getBreakdown(p1(req.params.id)),
  ]);

  const scheduleForSheet = {
    title: schedule.title as string,
    service_date: schedule.service_date as unknown as string,
    location_name: (schedule.location_name as string) ?? null,
    view_start_min: schedule.view_start_min as number,
    view_end_min: schedule.view_end_min as number,
    slot_min: schedule.slot_min as number,
  };
  const wb = buildScheduleWorkbook(
    scheduleForSheet,
    columns.map((c) => ({ id: c.id as string, col_group: c.col_group as 'venue' | 'prep' | 'ops', label: c.label as string, room_name: (c.room_name as string) ?? null, sort_order: c.sort_order as number })),
    items.map((i) => ({
      id: i.id as string, column_id: i.column_id as string, title: i.title as string, kind: i.kind as string,
      start_min: i.start_min as number, end_min: i.end_min as number, assignee: (i.assignee as string) ?? null,
      note: (i.note as string) ?? null, qsheet_document_id: (i.qsheet_document_id as string) ?? null, link_broken: !!i.link_broken,
    })),
    breakdown,
  );

  const buf = await wb.xlsx.writeBuffer();
  excelResponse(res, scheduleFilename(scheduleForSheet), Buffer.from(buf));
}));

export default router;
