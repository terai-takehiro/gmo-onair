/**
 * テロップCG（graphics ミニアプリ）の API 呼び出しと型。
 *
 * サーバー側（server/src/contexts/qsheet 配下・並行作業）との契約:
 *   POST /graphics/projects/resolve            … owner から CGプロジェクトを取得または作成
 *   GET  /graphics/projects/:id                … プロジェクト＋ページ＋cue を1本で
 *   POST /graphics/projects/:id/pages          … ページ作成
 *   PUT  /graphics/pages/:id                   … ページ更新
 *   DELETE /graphics/pages/:id                 … ページ削除
 *   POST /graphics/projects/:id/cue            … スロットの cue を差し替え（TAKE / OUT）
 *   GET  /graphics/projects/:id/output         … 公開・認証なし（出力画面と 30s ポーリング用）
 *
 * スロット（1スロット1枚）と部品（partKey）の考え方は docs/design/v4/graphics.md §2。
 */
import api from '@/lib/api';

/** 役割名で固定したスロット。並び順もこの順（送出コンソールのレーン表示に使う） */
export const GRAPHICS_SLOTS = ['fullscreen', 'lower', 'side', 'ticker', 'clock', 'flash'] as const;
export type GraphicsSlot = (typeof GRAPHICS_SLOTS)[number];

export const SLOT_LABELS: Record<GraphicsSlot, string> = {
  fullscreen: 'フルスクリーン',
  lower: '下部テロップ',
  side: 'サイドスーパー',
  ticker: 'ティッカー',
  clock: '時計・カウント',
  flash: '速報',
};

export type GraphicsPartKey =
  | 'name' | 'title' | 'list' | 'ticker' | 'countdown' | 'score' | 'flash' | 'side' | 'vote';

export const PART_LABELS: Record<GraphicsPartKey, string> = {
  name: 'ネーム',
  title: '題字',
  list: '一覧表',
  ticker: 'ティッカー',
  countdown: 'カウントダウン・時計',
  score: 'スコア',
  flash: '速報帯',
  side: 'サイドスーパー',
  vote: '投票・クイズ',
};

/** 部品を置くスロットの既定（ページ作成フォームの初期値に使う） */
export const PART_DEFAULT_SLOT: Record<GraphicsPartKey, GraphicsSlot> = {
  name: 'lower',
  title: 'fullscreen',
  list: 'fullscreen',
  ticker: 'ticker',
  countdown: 'clock',
  score: 'side',
  flash: 'flash',
  side: 'side',
  vote: 'fullscreen',
};

export type GraphicsProofState = 'draft' | 'unproofed' | 'proofed';

export const PROOF_LABELS: Record<GraphicsProofState, string> = {
  draft: '未完成',
  unproofed: '未確認',
  proofed: '確認済',
};

export interface GraphicsProjectRow {
  id: string;
  name: string;
  ownerType: 'project' | 'program';
  ownerId: string;
}

export interface GraphicsPageRow {
  id: string;
  projectId: string;
  /** コールアップ番号（例: 201）。テンキー呼出に使う */
  callNo: number;
  slot: GraphicsSlot;
  partKey: GraphicsPartKey;
  name: string;
  /** 部品ごとの中身（ネームなら title / name など）。形は部品が決める */
  fields: Record<string, unknown>;
  proofState: GraphicsProofState;
  sortOrder: number;
}

export interface GraphicsCueRow {
  slot: GraphicsSlot;
  pageId: string | null;
  isLive: boolean;
  takenAt: string | null;
}

export interface GraphicsBundle {
  project: GraphicsProjectRow;
  pages: GraphicsPageRow[];
  cues: GraphicsCueRow[];
}

/** owner（案件 or 番組）から CGプロジェクトを取得または作成する */
export async function resolveGraphicsProject(
  ownerType: 'project' | 'program',
  ownerId: string,
  name?: string,
): Promise<GraphicsBundle> {
  const { data } = await api.post('/graphics/projects/resolve', { ownerType, ownerId, name });
  return data.data;
}

export async function getGraphicsProject(projectId: string): Promise<GraphicsBundle> {
  const { data } = await api.get(`/graphics/projects/${encodeURIComponent(projectId)}`);
  return data.data;
}

export interface GraphicsPageInput {
  name: string;
  slot: GraphicsSlot;
  partKey: GraphicsPartKey;
  fields: Record<string, unknown>;
  proofState?: GraphicsProofState;
}

export async function createGraphicsPage(projectId: string, input: GraphicsPageInput): Promise<GraphicsPageRow> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/pages`, input);
  return data.data;
}

export async function updateGraphicsPage(
  pageId: string,
  input: Partial<GraphicsPageInput>,
): Promise<GraphicsPageRow> {
  const { data } = await api.put(`/graphics/pages/${encodeURIComponent(pageId)}`, input);
  return data.data;
}

export async function deleteGraphicsPage(pageId: string): Promise<void> {
  await api.delete(`/graphics/pages/${encodeURIComponent(pageId)}`);
}

/** スロットの cue を差し替える（pageId=null で OUT）。REST 経由の口 — 本番はソケットの `cg:set` を使う */
export async function setGraphicsCue(
  projectId: string,
  slot: GraphicsSlot,
  pageId: string | null,
): Promise<GraphicsCueRow[]> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/cue`, { slot, pageId });
  return data.data;
}

export interface GraphicsOutputBundle extends GraphicsBundle {
  /** サーバー時刻（ISO）。時計・カウントダウンの skew 補正に使う */
  serverNow: string;
}

/**
 * 出力画面用の公開エンドポイント（認証なし）。axios のインスタンス（認証ヘッダー付き）を
 * 通さず素の fetch で読む — 旧 `client-awards/OutputPage.tsx` と同じ作法。
 */
export async function fetchGraphicsOutput(projectId: string): Promise<GraphicsOutputBundle | null> {
  const res = await fetch(`/api/v1/internal/graphics/projects/${encodeURIComponent(projectId)}/output`);
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data ?? null) as GraphicsOutputBundle | null;
}

/** 出力画面の URL（OBS のブラウザソースに貼る・ログイン不要） */
export function graphicsOutputPath(projectId: string, opts?: { bg?: boolean }): string {
  const base = `/techops/graphics/output/${encodeURIComponent(projectId)}`;
  return opts?.bg ? `${base}?bg=1` : base;
}
