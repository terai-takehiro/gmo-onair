// 技術資料（新ミニアプリ）— API 呼び出しの薄いラッパー。`venueApi.ts` と同じ形
// （契約: docs/design/v4/tech-docs.md §5-5 と `spec/impl-contract.md` の API 表）。
// 道は `/techops/...` で書く（サーバーは `/qsheet` と `/techops` の二重マウント）。
import api from "@/lib/api";
import type {
  PatchDeviceOption,
  PatchJack,
  PatchPanel,
  PatchPanelDetail,
  PatchPanelListItem,
  TechCompany,
  TechDoc,
  TechDocDetail,
  TechDocListItem,
  TechPatchRow,
  TechPerson,
  TechStaffRow,
} from "@gmo-onair/shared/src/tech/types";

interface Envelope<T> { success: boolean; data: T }

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: {
      // `{ error: 'conflict' }`（契約の書き方）と `{ error: { code: 'CONFLICT' } }`（既存の口）の両方を受ける
      error?: string | {
        code?: string;
        current_updated_at?: string;
        updated_by_name?: string | null;
        locked_by?: string | null;
        locked_by_name?: string | null;
      };
    };
  };
}

function errorBody(err: unknown): { code: string; detail: Record<string, unknown> } {
  const e = err as ApiErrorShape;
  const raw = e?.response?.data?.error;
  if (typeof raw === "string") return { code: raw.toUpperCase(), detail: {} };
  return { code: (raw?.code ?? "").toUpperCase(), detail: (raw ?? {}) as Record<string, unknown> };
}

/** 保存の衝突（楽観ロック・`expected_updated_at` 違い）。編集ロックの取り合いとは別 */
export function isConflict(err: unknown): boolean {
  const e = err as ApiErrorShape;
  if (e?.response?.status !== 409) return false;
  return errorBody(err).code !== "LOCKED";
}

export function conflictInfo(err: unknown): { current_updated_at?: string; updated_by_name?: string | null } {
  return errorBody(err).detail as { current_updated_at?: string; updated_by_name?: string | null };
}

/** 編集ロックを取れなかった／取り上げられた／確定済みだった（409 LOCKED） */
export function isLockError(err: unknown): boolean {
  const e = err as ApiErrorShape;
  return e?.response?.status === 409 && errorBody(err).code === "LOCKED";
}

export function lockErrorInfo(err: unknown): { locked_by?: string | null; locked_by_name?: string | null } {
  return errorBody(err).detail as { locked_by?: string | null; locked_by_name?: string | null };
}

// ── 資料 ────────────────────────────────────────────────

export interface ListTechDocsParams {
  /** 案件 ID か管理番号 */
  project?: string;
  program?: string;
}
export async function listTechDocs(params: ListTechDocsParams): Promise<TechDocListItem[]> {
  const res = await api.get<Envelope<TechDocListItem[]>>("/techops/tech-docs", { params });
  return res.data.data;
}

export async function getTechDoc(id: string): Promise<TechDocDetail> {
  const res = await api.get<Envelope<TechDocDetail>>(`/techops/tech-docs/${id}`);
  return res.data.data;
}

export interface CreateTechDocPayload {
  title: string;
  /** どちらか一方のみ（qsheet_tech_docs_owner_ck） */
  project_id?: string | null;
  program_id?: string | null;
  /** 前の資料を複製するとき。行を全部写して status=draft・rev=0 で作る */
  copy_from?: string;
}
export async function createTechDoc(payload: CreateTechDocPayload): Promise<TechDoc> {
  const res = await api.post<Envelope<TechDoc>>("/techops/tech-docs", payload);
  return res.data.data;
}

export interface UpdateTechDocPayload {
  title?: string;
  /** 楽観ロック。違えば 409（`isConflict`） */
  expected_updated_at?: string;
}
export async function updateTechDoc(id: string, patch: UpdateTechDocPayload): Promise<TechDoc> {
  const res = await api.patch<Envelope<TechDoc>>(`/techops/tech-docs/${id}`, patch);
  return res.data.data;
}

export async function deleteTechDoc(id: string): Promise<void> {
  await api.delete(`/techops/tech-docs/${id}`);
}

