// スケジュール表 — API 呼び出しの薄いラッパー。実装設計: 04-schedule-impl.md §4
import api from "@/lib/api";
import type {
  Schedule, ScheduleDetail, ScheduleColumn, ScheduleItem,
  ScheduleTemplate, ApplyPreview, ItemBreakdown, ScheduleShare,
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
  const res = await api.get<Envelope<Schedule[]>>("/techops/schedules", { params });
  return res.data.data;
}

export async function getSchedule(id: string): Promise<ScheduleDetail> {
  const res = await api.get<Envelope<ScheduleDetail>>(`/techops/schedules/${id}`);
  return res.data.data;
}

export interface CreateSchedulePayload {
  title: string;
  service_date: string;
  location_id?: string | null;
  project_id?: string | null;
  /** 番組（マニュアル・案件管理外）。migration 227 で追加 */
  program_id?: string | null;
  episode_id?: string | null;
  template_id?: string | null;
  onair_start_min?: number | null;
}
export async function createSchedule(payload: CreateSchedulePayload): Promise<Schedule> {
  const res = await api.post<Envelope<Schedule>>("/techops/schedules", payload);
  return res.data.data;
}

export async function updateSchedule(id: string, patch: Record<string, unknown>): Promise<Schedule> {
  const res = await api.put<Envelope<Schedule>>(`/techops/schedules/${id}`, patch);
  return res.data.data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/techops/schedules/${id}`);
}

export async function getScheduleShares(id: string): Promise<ScheduleShare[]> {
  const res = await api.get<Envelope<ScheduleShare[]>>(`/techops/schedules/${id}/shares`);
  return res.data.data;
}
export async function setScheduleShares(id: string, userIds: string[]): Promise<{ share_count: number; shares: ScheduleShare[] }> {
  const res = await api.put<Envelope<{ share_count: number; shares: ScheduleShare[] }>>(`/techops/schedules/${id}/shares`, { user_ids: userIds });
  return res.data.data;
}

// ── 共有相手の候補（`share-users` は台本の共有ピッカーと共用。qsheet 権限だけで引ける）───
export interface ShareUserOption { id: string; name: string; email: string }
export async function listShareUsers(): Promise<ShareUserOption[]> {
  const res = await api.get<Envelope<ShareUserOption[]>>("/techops/share-users");
  return res.data.data;
}

// ── 案件・番組（表の設定「案件/番組」欄）─────────────────────
export interface ProjectOption { id: string; gls_number: string | null; name: string; customer_name: string | null }
export async function listGlsProjects(): Promise<ProjectOption[]> {
  const res = await api.get<Envelope<ProjectOption[]>>("/lookup/gls-options");
  return res.data.data;
}
export interface ProgramOption { id: string; name: string; event_date: string | null }
export async function listPrograms(): Promise<ProgramOption[]> {
  const res = await api.get<Envelope<ProgramOption[]>>("/techops/programs");
  return res.data.data;
}
export interface EpisodeOption { id: string; episode_code: string; episode_number: number; broadcast_date: string | null; recording_date: string | null }
export async function listEpisodes(projectId: string): Promise<EpisodeOption[]> {
  const res = await api.get<Envelope<EpisodeOption[]>>(`/lookup/${projectId}/episodes-options`);
  return res.data.data;
}

/**
 * 案件1件の「作るのに要る事実」（題・本番日の候補）。新規作成の先埋め専用（14-schedule-v2-plan.md §3 A5）。
 * **拠点の id は返らない**（`venue` は部屋名を並べた文字列で `studio_locations.id` を持たない）ので、
 * 拠点の先埋めはしない — 実在しない対応付けを当てに行くと事実でないものを先埋めすることになる。
 */
export interface ProjectContext {
  id: string; name: string; glsNumber: string | null; customerName: string | null;
  eventStart: string | null; eventEnd: string | null; venue: string | null;
  performanceDates: string[]; rehearsalDates: string[];
}
export async function getProjectContext(projectId: string): Promise<ProjectContext> {
  const res = await api.get<Envelope<ProjectContext>>(`/lookup/${projectId}/context`);
  return res.data.data;
}

// ── 列 ──────────────────────────────────────────────────────
export async function createColumn(scheduleId: string, body: Record<string, unknown>): Promise<ScheduleColumn> {
  const res = await api.post<Envelope<ScheduleColumn>>(`/techops/schedules/${scheduleId}/columns`, body);
  return res.data.data;
}
export async function updateColumn(scheduleId: string, columnId: string, body: Record<string, unknown>): Promise<ScheduleColumn> {
  const res = await api.put<Envelope<ScheduleColumn>>(`/techops/schedules/${scheduleId}/columns/${columnId}`, body);
  return res.data.data;
}
export async function deleteColumn(scheduleId: string, columnId: string): Promise<number> {
  const res = await api.delete<Envelope<{ deleted_items: number }>>(`/techops/schedules/${scheduleId}/columns/${columnId}`);
  return res.data.data.deleted_items;
}
export async function reorderColumns(scheduleId: string, order: { id: string; col_group: string; sort_order: number }[]): Promise<ScheduleColumn[]> {
  const res = await api.put<Envelope<ScheduleColumn[]>>(`/techops/schedules/${scheduleId}/columns/reorder`, { order });
  return res.data.data;
}

// ── 会場列が結べる部屋（読み取りのみ・14-schedule-v2-plan.md §3 A1・A2）────────
export interface StudioRoomOption { id: string; name: string; room_type: string | null; color: string | null }
export interface StudioLocationOption { id: string; name: string; abbreviation: string | null; rooms: StudioRoomOption[] }
export async function listStudioRooms(): Promise<StudioLocationOption[]> {
  const res = await api.get<Envelope<StudioLocationOption[]>>("/techops/studio-rooms");
  return res.data.data;
}

// ── 予約から列を入れる（読み取りのみ・14-schedule-v2-plan.md §3 B9・§3-1）────────
// 自動生成はしない。ここは「下見」だけで、列を作るのは人が選んだ分だけ
// （`BookingColumnsDialog.tsx`）。営業情報（金額・顧客連絡先・備考）は返らない。
export interface BookingSuggestionRoom {
  room_id: string; room_name: string; room_color: string | null;
  location_id: string | null; location_name: string | null; location_abbreviation: string | null;
}
export interface BookingSuggestion {
  id: string; title: string; booking_type: string; status: string;
  hold_rank: number | null; possible_duplicate: boolean;
  project_id: string | null; project_name: string | null; gls_number: string | null;
  rooms: BookingSuggestionRoom[];
}
export async function listBookingSuggestions(scheduleId: string): Promise<BookingSuggestion[]> {
  const res = await api.get<Envelope<BookingSuggestion[]>>(`/techops/schedules/${scheduleId}/booking-suggestions`);
  return res.data.data;
}

// ── 項目 ────────────────────────────────────────────────────
export async function createItem(scheduleId: string, body: Record<string, unknown>): Promise<ScheduleItem> {
  const res = await api.post<Envelope<ScheduleItem>>(`/techops/schedules/${scheduleId}/items`, body);
  return res.data.data;
}
export async function updateItem(scheduleId: string, itemId: string, body: Record<string, unknown>): Promise<ScheduleItem> {
  const res = await api.put<Envelope<ScheduleItem>>(`/techops/schedules/${scheduleId}/items/${itemId}`, body);
  return res.data.data;
}
export async function deleteItem(scheduleId: string, itemId: string): Promise<void> {
  await api.delete(`/techops/schedules/${scheduleId}/items/${itemId}`);
}
export async function bulkUpdateItems(scheduleId: string, items: Record<string, unknown>[]): Promise<ScheduleItem[]> {
  const res = await api.put<Envelope<{ items: ScheduleItem[] }>>(`/techops/schedules/${scheduleId}/items/bulk`, { items });
  return res.data.data.items;
}

// ── 台本への橋 ──────────────────────────────────────────────
export async function createAndLinkDocument(scheduleId: string, itemId: string): Promise<{ item: ScheduleItem; document: { id: string } }> {
  const res = await api.post<Envelope<{ item: ScheduleItem; document: { id: string } }>>(`/techops/schedules/${scheduleId}/items/${itemId}/qsheet`);
  return res.data.data;
}
export async function setDocumentLink(scheduleId: string, itemId: string, documentId: string | null): Promise<ScheduleItem> {
  const res = await api.put<Envelope<ScheduleItem>>(`/techops/schedules/${scheduleId}/items/${itemId}/qsheet`, { qsheet_document_id: documentId });
  return res.data.data;
}

// ── ブレイクダウン ──────────────────────────────────────────
export async function getBreakdown(scheduleId: string): Promise<ItemBreakdown[]> {
  const res = await api.get<Envelope<ItemBreakdown[]>>(`/techops/schedules/${scheduleId}/breakdown`);
  return res.data.data;
}

// ── ひな形 ──────────────────────────────────────────────────
export async function listTemplates(locationId?: string | null): Promise<ScheduleTemplate[]> {
  const res = await api.get<Envelope<ScheduleTemplate[]>>("/techops/schedule-templates", { params: locationId ? { location_id: locationId } : {} });
  return res.data.data;
}
export async function previewTemplate(templateId: string, scheduleId: string, onairStartMin: number | null): Promise<ApplyPreview> {
  const res = await api.post<Envelope<ApplyPreview>>(`/techops/schedule-templates/${templateId}/preview`, { schedule_id: scheduleId, onair_start_min: onairStartMin });
  return res.data.data;
}
export interface ApplyResult { created_columns: number; created_items: number; skipped: string[] }
export async function applyTemplate(
  scheduleId: string, templateId: string, columnIds: string[], itemIds: string[], onairStartMin: number | null,
): Promise<ApplyResult> {
  const res = await api.post<Envelope<ApplyResult>>(`/techops/schedules/${scheduleId}/apply-template`, {
    template_id: templateId, column_ids: columnIds, item_ids: itemIds, onair_start_min: onairStartMin,
  });
  return res.data.data;
}
