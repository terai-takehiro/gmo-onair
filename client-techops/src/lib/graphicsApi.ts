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
 *   POST /graphics/projects/:id/cue/continue    … 「続き」— スロットの reveal_phase を+1（段6-1）
 *   GET  /graphics/projects/:id/output         … 公開・認証なし（出力画面と 30s ポーリング用）
 *   POST /graphics/projects/:id/requests       … 発注（テロ原）の新規作成
 *   GET  /graphics/projects/:id/requests       … 発注一覧（既定は status=requested のみ）
 *   PUT  /graphics/requests/:id                … 発注の状態更新（却下・ページ化での紐づけ）
 *   DELETE /graphics/requests/:id              … 発注の削除（誤操作の取消）
 *   POST /graphics/projects/:id/templates      … テンプレート作成
 *   GET  /graphics/projects/:id/templates      … テンプレート一覧
 *   PUT  /graphics/templates/:id               … テンプレートの部分更新
 *   DELETE /graphics/templates/:id             … テンプレート削除
 *
 * 名簿（Excel）からの一括生成（roster/preview・roster/commit）は `graphicsRosterApi.ts` へ
 * 切り出した（ファイルサイズ規律・400行）。
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
  | 'name' | 'title' | 'list' | 'ticker' | 'countdown' | 'score' | 'flash' | 'side' | 'vote' | 'ranking';

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
  ranking: 'ランキング発表',
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
  ranking: 'fullscreen',
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

/**
 * スロット間の自動退出ルール（段6-4・CGプロジェクト単位）。
 * whenSlot のページが TAKE されたら、autoOutSlots のスロットを自動 OUT する。
 * docs/design/v4/graphics.md §2「衝突の解決をオペレーターの注意力に任せない」。
 * テンプレート層（段6-2）ができるまでの暫定の置き場所（graphics-awards-migration-plan.md §2-2）。
 */
export interface SlotExitRule {
  whenSlot: GraphicsSlot;
  autoOutSlots: GraphicsSlot[];
}

export interface GraphicsProjectRow {
  id: string;
  name: string;
  ownerType: 'project' | 'program';
  ownerId: string;
  /** 見た目テーマのキー（未知の値は既定テーマ扱いにする — レンダラ側の作法） */
  theme: string;
  /** 既定は空配列（ルールはオプトイン） */
  slotExitRules: SlotExitRule[];
  /** 台本に追従（段E・migration 281）。既定 false。ON で進行画面の現在行に本番モードの
   *  NEXT が自動で移る（TAKEは対象外——常に人が押す。graphics-redesign.md §9 3番・§12-2） */
  followScript: boolean;
}

/** 組み合わせページの1レイヤー（段6-2 本格拡張）。部品は自分の既定の位置のまま重ねて描かれる */
export interface GraphicsPageLayer {
  partKey: GraphicsPartKey;
  fields: Record<string, unknown>;
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
  /**
   * コーナー見出し（段C・graphics-redesign.md §9）。台本から取り込むと台本の
   * section.label が入る。null＝コーナー無し（①一覧・②送出リストで見出しを挟まない）。
   * 通常の作成・編集フォームからは触らせない（`GraphicsPageInput` には持たせていない）。
   */
  section: string | null;
  /**
   * 取り込み元の台本（段C）。null＝台本から取り込んでいない自由入力のページ。
   * `qsheetRowId` と対で使う——`fetchQsheetLiveText`（`graphicsQsheetImportApi.ts`）が
   * ドキュメントごとにまとめて「いまの文言」を引く際のグループ化キー。
   */
  qsheetDocId: string | null;
  /**
   * 取り込み元の台本の行 id（段C）。台本側の文言が変わったかどうかの判定
   * （「台本と違います」バッジ）に使う。null＝台本から取り込んでいない自由入力のページ。
   */
  qsheetRowId: string | null;
  /** 作成元テンプレート（段6-2）。null＝テンプレートを使わない自由入力で作られたページ */
  templateId: string | null;
  /**
   * 複数部品の組み合わせページ（段6-2 本格拡張）。null/空＝従来どおり partKey/fields が正。
   * 非空＝この配列が正（partKey/fields は無視してよい。partKey には layers[0].partKey が
   * 入っている運用 — サーバー側の規約）
   */
  layers?: GraphicsPageLayer[] | null;
}