// ── 映像パッチの行 ───────────────────────────────────────

export type PatchRowPayload = Partial<Omit<TechPatchRow, "id" | "tech_doc_id" | "created_at" | "updated_at">>;

export async function createPatchRow(docId: string, payload: PatchRowPayload): Promise<TechPatchRow> {
  const res = await api.post<Envelope<TechPatchRow>>(`/techops/tech-docs/${docId}/patch-rows`, payload);
  return res.data.data;
}

export async function updatePatchRow(docId: string, rowId: string, patch: PatchRowPayload): Promise<TechPatchRow> {
  const res = await api.patch<Envelope<TechPatchRow>>(`/techops/tech-docs/${docId}/patch-rows/${rowId}`, patch);
  return res.data.data;
}

export async function deletePatchRow(docId: string, rowId: string): Promise<void> {
  await api.delete(`/techops/tech-docs/${docId}/patch-rows/${rowId}`);
}

/** id の配列順に `sort_order` を振り直す */
export async function reorderPatchRows(docId: string, order: string[]): Promise<TechPatchRow[]> {
  const res = await api.patch<Envelope<TechPatchRow[]>>(`/techops/tech-docs/${docId}/patch-rows`, { order });
  return res.data.data;
}

// ── 技術スタッフの行 ─────────────────────────────────────

export type StaffRowPayload = Partial<Omit<TechStaffRow, "id" | "tech_doc_id" | "created_at" | "updated_at">>;

export async function createStaffRow(docId: string, payload: StaffRowPayload): Promise<TechStaffRow> {
  const res = await api.post<Envelope<TechStaffRow>>(`/techops/tech-docs/${docId}/staff-rows`, payload);
  return res.data.data;
}

export async function updateStaffRow(docId: string, rowId: string, patch: StaffRowPayload): Promise<TechStaffRow> {
  const res = await api.patch<Envelope<TechStaffRow>>(`/techops/tech-docs/${docId}/staff-rows/${rowId}`, patch);
  return res.data.data;
}

export async function deleteStaffRow(docId: string, rowId: string): Promise<void> {
  await api.delete(`/techops/tech-docs/${docId}/staff-rows/${rowId}`);
}

/** 作業日の中での並び（id の配列順に `sort_order` を振り直す） */
export async function reorderStaffRows(docId: string, order: string[]): Promise<TechStaffRow[]> {
  const res = await api.patch<Envelope<TechStaffRow[]>>(`/techops/tech-docs/${docId}/staff-rows`, { order });
  return res.data.data;
}

// ── 確定・編集ロック（manager／editor） ────────────────────

/** 確定（manager）。`rev` +1・`fixed_at`/`fixed_by` が入る */
export async function fixTechDoc(id: string): Promise<TechDoc> {
  const res = await api.post<Envelope<TechDoc>>(`/techops/tech-docs/${id}/fix`);
  return res.data.data;
}
export async function unfixTechDoc(id: string): Promise<TechDoc> {
  const res = await api.post<Envelope<TechDoc>>(`/techops/tech-docs/${id}/unfix`);
  return res.data.data;
}

/** ロックを取る。60秒ごとのハートビートも兼ねる。取れなければ 409（`isLockError`） */
export async function lockTechDoc(id: string): Promise<TechDoc> {
  const res = await api.post<Envelope<TechDoc>>(`/techops/tech-docs/${id}/lock`);
  return res.data.data;
}
export async function unlockTechDoc(id: string): Promise<TechDoc> {
  const res = await api.delete<Envelope<TechDoc>>(`/techops/tech-docs/${id}/lock`);
  return res.data.data;
}
/** 引き継ぎを要求する（記録だけ。相手の画面に出る） */
export async function requestTechDocLock(id: string): Promise<TechDoc> {
  const res = await api.post<Envelope<TechDoc>>(`/techops/tech-docs/${id}/lock/request`);
  return res.data.data;
}
/** 強制的に引き継ぐ（manager） */
export async function takeoverTechDocLock(id: string): Promise<TechDoc> {
  const res = await api.post<Envelope<TechDoc>>(`/techops/tech-docs/${id}/lock/takeover`);
  return res.data.data;
}

