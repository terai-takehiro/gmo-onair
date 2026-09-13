// 会場図面（新ミニアプリ）— API 呼び出しの薄いラッパー。`manualApi.ts` と同じ形
// （契約: docs/design/v4/venue-layout.md §5-4）。
import api from "@/lib/api";
import type {
  VenueArea,
  VenueCatalogItem,
  VenueFloor,
  VenueItem,
  VenueLayoutDetail,
  VenueLayoutSummary,
} from "@gmo-onair/shared/src/venue/types";

interface Envelope<T> { success: boolean; data: T }
interface ApiConflict {
  response?: {
    status?: number;
    data?: {
      error?: {
        code?: string;
        current_updated_at?: string;
        updated_by_name?: string | null;
        locked_by?: string | null;
        locked_by_name?: string | null;
      };
    };
  };
}

/** 保存の衝突（`ConflictError`・code: 'CONFLICT'）。編集ロックの取り合い（'LOCKED'）とは別（`manualApi.ts` と同じ理屈） */
export function isConflict(err: unknown): boolean {
  const e = err as ApiConflict;
  return e?.response?.status === 409 && e?.response?.data?.error?.code !== "LOCKED";
}
export function conflictInfo(err: unknown): { current_updated_at?: string; updated_by_name?: string | null } {
  const e = err as ApiConflict;
  return e?.response?.data?.error ?? {};
}

/** 編集ロックを取れなかった／取り上げられた／確定済みだった（409 LOCKED） */
export function isLockError(err: unknown): boolean {
  const e = err as ApiConflict;
  return e?.response?.status === 409 && e?.response?.data?.error?.code === "LOCKED";
}
export function lockErrorInfo(err: unknown): { locked_by?: string | null; locked_by_name?: string | null } {
  const e = err as ApiConflict;
  return e?.response?.data?.error ?? {};
}

// ── 図面 ────────────────────────────────────────────────

export interface ListVenueLayoutsParams {
  project?: string;
  program?: string;
}
export async function listVenueLayouts(params: ListVenueLayoutsParams): Promise<VenueLayoutSummary[]> {
  const res = await api.get<Envelope<VenueLayoutSummary[]>>("/techops/venue-layouts", { params });
  return res.data.data;
}

export async function getVenueLayout(id: string): Promise<VenueLayoutDetail> {
  const res = await api.get<Envelope<VenueLayoutDetail>>(`/techops/venue-layouts/${id}`);
  return res.data.data;
}

export interface CreateVenueLayoutPayload {
  title: string;
  /** どちらか一方のみ（qsheet_venue_layouts_owner_ck） */
  project_id?: string | null;
  program_id?: string | null;
  floor_id: string;
  area_id?: string | null;
  plan_label?: string | null;
  /** 前の図面から複製するとき（ひな形も同じ経路。§6①） */
  copy_from?: string;
}
export async function createVenueLayout(payload: CreateVenueLayoutPayload): Promise<VenueLayoutSummary> {
  const res = await api.post<Envelope<VenueLayoutSummary>>("/techops/venue-layouts", payload);
  return res.data.data;
}

export interface UpdateVenueLayoutPayload {
  title?: string;
  plan_label?: string | null;
  area_id?: string | null;
  expected_updated_at?: string;
}
export async function updateVenueLayout(id: string, patch: UpdateVenueLayoutPayload): Promise<VenueLayoutSummary> {
  const res = await api.patch<Envelope<VenueLayoutSummary>>(`/techops/venue-layouts/${id}`, patch);
  return res.data.data;
}

/** `items` を丸ごと置換（§5-6。自動保存の本体）。`expected_updated_at` 必須 */
export async function updateVenueItems(id: string, items: VenueItem[], expectedUpdatedAt: string): Promise<VenueLayoutDetail> {
  const res = await api.put<Envelope<VenueLayoutDetail>>(`/techops/venue-layouts/${id}/items`, {
    items,
    expected_updated_at: expectedUpdatedAt,
  });
  return res.data.data;
}

export async function copyVenueLayout(id: string, payload: { title: string; plan_label?: string | null }): Promise<VenueLayoutSummary> {
  const res = await api.post<Envelope<VenueLayoutSummary>>(`/techops/venue-layouts/${id}/copy`, payload);
  return res.data.data;
}

export async function deleteVenueLayout(id: string): Promise<void> {
  await api.delete(`/techops/venue-layouts/${id}`);
}

/** 確定（manager 限定）。rev +1・以後の運営マニュアルへの差し込みはこの版で凍る */
export async function fixVenueLayout(id: string): Promise<void> {
  await api.post(`/techops/venue-layouts/${id}/fix`);
}
export async function unfixVenueLayout(id: string): Promise<void> {
  await api.post(`/techops/venue-layouts/${id}/unfix`);
}

// ── 編集ロック（§5-6。`manualApi.ts` の4本と同じ契約: 取れた／取れなかったも 200） ──

export interface VenueLockState {
  lockedBy: string | null;
  lockedByName?: string | null;
  lockedAt: string | null;
  lockRequestedBy?: string | null;
  lockRequestedByName?: string | null;
  lockRequestedAt?: string | null;
}
export interface LockVenueLayoutResult {
  acquired: boolean;
  layout: VenueLockState;
}

/** ロックを取る。60秒ごとのハートビートも兼ねる */
export async function lockVenueLayout(id: string): Promise<LockVenueLayoutResult> {
  const res = await api.post<Envelope<LockVenueLayoutResult>>(`/techops/venue-layouts/${id}/lock`);
  return res.data.data;
}
export async function unlockVenueLayout(id: string): Promise<VenueLockState> {
  const res = await api.delete<Envelope<VenueLockState>>(`/techops/venue-layouts/${id}/lock`);
  return res.data.data;
}
export async function takeoverVenueLayoutLock(id: string): Promise<VenueLockState> {
  const res = await api.post<Envelope<VenueLockState>>(`/techops/venue-layouts/${id}/lock/takeover`);
  return res.data.data;
}
export async function requestVenueLayoutLockHandoff(id: string): Promise<VenueLockState> {
  const res = await api.post<Envelope<VenueLockState>>(`/techops/venue-layouts/${id}/lock/request`);
  return res.data.data;
}

// ── 会場・階・カタログ（読み取り専用。段F=会場管理画面はスコープ外） ────────────

export async function listVenueFloors(): Promise<(VenueFloor & { areas: VenueArea[] })[]> {
  const res = await api.get<Envelope<(VenueFloor & { areas: VenueArea[] })[]>>("/techops/venue-floors");
  return res.data.data;
}

export async function listVenueCatalog(): Promise<VenueCatalogItem[]> {
  const res = await api.get<Envelope<VenueCatalogItem[]>>("/techops/venue-catalog");
  return res.data.data;
}