export interface GraphicsCueRow {
  slot: GraphicsSlot;
  pageId: string | null;
  isLive: boolean;
  takenAt: string | null;
  /**
   * 段階カウンタ（段6-1・汎用機構）。新しいページが TAKE されたら 0 にリセットされる。
   * 「続き」（`continueGraphicsCue`）で+1。0 は「まだ何も進めていない」を意味し、
   * この値をどう解釈するかは部品側が決める（例: `FullscreenList` は `revealPhase+1` 件目まで表示）。
   */
  revealPhase: number;
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

/** プロジェクトの部分更新（theme / name / slotExitRules / followScript）。更新後の一式（bundle）が返る */
export async function updateGraphicsProject(
  projectId: string | number,
  input: { theme?: GraphicsThemeKey; name?: string; slotExitRules?: SlotExitRule[]; followScript?: boolean },
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
  /**
   * テンプレートから作る（段6-2）。指定すると、サーバー側で `slot`/`partKey` は
   * テンプレートの値に置き換えられ、`fields` はテンプレートの `baseFields` をベースに
   * `publicFields` に含まれるキーだけこの `fields` の値で上書きしたものになる
   * （`publicFields` に無いキーを送っても無視される — サーバー側で強制）。
   */
  templateId?: string | number | null;
  /**
   * 複数部品テンプレートから作るとき（段6-2 本格拡張）、レイヤーごとの入力値をここに渡す
   * — インデックスはテンプレートの `layers` の順序と対応。`layers[i].publicFields` に
   * 含まれるキーだけが反映される（それ以外は無視される — サーバー側で強制）
   */
  layerFields?: Record<string, unknown>[];
  /**
   * 出す順（段A・一覧の並べ替え）。**`callNo`（呼出番号）とは独立**——サーバー側
   * （`pages.routes.ts`）は `sortOrder` だけを更新でき、並べ替えで `callNo` が
   * 動くことは無い（graphics-redesign.md §10「出す順の番号は固定」）。作成時
   * （`createGraphicsPage`）には使わない — 新規ページは常に末尾に追加される。
   */
  sortOrder?: number;
}

export async function createGraphicsPage(projectId: string, input: GraphicsPageInput): Promise<GraphicsPageRow> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/pages`, input);
  return data.data;
}

/**
 * ページ更新。**テンプレートから作られたページ（`templateId` あり）は `fields` に
 * `publicFields` に含まれるキーだけを渡すこと** — サーバー側は渡された `fields` を
 * 既存の値に**マージ**し（ロックされたフィールドを毎回送り直させない）、
 * `publicFields` に無いキーが1つでも含まれていれば 400 で拒否する。
 */
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

/**
 * ページの写真フィールド（`pageFields.ts` の `kind: 'image'`）用アップロード。
 * `graphicsRosterApi.ts` の Excel アップロードと同じ FormData の作法。
 * サーバー側でそのページの `fields.photoUrl` を更新して新しい URL を返す
 * （`server/src/contexts/graphics/routes/images.routes.ts`）。
 */
export async function uploadGraphicsPagePhoto(
  pageId: string,
  file: File,
): Promise<{ photoUrl: string }> {
  const fd = new FormData();
  fd.append('photo', file);
  const { data } = await api.post(`/graphics/pages/${encodeURIComponent(pageId)}/photo`, fd);
  return data.data;
}

export interface SetGraphicsCueResult {
  cues: GraphicsCueRow[];
  /** 段6-4: このTAKEで自動退出ルールによりOUTになったスロット（無ければ空配列） */
  autoOutSlots: GraphicsSlot[];
}

/** スロットの cue を差し替える（pageId=null で OUT）。REST 経由の口 — 本番はソケットの `cg:set` を使う */
export async function setGraphicsCue(
  projectId: string,
  slot: GraphicsSlot,
  pageId: string | null,
): Promise<SetGraphicsCueResult> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/cue`, { slot, pageId });
  return { cues: data.data.cues, autoOutSlots: data.data.autoOutSlots ?? [] };
}

/**
 * 「続き」（段6-1・汎用機構）: 対象スロットの cue の `revealPhase` を+1する。
 * REST 経由の口 — 本番はソケットの `cg:continue` を使う（`emitCgContinue`）。
 */
export async function continueGraphicsCue(projectId: string, slot: GraphicsSlot): Promise<GraphicsCueRow[]> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/cue/continue`, { slot });
  return data.data.cues;
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
// `RosterColumnType`・`previewGraphicsRoster`・`commitGraphicsRoster` 等は
// `graphicsRosterApi.ts` に切り出した（ファイルサイズ規律・400行）。

// ── テンプレート（部品→**テンプレート**→ページ→送出リストの第2層・段6-2） ──────
// `GraphicsTemplateRow`・`GraphicsTemplateLayer`・`fetchGraphicsTemplates` 等は
// `graphicsTemplateApi.ts` に切り出した（ファイルサイズ規律・400行。roster と同じ判断）。
export * from './graphicsTemplateApi';

// ── 前の番組からコピー（段E）。`GraphicsProjectSummary`・`fetchGraphicsProjectsList`・
// `copyGraphicsTemplatesFrom` は `graphicsProjectListApi.ts` へ（ファイルサイズ規律・400行）。
export * from './graphicsProjectListApi';
