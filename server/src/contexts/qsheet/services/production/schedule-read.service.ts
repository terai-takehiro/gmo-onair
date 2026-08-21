/**
 * `get_day_schedule`（MCP・段10 / 05-mcp.md §4-4）。
 *
 * 既存の `schedule.service.ts`（02-schedule 段4で作られた読み取り）をそのまま呼ぶだけ。
 * MCP のために別のクエリは作らない。
 */
import { AppError } from '../../../../shared/middleware/errorHandler';
import { canAccessSchedule, type AccessUser } from '../../access';
import { fmtHm } from '../../../../shared/schedule/time';
import {
  listSchedules,
  getScheduleRaw,
  getScheduleWithMeta,
  getScheduleColumns,
  getScheduleItems,
} from '../../services/schedule.service';

export interface GetDayScheduleInput {
  scheduleId?: string;
  projectId?: string;
  date?: string;
}

export interface DayScheduleResult {
  id: string;
  title: string;
  serviceDate: string;
  locationName: string | null;
  slotMin: number;
  viewStartMin: number;
  viewEndMin: number;
  columns: { id: string; group: string; label: string; roomName: string | null }[];
  items: {
    id: string;
    columnId: string;
    title: string;
    kind: string;
    startMin: number;
    endMin: number;
    startText: string;
    endText: string;
    assignee: string | null;
    note: string | null;
    qsheetDocumentId: string | null;
    linkBroken: boolean;
  }[];
}

async function resolveScheduleId(actor: AccessUser, input: GetDayScheduleInput): Promise<string> {
  if (input.scheduleId) return input.scheduleId;
  if (!input.projectId) {
    throw new AppError(400, 'BAD_REQUEST', 'schedule_id か project_id のどちらかを指定してください');
  }
  const rows = await listSchedules(actor, {
    project_id: input.projectId,
    date_from: input.date,
    date_to: input.date,
  });
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', '条件に合うスケジュール表が見つかりません');
  return rows[0].id as string;
}

export async function getDaySchedule(actor: AccessUser, input: GetDayScheduleInput): Promise<DayScheduleResult> {
  const scheduleId = await resolveScheduleId(actor, input);
  const raw = await getScheduleRaw(scheduleId);
  if (!raw) throw new AppError(404, 'NOT_FOUND', 'スケジュール表が見つかりません');
  if (!(await canAccessSchedule(actor, scheduleId, (raw.created_by as string) ?? null))) {
    throw new AppError(404, 'NOT_FOUND', 'スケジュール表が見つかりません');
  }

  const [meta, columns, items] = await Promise.all([
    getScheduleWithMeta(scheduleId),
    getScheduleColumns(scheduleId),
    getScheduleItems(scheduleId),
  ]);
  if (!meta) throw new AppError(404, 'NOT_FOUND', 'スケジュール表が見つかりません');

  return {
    id: meta.id as string,
    title: meta.title as string,
    serviceDate: meta.service_date as string,
    locationName: (meta.location_name as string) ?? null,
    slotMin: meta.slot_min as number,
    viewStartMin: meta.view_start_min as number,
    viewEndMin: meta.view_end_min as number,
    columns: columns.map((c) => ({
      id: c.id as string,
      group: c.col_group as string,
      label: c.label as string,
      roomName: (c.room_name as string) ?? null,
    })),
    items: items.map((i) => ({
      id: i.id as string,
      columnId: i.column_id as string,
      title: i.title as string,
      kind: i.kind as string,
      startMin: i.start_min as number,
      endMin: i.end_min as number,
      startText: fmtHm(i.start_min as number),
      endText: fmtHm(i.end_min as number),
      assignee: (i.assignee as string) ?? null,
      note: (i.note as string) ?? null,
      qsheetDocumentId: (i.qsheet_document_id as string) ?? null,
      linkBroken: !!i.link_broken,
    })),
  };
}
