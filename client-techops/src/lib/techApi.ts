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
  TechRowMutationResponse,
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
// 行の書き込みはサーバーが親の資料の `updated_at` も進める。その値（`doc_updated_at`）を
// 一緒に返すので、呼ぶ側（`useTechDoc`）は `detail.doc.updated_at` を合わせること
// （古いままだと次の名前の保存が `expected_updated_at` 違いで 409 になる）。

export interface RowResult<T> {
  data: T;
  /** 書き込みで進んだ親の資料の `updated_at` */
  doc_updated_at: string;
}

async function rowResult<T>(req: Promise<{ data: TechRowMutationResponse<T> }>): Promise<RowResult<T>> {
  const res = await req;
  return { data: res.data.data, doc_updated_at: res.data.doc_updated_at };
}

export type PatchRowPayload = Partial<Omit<TechPatchRow, "id" | "tech_doc_id" | "created_at" | "updated_at">>;

export function createPatchRow(docId: string, payload: PatchRowPayload): Promise<RowResult<TechPatchRow>> {
  return rowResult(api.post<TechRowMutationResponse<TechPatchRow>>(`/techops/tech-docs/${docId}/patch-rows`, payload));
}

export function updatePatchRow(docId: string, rowId: string, patch: PatchRowPayload): Promise<RowResult<TechPatchRow>> {
  return rowResult(api.patch<TechRowMutationResponse<TechPatchRow>>(`/techops/tech-docs/${docId}/patch-rows/${rowId}`, patch));
}

export function deletePatchRow(docId: string, rowId: string): Promise<RowResult<{ id: string }>> {
  return rowResult(api.delete<TechRowMutationResponse<{ id: string }>>(`/techops/tech-docs/${docId}/patch-rows/${rowId}`));
}

/** id の配列順に `sort_order` を振り直す */
export function reorderPatchRows(docId: string, order: string[]): Promise<RowResult<TechPatchRow[]>> {
  return rowResult(api.patch<TechRowMutationResponse<TechPatchRow[]>>(`/techops/tech-docs/${docId}/patch-rows`, { order }));
}

// ── 技術スタッフの行 ─────────────────────────────────────

export type StaffRowPayload = Partial<Omit<TechStaffRow, "id" | "tech_doc_id" | "created_at" | "updated_at">>;

export function createStaffRow(docId: string, payload: StaffRowPayload): Promise<RowResult<TechStaffRow>> {
  return rowResult(api.post<TechRowMutationResponse<TechStaffRow>>(`/techops/tech-docs/${docId}/staff-rows`, payload));
}

export function updateStaffRow(docId: string, rowId: string, patch: StaffRowPayload): Promise<RowResult<TechStaffRow>> {
  return rowResult(api.patch<TechRowMutationResponse<TechStaffRow>>(`/techops/tech-docs/${docId}/staff-rows/${rowId}`, patch));
}

export function deleteStaffRow(docId: string, rowId: string): Promise<RowResult<{ id: string }>> {
  return rowResult(api.delete<TechRowMutationResponse<{ id: string }>>(`/techops/tech-docs/${docId}/staff-rows/${rowId}`));
}

/** 作業日の中での並び（id の配列順に `sort_order` を振り直す） */
export function reorderStaffRows(docId: string, order: string[]): Promise<RowResult<TechStaffRow[]>> {
  return rowResult(api.patch<TechRowMutationResponse<TechStaffRow[]>>(`/techops/tech-docs/${docId}/staff-rows`, { order }));
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

// ── 会社と人（⑥・読みは reader・編集は manager。会社は取引先 companies） ──

/**
 * `include` は絞り込みに関わらず必ず一覧へ出す会社の id
 * （「会社を追加」で再利用した顧客専用の取引先を、追加した直後だけ選べるようにする）。
 */
export async function listTechCompanies(params?: { include?: string[] }): Promise<TechCompany[]> {
  const include = (params?.include ?? []).filter((id) => id.trim() !== "");
  const qs = include.length > 0 ? `?${include.map((id) => `include=${encodeURIComponent(id)}`).join("&")}` : "";
  const res = await api.get<Envelope<TechCompany[]>>(`/techops/tech-companies${qs}`);
  return res.data.data;
}

/**
 * 会社を足すときの中身。会社は**案件管理の取引先（`companies`）**そのもので（§13-5）、
 * ここから足すと取引先に仕入先として登録される（同じ名前があればそれが返る）。
 * 名前の変更・削除は案件管理で行うので、techops には口が無い。
 */
export interface TechCompanyPayload {
  name: string;
  short_name?: string;
}

export async function createTechCompany(payload: TechCompanyPayload): Promise<TechCompany> {
  const res = await api.post<Envelope<TechCompany>>("/techops/tech-companies", payload);
  return res.data.data;
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