// ── パッチ盤（⑤・読みは reader・編集は manager） ─────────────

export async function listPatchPanels(): Promise<PatchPanelListItem[]> {
  const res = await api.get<Envelope<PatchPanelListItem[]>>("/techops/tech-panels");
  return res.data.data;
}

/** 機材の候補（盤に転記済みの機材名を束ねたもの）。`/:id` より先に定義された口 */
export async function listPatchDevices(): Promise<PatchDeviceOption[]> {
  const res = await api.get<Envelope<PatchDeviceOption[]>>("/techops/tech-panels/devices");
  return res.data.data;
}

export async function getPatchPanel(id: string): Promise<PatchPanelDetail> {
  const res = await api.get<Envelope<PatchPanelDetail>>(`/techops/tech-panels/${id}`);
  return res.data.data;
}

export interface CreatePatchPanelPayload {
  name: string;
  jack_count: 32 | 48;
  kind: PatchPanel["kind"];
  location: string;
  model: string;
}
export async function createPatchPanel(payload: CreatePatchPanelPayload): Promise<PatchPanel> {
  const res = await api.post<Envelope<PatchPanel>>("/techops/tech-panels", payload);
  return res.data.data;
}

export type UpdatePatchPanelPayload = Partial<Pick<PatchPanel, "name" | "location" | "model" | "note">>;
export async function updatePatchPanel(id: string, patch: UpdatePatchPanelPayload): Promise<PatchPanel> {
  const res = await api.patch<Envelope<PatchPanel>>(`/techops/tech-panels/${id}`, patch);
  return res.data.data;
}

export type UpdatePatchJackPayload = Partial<Pick<PatchJack, "device_name" | "label" | "signal" | "area" | "note">>;
export async function updatePatchJack(panelId: string, jackId: string, patch: UpdatePatchJackPayload): Promise<PatchJack> {
  const res = await api.patch<Envelope<PatchJack>>(`/techops/tech-panels/${panelId}/jacks/${jackId}`, patch);
  return res.data.data;
}

// ── 会社と人（⑥・読みは reader・編集は manager） ──────────────

export async function listTechCompanies(): Promise<TechCompany[]> {
  const res = await api.get<Envelope<TechCompany[]>>("/techops/tech-companies");
  return res.data.data;
}

export type TechCompanyPayload = Partial<Omit<TechCompany, "id" | "person_count">> & { name?: string };

export async function createTechCompany(payload: TechCompanyPayload): Promise<TechCompany> {
  const res = await api.post<Envelope<TechCompany>>("/techops/tech-companies", payload);
  return res.data.data;
}
export async function updateTechCompany(id: string, patch: TechCompanyPayload): Promise<TechCompany> {
  const res = await api.patch<Envelope<TechCompany>>(`/techops/tech-companies/${id}`, patch);
  return res.data.data;
}
export async function deleteTechCompany(id: string): Promise<void> {
  await api.delete(`/techops/tech-companies/${id}`);
}

export interface ListTechPersonsParams {
  company?: string;
  q?: string;
  role?: string;
  /** 1 を渡すと、やめた人（active=false）も返る */
  include_inactive?: 1;
}
export async function listTechPersons(params: ListTechPersonsParams = {}): Promise<TechPerson[]> {
  const res = await api.get<Envelope<TechPerson[]>>("/techops/tech-persons", { params });
  return res.data.data;
}

export type TechPersonPayload = Partial<
  Omit<TechPerson, "id" | "participation_count" | "last_work_date" | "company_name" | "company_short_name">
>;

export async function createTechPerson(payload: TechPersonPayload): Promise<TechPerson> {
  const res = await api.post<Envelope<TechPerson>>("/techops/tech-persons", payload);
  return res.data.data;
}
export async function updateTechPerson(id: string, patch: TechPersonPayload): Promise<TechPerson> {
  const res = await api.patch<Envelope<TechPerson>>(`/techops/tech-persons/${id}`, patch);
  return res.data.data;
}
export async function deleteTechPerson(id: string): Promise<void> {
  await api.delete(`/techops/tech-persons/${id}`);
}
