// 運営マニュアル — API 呼び出しの薄いラッパー。`scheduleApi.ts` と同じ形
// （契約: docs/design/v4/production-manual.md §5・段A）。
import api from "@/lib/api";
import type { ManualListItem, ManualDetail, ManualPage } from "@gmo-onair/shared/src/opsmanual/types";

interface Envelope<T> { success: boolean; data: T }
interface ApiConflict {
  response?: { status?: number; data?: { error?: { code?: string; current_updated_at?: string; updated_by_name?: string | null } } };
}
export function isConflict(err: unknown): boolean {
  const e = err as ApiConflict;
  return e?.response?.status === 409;
}
export function conflictInfo(err: unknown): { current_updated_at?: string; updated_by_name?: string | null } {
  const e = err as ApiConflict;
  return e?.response?.data?.error ?? {};
}

export interface ListManualsParams {
  project_id?: string;
  program_id?: string;
  status?: string;
  search?: string;
}
export async function listManuals(params: ListManualsParams): Promise<ManualListItem[]> {
  const res = await api.get<Envelope<ManualListItem[]>>("/techops/manuals", { params });
  return res.data.data;
}

export async function getManual(id: string): Promise<ManualDetail> {
  const res = await api.get<Envelope<ManualDetail>>(`/techops/manuals/${id}`);
  return res.data.data;
}

export interface CreateManualPayload {
  title: string;
  /** どちらか一方のみ（qsheet_manuals_owner_ck） */
  project_id?: string | null;
  program_id?: string | null;
}
export async function createManual(payload: CreateManualPayload): Promise<ManualListItem> {
  const res = await api.post<Envelope<ManualListItem>>("/techops/manuals", payload);
  return res.data.data;
}

export async function updateManual(id: string, patch: Record<string, unknown>): Promise<ManualListItem> {
  const res = await api.patch<Envelope<ManualListItem>>(`/techops/manuals/${id}`, patch);
  return res.data.data;
}

export async function deleteManual(id: string): Promise<void> {
  await api.delete(`/techops/manuals/${id}`);
}

// ── ページ ──────────────────────────────────────────────────
export interface PagePayload { title?: string; chapter?: string | null }

export async function addPage(manualId: string, payload: PagePayload): Promise<ManualPage> {
  const res = await api.post<Envelope<ManualPage>>(`/techops/manuals/${manualId}/pages`, payload);
  return res.data.data;
}
export async function updatePage(manualId: string, pageId: string, payload: PagePayload): Promise<ManualPage> {
  const res = await api.put<Envelope<ManualPage>>(`/techops/manuals/${manualId}/pages/${pageId}`, payload);
  return res.data.data;
}
export async function deletePage(manualId: string, pageId: string): Promise<void> {
  await api.delete(`/techops/manuals/${manualId}/pages/${pageId}`);
}
export async function reorderPages(manualId: string, order: { id: string; sort_order: number }[]): Promise<ManualPage[]> {
  const res = await api.post<Envelope<ManualPage[]>>(`/techops/manuals/${manualId}/pages/reorder`, { order });
  return res.data.data;
}
