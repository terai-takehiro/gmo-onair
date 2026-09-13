// 運営マニュアル — API 呼び出しの薄いラッパー。`scheduleApi.ts` と同じ形
// （契約: docs/design/v4/production-manual.md §5・段A）。
import api from "@/lib/api";
import type {
  ManualListItem,
  ManualDetail,
  ManualPage,
  ManualBlock,
  ManualLockState,
  ManualTemplateListItem,
} from "@gmo-onair/shared/src/opsmanual/types";

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
/**
 * 保存の衝突（楽観ロック。サーバーの `ConflictError`・code: 'CONFLICT'）。
 * 編集ロックの取り合い（`LockError`・code: 'LOCKED'。§6-2-1）とは**別の理由**なので、
 * ここでは 409 のうち LOCKED を除いたものだけを「保存の衝突」として扱う
 * （`isLockError` と合わせて使う。どちらも同じ 409 系統だが原因が違う——
 * `httpErrors.ts` の `LockError` のコメント参照）。
 */
export function isConflict(err: unknown): boolean {
  const e = err as ApiConflict;
  return e?.response?.status === 409 && e?.response?.data?.error?.code !== "LOCKED";
}
export function conflictInfo(err: unknown): { current_updated_at?: string; updated_by_name?: string | null } {
  const e = err as ApiConflict;
  return e?.response?.data?.error ?? {};
}

/** 編集ロックを取れなかった／取り上げられた／確定済みだった（409 LOCKED）。
 *  書き込み系エンドポイントが `assertEditable()` で拒否したときに返る。 */
export function isLockError(err: unknown): boolean {
  const e = err as ApiConflict;
  return e?.response?.status === 409 && e?.response?.data?.error?.code === "LOCKED";
}
export function lockErrorInfo(err: unknown): { locked_by?: string | null; locked_by_name?: string | null } {
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
  /** 本番/開催の予定日（YYYY-MM-DD）。省略可 */
  service_date?: string | null;
  /** 組織共通のひな形から作るとき（段E・§10-5「組織共通」）。`copy_from_manual_id` とは同時に渡さない */
  template_id?: string;
  /** この案件／番組の前回の冊子から複製して作るとき（段E・§10-5「前の案件の前の冊子から」）。
   *  サーバー側は同じ project_id/program_id の冊子だけを許可する */
  copy_from_manual_id?: string;
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
// `blocks`・`expected_updated_at` は段B（紙面の自動保存・楽観ロック）。
// サーバーは `expected_updated_at` が省略されたときは検査をせず素通しする
// （`checkOptimisticLock`）ので、渡さなくても壊れない。
export interface PagePayload {
  title?: string;
  chapter?: string | null;
  blocks?: ManualBlock[];
  expected_updated_at?: string;
}

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

// ── 編集ロック（段E・production-manual.md §6-2-1）─────────────────────
// 冊子まるごとの1本のロック。4本とも「取れた／取れなかった」を 200 のまま返す契約
// （エラーにしない）— 呼び出し側（`useManualEditLock.ts`）が応答を見て読み取り専用に
// 切り替える。書き込み系エンドポイントが返す 409 LockError とは別物（あちらは
// `isConflict`/`ConflictError` と同じ「取り合いの事故」の系統として扱う）。

export interface LockManualResult {
  /** 取れたか。取れなかったときも 200 で返り、`manual` が「いまの保持者」を教える */
  acquired: boolean;
  manual: ManualLockState;
}

/** ロックを取る。**60秒ごとのハートビートも兼ねる**——保持者本人が呼べば `locked_at` を今に更新するだけ */
export async function lockManual(manualId: string): Promise<LockManualResult> {
  const res = await api.post<Envelope<LockManualResult>>(`/techops/manuals/${manualId}/lock`);
  return res.data.data;
}

/** ロックを放す。自分が保持者のときだけ効く（他人が呼んでも何も起きない） */
export async function unlockManual(manualId: string): Promise<ManualLockState> {
  const res = await api.delete<Envelope<ManualLockState>>(`/techops/manuals/${manualId}/lock`);
  return res.data.data;
}

/** 強制的に引き継ぐ（manager のみ）。元の保持者は次のハートビートで気づく */
export async function takeoverManualLock(manualId: string): Promise<ManualLockState> {
  const res = await api.post<Envelope<ManualLockState>>(`/techops/manuals/${manualId}/lock/takeover`);
  return res.data.data;
}

/** 交代を申し出る。自分が保持者でないときだけ効く */
export async function requestManualLockHandoff(manualId: string): Promise<ManualLockState> {
  const res = await api.post<Envelope<ManualLockState>>(`/techops/manuals/${manualId}/lock/request`);
  return res.data.data;
}

// ── 確定・版（段E・production-manual.md §6⑤・§10-3）─────────────────────
// どちらも manager 限定。呼び出し側（`ManualPreviewPage.tsx`）は応答の中身を
// 使わず `GET /manuals/:id` を引き直して画面へ反映する契約なので、ここは戻り値を
// 持たない薄いラッパーのままにする。

/** 確定する。全ページの差し込みブロックを凍らせ、`status: "fixed"`・`rev` を +1 にする */
export async function fixManual(manualId: string): Promise<void> {
  await api.post(`/techops/manuals/${manualId}/fix`);
}

/** 確定を解く。`status: "draft"` に戻すだけ（`rev`・凍らせた中身は変えない） */
export async function unfixManual(manualId: string): Promise<void> {
  await api.post(`/techops/manuals/${manualId}/unfix`);
}

// ── ひな形（段E・production-manual.md §5-1・§10-5）───────────────────────
// v1 で作るのは scope="org"（組織共通）だけ。「前回の冊子から」は
// このAPIを経由せず `createManual` の `copyFromManualId` を使う別経路。

export interface CreateManualTemplatePayload {
  name: string;
  /** ひな形の元にする冊子（この冊子のページをそのままコピーする） */
  source_manual_id: string;
}

export async function listManualTemplates(): Promise<ManualTemplateListItem[]> {
  const res = await api.get<Envelope<ManualTemplateListItem[]>>("/techops/manual-templates");
  return res.data.data;
}

/** manager 限定。「この冊子をひな形として登録」の実装そのもの */
export async function createManualTemplate(payload: CreateManualTemplatePayload): Promise<ManualTemplateListItem> {
  const res = await api.post<Envelope<ManualTemplateListItem>>("/techops/manual-templates", payload);
  return res.data.data;
}
