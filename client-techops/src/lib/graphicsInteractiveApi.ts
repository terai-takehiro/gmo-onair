// テロップCG — 外部インタラクティブ連携（段6-7）の API 呼び出しと型。
// `graphicsSoundsApi.ts` と同じ書き方（`graphicsApi.ts`/`graphicsTemplateApi.ts` からの切り出し方針）。
//
// サーバー側の契約（並行実装・段6-7。`server/src/contexts/graphics/services/interactive-bridge.service.ts`
// と migration 258 `graphics_projects.interactive_link` が正）:
//   PUT    /graphics/projects/:id/interactive-link … 連携設定の保存（作成/更新）
//   GET    /graphics/projects/:id/interactive-link … 連携設定の取得（**マスク済み**）
//   DELETE /graphics/projects/:id/interactive-link … 連携解除（設定を削除）
//   POST   /graphics/pages/:id/vote/sync-interactive   … 投票ページの設問・選択肢を外部へ同期し
//                                                          `fields.interactiveQuestionId` を発行・保存
//   POST   /graphics/pages/:id/vote/dismiss-interactive … 外部連携の解除（`interactiveQuestionId` を外す）
//
// `apiKeySecret` はマスク対象（サーバーは `apiKeyPrefix`＝先頭12文字だけを返す）。
// 保存フォームは「未入力＝変更しない」（`LiveOrgSettingsPage.tsx` の Zoom/Teams 資格情報と同じ作法）。
import api from '@/lib/api';

/** 保存済みの連携設定（マスク済み表示用）。`configured: false` は未設定 */
export interface InteractiveLinkView {
  configured: true;
  baseUrl: string;
  /** マスク表示用の先頭部分（例: `ak_xxxxxxxx`）。鍵そのものはクライアントに返らない */
  apiKeyPrefix: string | null;
  interactiveEventId: string;
  closeBufferSeconds: number;
  autoControl: boolean;
}
export interface InteractiveLinkUnconfigured {
  configured: false;
}
export type InteractiveLinkState = InteractiveLinkView | InteractiveLinkUnconfigured;

export interface InteractiveLinkInput {
  baseUrl: string;
  /**
   * 新しく入力されたときだけ送る。空欄（未入力）のまま保存すると、サーバー側は
   * 既存の鍵をそのまま使う（`ZoomSettingsSection.tsx` と同じ「未入力＝変更しない」作法）。
   */
  apiKeySecret?: string;
  interactiveEventId: string;
  closeBufferSeconds: number;
  autoControl: boolean;
}

export async function fetchInteractiveLink(projectId: string | number): Promise<InteractiveLinkState> {
  const { data } = await api.get(`/graphics/projects/${encodeURIComponent(String(projectId))}/interactive-link`);
  return data.data;
}

export async function saveInteractiveLink(
  projectId: string | number,
  input: InteractiveLinkInput,
): Promise<InteractiveLinkView> {
  const { data } = await api.put(
    `/graphics/projects/${encodeURIComponent(String(projectId))}/interactive-link`,
    input,
  );
  return data.data;
}

export async function deleteInteractiveLink(projectId: string | number): Promise<void> {
  await api.delete(`/graphics/projects/${encodeURIComponent(String(projectId))}/interactive-link`);
}

export interface SyncInteractiveVoteResult {
  interactiveQuestionId: string;
}

/** 投票ページの設問・選択肢を外部インタラクティブへ同期する（`interactiveQuestionId` を発行・保存） */
export async function syncInteractiveVote(pageId: string | number): Promise<SyncInteractiveVoteResult> {
  const { data } = await api.post(`/graphics/pages/${encodeURIComponent(String(pageId))}/vote/sync-interactive`);
  return data.data;
}

/** 外部インタラクティブとの連携を解除する（`fields.interactiveQuestionId` を外す） */
export async function dismissInteractiveVote(pageId: string | number): Promise<void> {
  await api.post(`/graphics/pages/${encodeURIComponent(String(pageId))}/vote/dismiss-interactive`);
}
