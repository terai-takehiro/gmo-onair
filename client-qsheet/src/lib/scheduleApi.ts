// スケジュール表 — API 呼び出しの薄いラッパー。実装設計: 04-schedule-impl.md §4
import api from "@/lib/api";
import type {
  Schedule, ScheduleDetail, ScheduleColumn, ScheduleItem,
  ScheduleTemplate, ApplyPreview, ItemBreakdown,
} from "@gmo-onair/shared/src/schedule/types";

interface Envelope<T> { success: boolean; data: T }
interface ApiConflict {
  response?: { status?: number; data?: { error?: { code?: string; current_updated_at?: string; updated_by_name?: string | null; conflicts?: string[] } } };
}
export function isConflict(err: unknown): boolean {
  const e = err as ApiConflict;
  return e?.response?.status === 409;
}
export function conflictInfo(err: unknown): { current_updated_at?: string; updated_by_name?: string | null; conflicts?: string[] } {
  const e = err as ApiConflict;
  return e?.response?.data?.error ?? {};
}

export async function listSchedules(params: Record<string, string | undefined>): Promise<Schedule[]> {
  const res = await api.get<Envelope<Schedule[]>>("/qsheet/schedules", { params });
  return res.data.data;
}

export async function getSchedule(id: string): Promise<ScheduleDetail> {
  const res = await api.get<Envelope<ScheduleDetail>>(`/qsheet/schedules/${id}`);
  return res.data.data;
}

export interface CreateSchedulePayload {
  title: string;
  service_date: string;
  location_id?: string | null;
  project_id?: string | null;
  episode_id?: string | null;
  template_id?: string | null;
  onair_start_min?: number | null;
}
export async function createSchedule(payload: CreateSchedulePayload): Promise<Schedule> {
  const res = await api.post<Envelope<Schedule>>("/qsheet/schedules", payload);
  return res.data.data;
}

export async function updateSchedule(id: string, patch: Record<string, unknown>): Promise<Schedule> {
  const res = await api.put<Envelope<Schedule>>(`/qsheet/schedules/${id}`, patch);
  return res.data.data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/qsheet/schedules/${id}`);
}

export async function setScheduleShares(id: string, userIds: string[]): Promise<number> {
  const res = await api.put<Envelope<{ share_count: number }>>(`/qsheet/schedules/${id}/shares`, { user_ids: userIds });
  return res.data.data.share_count;
}

// ── 列 ──────────────────────────────────────────────────────
export async function createColumn(scheduleId: string, body: Record<string, unknown>): Promise<ScheduleColumn> {
  const res = await api.post<Envelope<ScheduleColumn>>(`/qsheet/schedules/${scheduleId}/columns`, body);
  return res.data.data;
}
export async function updateColumn(scheduleId: string, columnId: string, body: Record<string, unknown>): Promise<ScheduleColumn> {
  const res = await api.put<Envelope<ScheduleColumn>>(`/qsheet/schedules/${scheduleId}/columns/${columnId}`, body);
  return res.data.data;
}
export async function deleteColumn(scheduleId: string, columnId: string): Promise<number> {
  const res = await api.delete<Envelope<{ deleted_items: number }>>(`/qsheet/schedules/${scheduleId}/columns/${columnId}`);
  return res.data.data.deleted_items;
}
export async function reorderColumns(scheduleId: string, order: { id: string; col_group: string; sort_order: number }[]): Promise<ScheduleColumn[]> {
  const res = await api.put<Envelope<ScheduleColumn[]>>(`/qsheet/schedules/${scheduleId}/columns/reorder`, { order });
  return res.data.data;
}

// ── 項目 ────────────────────────────────────────────────────
export async function createItem(scheduleId: string, body: Record<string, unknown>): Promise<ScheduleItem> {
  const res = await api.post<Envelope<ScheduleItem>>(`/qsheet/schedules/${scheduleId}/items`, body);
  return res.data.data;
}
export async function updateItem(scheduleId: string, itemId: string, body: Record<string, unknown>): Promise<ScheduleItem> {
  const res = await api.put<Envelope<ScheduleItem>>(`/qsheet/schedules/${scheduleId}/items/${itemId}`, body);
  return res.data.data;
}
export async function deleteItem(scheduleId: string, itemId: string): Promise<void> {
  await api.delete(`/qsheet/schedules/${scheduleId}/items/${itemId}`);
}
export async function bulkUpdateItems(scheduleId: string, items: Record<string, unknown>[]): Promise<ScheduleItem[]> {
  const res = await api.put<Envelope<{ items: ScheduleItem[] }>>(`/qsheet/schedules/${scheduleId}/items/bulk`, { items });
  return res.data.data.items;
}

// ── 台本への橋 ──────────────────────────────────────────────
export async function createAndLinkDocument(scheduleId: string, itemId: string): Promise<{ item: ScheduleItem; document: { id: string } }> {
  const res = await api.post<Envelope<{ item: ScheduleItem; document: { id: string } }>>(`/qsheet/schedules/${scheduleId}/items/${itemId}/qsheet`);
  return res.data.data;
}
export async function setDocumentLink(scheduleId: string, itemId: string, documentId: string | null): Promise<ScheduleItem> {
  const res = await api.put<Envelope<ScheduleItem>>(`/qsheet/schedules/${scheduleId}/items/${itemId}/qsheet`, { qsheet_document_id: documentId });
  return res.data.data;
}

// ── ブレイクダウン ──────────────────────────────────────────
export async function getBreakdown(scheduleId: string): Promise<ItemBreakdown[]> {
  const res = await api.get<Envelope<ItemBreakdown[]>>(`/qsheet/schedules/${scheduleId}/breakdown`);
  return res.data.data;
}

// ── ひな形 ──────────────────────────────────────────────────
export async function listTemplates(locationId?: string | null): Promise<ScheduleTemplate[]> {
  const res = await api.get<Envelope<ScheduleTemplate[]>>("/qsheet/schedule-templates", { params: locationId ? { location_id: locationId } : {} });
  return res.data.data;
}
export async function previewTemplate(templateId: string, scheduleId: string, onairStartMin: number | null): Promise<ApplyPreview> {
  const res = await api.post<Envelope<ApplyPreview>>(`/qsheet/schedule-templates/${templateId}/preview`, { schedule_id: scheduleId, onair_start_min: onairStartMin });
  return res.data.data;
}
export interface ApplyResult { created_columns: number; created_items: number; skipped: string[] }
export async function applyTemplate(
  scheduleId: string, templateId: string, columnIds: string[], itemIds: string[], onairStartMin: number | null,
): Promise<ApplyResult> {
  const res = await api.post<Envelope<ApplyResult>>(`/qsheet/schedules/${scheduleId}/apply-template`, {
    template_id: templateId, column_ids: columnIds, item_ids: itemIds, onair_start_min: onairStartMin,
  });
  return res.data.data;
}
