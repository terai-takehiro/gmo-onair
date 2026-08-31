/**
 * テロップCG（graphics ミニアプリ）の API 呼び出しと型。
 *
 * サーバー側（server/src/contexts/qsheet 配下・並行作業）との契約:
 *   POST /graphics/projects/resolve            … owner から CGプロジェクトを取得または作成
 *   GET  /graphics/projects/:id                … プロジェクト＋ページ＋cue を1本で
 *   PUT  /graphics/projects/:id                … プロジェクトの部分更新（theme / name）
 *   POST /graphics/projects/:id/pages          … ページ作成
 *   PUT  /graphics/pages/:id                   … ページ更新
 *   DELETE /graphics/pages/:id                 … ページ削除
 *   POST /graphics/projects/:id/cue            … スロットの cue を差し替え（TAKE / OUT）
 *   GET  /graphics/projects/:id/output         … 公開・認証なし（出力画面と 30s ポーリング用）
 *   POST /graphics/projects/:id/requests       … 発注（テロ原）の新規作成
 *   GET  /graphics/projects/:id/requests       … 発注一覧（既定は status=requested のみ）
 *   PUT  /graphics/requests/:id                … 発注の状態更新（却下・ページ化での紐づけ）
 *   DELETE /graphics/requests/:id              … 発注の削除（誤操作の取消）
 *   POST /graphics/projects/:id/roster/preview … 名簿Excelのヘッダー・サンプル行を読む
 *   POST /graphics/projects/:id/roster/commit  … 名簿の全行をパースして一括ページ作成
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

/** プロジェクト単位の見た目テーマ。キーはサーバー（graphics_projects.theme）と出力側レンダラの契約 */
export type GraphicsThemeKey = 'ceremony-gold' | 'news-navy' | 'corporate-light' | 'variety-pop';

export const GRAPHICS_THEMES: { key: GraphicsThemeKey; label: string }[] = [
  { key: 'ceremony-gold', label: '式典（金）' },
  { key: 'news-navy', label: '報道（紺）' },
  { key: 'corporate-light', label: 'コーポレート' },
  { key: 'variety-pop', label: 'バラエティ' },
];

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
  /** 見た目テーマのキー（未知の値は既定テーマ扱いにする — レンダラ側の作法） */
  theme: string;
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

/** プロジェクトの部分更新（いまは theme / name のみ）。更新後の一式（bundle）が返る */
export async function updateGraphicsProject(
  projectId: string | number,
  input: { theme?: GraphicsThemeKey; name?: string },
): Promise<GraphicsBundle> {
  const { data } = await api.put(`/graphics/projects/${encodeURIComponent(String(projectId))}`, input);
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

// ── 発注（テロ原）— graphics.md §3・§9 段5 ──────────────────────────

export type GraphicsRequestStatus = 'requested' | 'converted' | 'dismissed';

export const REQUEST_STATUS_LABELS: Record<GraphicsRequestStatus, string> = {
  requested: '未対応',
  converted: 'ページ化済み',
  dismissed: '却下',
};

export interface GraphicsRequestRow {
  id: string;
  projectId: string;
  /** 出したい文言・要旨 */
  title: string;
  /** 用途・補足 */
  detail: string | null;
  desiredSlot: GraphicsSlot | null;
  desiredPartKey: GraphicsPartKey | null;
  /** 出すタイミングの自由記述（例:「オープニング映像の後」） */
  desiredTiming: string | null;
  requestedBy: string | null;
  status: GraphicsRequestStatus;
  convertedPageId: string | null;
  createdAt: string;
}

export interface GraphicsRequestInput {
  title: string;
  detail?: string;
  desiredSlot?: GraphicsSlot;
  desiredPartKey?: GraphicsPartKey;
  desiredTiming?: string;
}

export async function createGraphicsRequest(
  projectId: string,
  input: GraphicsRequestInput,
): Promise<GraphicsRequestRow> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/requests`, input);
  return data.data;
}

/** 発注一覧。status を省略すると未処理（`requested`）のみ返る（サーバー既定） */
/**
 * 発注一覧。`status` を省略すると未処理（`requested`）のみ（サーバー既定）。
 * `'all'` は「自分が出した発注」（却下・ページ化済みも含む履歴）を出すための特別値。
 */
export async function fetchGraphicsRequests(
  projectId: string,
  status?: GraphicsRequestStatus | 'all',
): Promise<GraphicsRequestRow[]> {
  const { data } = await api.get(`/graphics/projects/${encodeURIComponent(projectId)}/requests`, {
    params: status ? { status } : undefined,
  });
  return data.data;
}

export async function updateGraphicsRequest(
  requestId: string,
  input: { status?: GraphicsRequestStatus; convertedPageId?: string | null },
): Promise<GraphicsRequestRow> {
  const { data } = await api.put(`/graphics/requests/${encodeURIComponent(requestId)}`, input);
  return data.data;
}

export async function deleteGraphicsRequest(requestId: string): Promise<void> {
  await api.delete(`/graphics/requests/${encodeURIComponent(requestId)}`);
}

// ── 名簿からの一括生成 — graphics.md §6・§9 段5 ────────────────────────
// POST /graphics/projects/:id/roster/preview … ヘッダー・サンプル行を読む
// POST /graphics/projects/:id/roster/commit  … 全行をパースして一括作成

export interface RosterPreviewResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

export async function previewGraphicsRoster(projectId: string, file: File): Promise<RosterPreviewResult> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/roster/preview`, fd);
  return data.data;
}

export interface RosterCommitResult {
  created: GraphicsPageRow[];
  createdCount: number;
  /** 全カラム空だったためスキップした行数 */
  skippedBlank: number;
  /** ページ名が空になり作成できなかった行（1行のミスで全部は失敗させない） */
  errors: { row: number; message: string }[];
}

export async function commitGraphicsRoster(
  projectId: string,
  file: File,
  slot: GraphicsSlot,
  partKey: GraphicsPartKey,
  mapping: Record<string, string>,
  nameColumn?: string,
): Promise<RosterCommitResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('slot', slot);
  fd.append('partKey', partKey);
  fd.append('mapping', JSON.stringify(mapping));
  if (nameColumn) fd.append('nameColumn', nameColumn);
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/roster/commit`, fd);
  return data.data;
}
