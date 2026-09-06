// テロップCG（graphics）の共通データ取得・整形。
// REST（projects/pages/public.routes）と Socket（cg:*）が同じ形を返すよう、
// DB 行 → camelCase の写像と cue の upsert をここ1か所に閉じる。
import { execute, queryAll, queryOne, Row, TxClient, withTransaction } from '../../shared/db/connection';
import type { InteractiveLink } from './services/interactive-bridge.service';

export const SLOTS = ['fullscreen', 'lower', 'side', 'ticker', 'clock', 'flash'] as const;
export type Slot = (typeof SLOTS)[number];

export const PART_KEYS = [
  'name', 'title', 'list', 'ticker', 'countdown', 'score', 'flash', 'side', 'vote', 'ranking',
] as const;
export type PartKey = (typeof PART_KEYS)[number];

export const PROOF_STATES = ['draft', 'unproofed', 'proofed'] as const;
export type ProofState = (typeof PROOF_STATES)[number];

/** プロジェクト単位の見た目テーマ（graphics_projects.theme。既定は migration 250 の 'ceremony-gold'） */
export const THEMES = ['ceremony-gold', 'news-navy', 'corporate-light', 'variety-pop'] as const;
export type Theme = (typeof THEMES)[number];

// 呼出番号のスロット別ブロック（モックの採番どおり: 下部=101〜・サイド=110〜・
// フル=201〜・ティッカー=301〜・時計=401〜・速報=501〜）。ブロック内の
// 最小の空き番号を払い出す（graphics.md §2「テンキー入力で即スタンバイ」）。
export const SLOT_CALL_BASE: Record<Slot, number> = {
  lower: 101,
  side: 110,
  fullscreen: 201,
  ticker: 301,
  clock: 401,
  flash: 501,
};

/**
 * スロット間の自動退出ルール（段6-4・CGプロジェクト単位。migration 252）。
 * whenSlot のページが TAKE されたら、autoOutSlots のスロットを自動 OUT する。
 * docs/design/v4/graphics.md §2「衝突の解決をオペレーターの注意力に任せない」。
 */
export interface SlotExitRule {
  whenSlot: Slot;
  autoOutSlots: Slot[];
}

/**
 * DB から読んだ slot_exit_rules（JSONB。pg ドライバが自動で JS 値へ変換する）を、
 * 壊れた形が来ても落ちないよう防御的に整形する（書き込み時のバリデーションは
 * routes 側・`validateSlotExitRules` が担う。ここは「読めなかったら空扱い」の保険）。
 */
export function normalizeSlotExitRules(raw: unknown): SlotExitRule[] {
  if (!Array.isArray(raw)) return [];
  const out: SlotExitRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const whenSlot = (item as Record<string, unknown>).whenSlot;
    const autoOutSlots = (item as Record<string, unknown>).autoOutSlots;
    if (!SLOTS.includes(whenSlot as Slot) || !Array.isArray(autoOutSlots)) continue;
    const cleaned = autoOutSlots.filter((s): s is Slot => SLOTS.includes(s as Slot));
    if (cleaned.length === 0) continue;
    out.push({ whenSlot: whenSlot as Slot, autoOutSlots: cleaned });
  }
  return out;
}

/**
 * 外部インタラクティブ連携設定（段6-7・migration 258）の、APIレスポンスとして返してよい
 * マスク済みビュー。`apiKeySecret` を含まない — これが唯一 `GraphicsProject`/公開APIに
 * 乗せてよい形。秘密込みの完全な形（`InteractiveLink`）が要る内部処理は
 * `fetchProjectInteractiveLinkFull` を使うこと（このビューとは絶対に混ぜない）。
 */
export interface InteractiveLinkView {
  baseUrl: string;
  apiKeyPrefix: string;
  interactiveEventId: string;
  closeBufferSeconds: number;
  autoControl: boolean;
}

export interface GraphicsProject {
  id: number;
  ownerType: string;
  ownerId: string;
  name: string;
  theme: string;
  slotExitRules: SlotExitRule[];
  /** マスク済みビュー（`apiKeySecret` を含まない）。未設定は null */
  interactiveLink: InteractiveLinkView | null;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface GraphicsPage {
  id: number;
  projectId: number;
  callNo: number;
  slot: string;
  partKey: string;
  name: string;
  fields: Record<string, unknown>;
  proofState: string;
  sortOrder: number;
  /** 作成元テンプレート（段6-2・migration 254）。NULL＝テンプレートを使わない自由入力で作られたページ */
  templateId: number | null;
  /**
   * 複数部品を重ねた組み合わせページ（段6-2 本格拡張・migration 255）。
   * null/空配列＝従来どおりの単一部品ページ（partKey/fields が正）。
   * 非空配列＝この配列が正で、partKey/fields は無視してよい（一覧表示用に
   * partKey には layers[0].partKey を入れておく運用——作成側の責務）。
   */
  layers: GraphicsPageLayer[] | null;
  /** コーナー見出し（段C・migration 280）。台本から取り込んだページに付く。NULL＝コーナー無し */
  section: string | null;
  /** 取り込み元の台本ドキュメント ID（段C・migration 280）。NULL＝台本取り込みではない */
  qsheetDocId: string | null;
  /** 取り込み元の台本の行 ID（段C・migration 280）。「台本と違います」差分検出に使う */
  qsheetRowId: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

/** 組み合わせページの1レイヤー（段6-2 本格拡張）。partKey は PART_KEYS のいずれか。 */
export interface GraphicsPageLayer {
  partKey: string;
  fields: Record<string, unknown>;
}

/** 組み合わせテンプレートの1レイヤー（段6-2 本格拡張）。 */
export interface GraphicsTemplateLayer {
  partKey: string;
  baseFields: Record<string, unknown>;
  publicFields: string[];
}

/** レイヤー数の上限（重ねすぎ防止。DB/UIとも同じ値でバリデーションする）。 */
export const MAX_TEMPLATE_LAYERS = 4;

/**
 * テンプレート（段6-2・migration 254）。「1部品ぶんの設定プリセット＋公開フィールドの絞り込み」。
 * `publicFields` は `baseFields` のキーの部分集合（要素検証は routes/templates.routes.ts が担う）。
 * docs/design/v4/graphics.md §2「公開フィールド以外はオペレーターから触れない」の最初の一段。
 */
export interface GraphicsTemplate {
  id: number;
  projectId: number;
  partKey: string;
  slot: string;
  name: string;
  description: string | null;
  baseFields: Record<string, unknown>;
  publicFields: string[];
  /**
   * 複数部品を重ねた組み合わせテンプレート（段6-2 本格拡張・migration 255）。
   * null/空配列＝従来どおりの単一部品テンプレート（partKey/baseFields/publicFields が正）。
   * 非空配列＝この配列が正で、既存の単一partKey等は無視してよい。
   */
  layers: GraphicsTemplateLayer[] | null;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface GraphicsCue {
  projectId: number;
  slot: string;
  pageId: number | null;
  isLive: boolean;
  takenAt: unknown;
  /**
   * 段階カウンタ（段6-1・汎用機構。migration 253・sentinel は 251）。新しいページが
   * TAKE されたら **-1**（＝段階公開を未使用・全件表示）にリセットされる
   * （`upsertCueTx`）。「続き」ボタンで `POST …/cue/continue` が +1 する
   * （-1→0で1件目が現れる）。部品側（例: `FullscreenList`）が自分の都合で解釈する
   * — 上限や意味は cue 側では決め打ちしない。
   */
  revealPhase: number;
  updatedAt: unknown;
}

export const REQUEST_STATUSES = ['requested', 'converted', 'dismissed'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** 発注（テロ原）。docs/design/v4/graphics.md §3・§9 段5 */
export interface GraphicsRequest {
  id: number;
  projectId: number;
  title: string;
  detail: string | null;
  desiredSlot: string | null;
  desiredPartKey: string | null;
  desiredTiming: string | null;
  requestedBy: string | null;
  status: string;
  convertedPageId: number | null;
  createdAt: unknown;
  updatedAt: unknown;
}

/**
 * DB から読んだ interactive_link（JSONB）を、保存経路によっては「JSON 文字列」で返る
 * ことがあるため string / object 両対応で正規化する（`interactive-poller.service.ts` の
 * `normalizeLink` と同じ注意点 — これをしないと文字列のとき `link.baseUrl` が undefined
 * になり、連携が毎回スキップされる）。壊れた形は null（＝未設定）に丸める。
 */
export function normalizeInteractiveLink(raw: unknown): InteractiveLink | null {
  if (!raw) return null;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const link = obj as Partial<InteractiveLink>;
  if (typeof link.baseUrl !== 'string' || typeof link.apiKeySecret !== 'string' || typeof link.interactiveEventId !== 'string') {
    return null;
  }
  return link as InteractiveLink;
}

/** 秘密込みの完全な `InteractiveLink` を、公開APIレスポンスに乗せてよいマスク済みビューへ変換する。 */
export function toInteractiveLinkView(link: InteractiveLink | null): InteractiveLinkView | null {
  if (!link || !link.baseUrl || !link.apiKeySecret) return null;
  return {
    baseUrl: link.baseUrl,
    apiKeyPrefix: link.apiKeyPrefix ?? link.apiKeySecret.slice(0, 12),
    interactiveEventId: link.interactiveEventId,
    closeBufferSeconds: typeof link.closeBufferSeconds === 'number' ? link.closeBufferSeconds : 0,
    autoControl: link.autoControl !== false,
  };
}

export function mapProject(r: Row): GraphicsProject {
  return {
    id: r.id as number,
    ownerType: r.owner_type as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    theme: r.theme as string,
    slotExitRules: normalizeSlotExitRules(r.slot_exit_rules),
    interactiveLink: toInteractiveLinkView(normalizeInteractiveLink(r.interactive_link)),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * DB から読んだ layers（JSONB配列。pg ドライバが自動で JS 値へ変換する）を、
 * 壊れた形が来ても落ちないよう防御的に整形する（`normalizePublicFields` と同じ考え方。
 * 書き込み時の要素検証は routes 側が担う）。空配列・不正値は null（＝単一部品扱い）に丸める。
 */
export function normalizePageLayers(raw: unknown): GraphicsPageLayer[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: GraphicsPageLayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const partKey = (item as Record<string, unknown>).partKey;
    const fields = (item as Record<string, unknown>).fields;
    if (typeof partKey !== 'string') continue;
    out.push({
      partKey,
      fields: (fields && typeof fields === 'object' && !Array.isArray(fields)) ? (fields as Record<string, unknown>) : {},
    });
  }
  return out.length > 0 ? out : null;
}

export function normalizeTemplateLayers(raw: unknown): GraphicsTemplateLayer[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: GraphicsTemplateLayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const partKey = rec.partKey;
    if (typeof partKey !== 'string') continue;
    const baseFields = (rec.baseFields && typeof rec.baseFields === 'object' && !Array.isArray(rec.baseFields))
      ? (rec.baseFields as Record<string, unknown>) : {};
    const publicFields = normalizePublicFields(rec.publicFields);
    out.push({ partKey, baseFields, publicFields });
  }
  return out.length > 0 ? out : null;
}

export function mapPage(r: Row): GraphicsPage {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    callNo: r.call_no as number,
    slot: r.slot as string,
    partKey: r.part_key as string,
    name: r.name as string,
    fields: (r.fields ?? {}) as Record<string, unknown>,
    proofState: r.proof_state as string,
    sortOrder: r.sort_order as number,
    templateId: (r.template_id as number | null) ?? null,
    layers: normalizePageLayers(r.layers),
    section: (r.section as string | null) ?? null,
    qsheetDocId: (r.qsheet_doc_id as string | null) ?? null,
    qsheetRowId: (r.qsheet_row_id as string | null) ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * DB から読んだ public_fields（JSONB配列。pg ドライバが自動で JS 値へ変換する）を、
 * 壊れた形が来ても落ちないよう防御的に整形する（`normalizeSlotExitRules` と同じ考え方。
 * 書き込み時の「baseFieldsのキーとして存在するか」の検証は routes 側が担う）。
 */
export function normalizePublicFields(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string');
}

export function mapTemplate(r: Row): GraphicsTemplate {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    partKey: r.part_key as string,
    slot: r.slot as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    baseFields: (r.base_fields ?? {}) as Record<string, unknown>,
    publicFields: normalizePublicFields(r.public_fields),
    layers: normalizeTemplateLayers(r.layers),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchTemplates(projectId: number): Promise<GraphicsTemplate[]> {
  const rows = await queryAll(
    `SELECT * FROM graphics_templates WHERE project_id = ? ORDER BY created_at DESC`,
    [projectId]
  );
  return rows.map(mapTemplate);
}

export async function fetchTemplate(id: number): Promise<GraphicsTemplate | null> {
  const row = await queryOne(`SELECT * FROM graphics_templates WHERE id = ?`, [id]);
  return row ? mapTemplate(row) : null;
}

export function mapCue(r: Row): GraphicsCue {
  return {
    projectId: r.project_id as number,
    slot: r.slot as string,
    pageId: (r.page_id as number | null) ?? null,
    isLive: r.is_live as boolean,
    takenAt: r.taken_at ?? null,
    // -1 = 段階公開を未使用（クライアント側は「全件表示」と解釈。migration 256）
    revealPhase: (r.reveal_phase as number | null) ?? -1,
    updatedAt: r.updated_at,
  };
}

export function mapRequest(r: Row): GraphicsRequest {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    title: r.title as string,
    detail: (r.detail as string | null) ?? null,
    desiredSlot: (r.desired_slot as string | null) ?? null,
    desiredPartKey: (r.desired_part_key as string | null) ?? null,
    desiredTiming: (r.desired_timing as string | null) ?? null,
    requestedBy: (r.requested_by as string | null) ?? null,
    status: r.status as string,
    convertedPageId: (r.converted_page_id as number | null) ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchProject(id: number): Promise<GraphicsProject | null> {
  const row = await queryOne(`SELECT * FROM graphics_projects WHERE id = ?`, [id]);
  return row ? mapProject(row) : null;
}

/**
 * 秘密込みの完全な `InteractiveLink`（`apiKeySecret` を含む）を返す内部専用の取得関数。
 * **公開APIレスポンスに混ぜないこと** — 外部VPSを叩く内部処理（sync/dismiss・
 * vote-lifecycle・poller）だけが使う。マスク済みビューが要る箇所は `GraphicsProject.interactiveLink`
 * （`mapProject` 経由）を使うこと。
 */
export async function fetchProjectInteractiveLinkFull(projectId: number): Promise<InteractiveLink | null> {
  const row = await queryOne(`SELECT interactive_link FROM graphics_projects WHERE id = ?`, [projectId]);
  if (!row) return null;
  return normalizeInteractiveLink(row.interactive_link);
}

export async function fetchPages(projectId: number): Promise<GraphicsPage[]> {
  const rows = await queryAll(
    `SELECT * FROM graphics_pages WHERE project_id = ? ORDER BY sort_order, call_no, id`,
    [projectId]
  );
  return rows.map(mapPage);
}

/** 発注一覧。status を渡すとその状態だけに絞る（既定は絞り込みなし＝全件） */
export async function fetchRequests(projectId: number, status?: string): Promise<GraphicsRequest[]> {
  const rows = status
    ? await queryAll(
        `SELECT * FROM graphics_requests WHERE project_id = ? AND status = ? ORDER BY created_at DESC`,
        [projectId, status]
      )
    : await queryAll(
        `SELECT * FROM graphics_requests WHERE project_id = ? ORDER BY created_at DESC`,
        [projectId]
      );
  return rows.map(mapRequest);
}

export async function fetchCues(projectId: number): Promise<GraphicsCue[]> {
  const rows = await queryAll(
    `SELECT * FROM graphics_cue_state WHERE project_id = ? ORDER BY slot`,
    [projectId]
  );
  return rows.map(mapCue);
}

export interface GraphicsBundle {
  project: GraphicsProject;
  pages: GraphicsPage[];
  cues: GraphicsCue[];
}

export async function fetchBundle(projectId: number): Promise<GraphicsBundle | null> {
  const project = await fetchProject(projectId);
  if (!project) return null;
  const [pages, cues] = await Promise.all([fetchPages(projectId), fetchCues(projectId)]);
  return { project, pages, cues };
}

/**
 * スロット cue の upsert（pageId null = クリア）。
 * is_live / taken_at は pageId から導出する — 「載っているのに live でない」中間状態を
 * REST と Socket のどちらの経路でも作らせないため。
 */
export async function upsertCue(
  projectId: number,
  slot: Slot,
  pageId: number | null
): Promise<GraphicsCue[]> {
  const isLive = pageId !== null;
  // reveal_phase は -1（段階公開未使用＝全件表示）で書き直す（migration 256）
  await execute(
    `INSERT INTO graphics_cue_state (project_id, slot, page_id, is_live, taken_at, reveal_phase, updated_at)
     VALUES (?, ?, ?, ?, ${isLive ? 'NOW()' : 'NULL'}, -1, NOW())
     ON CONFLICT (project_id, slot) DO UPDATE
       SET page_id = EXCLUDED.page_id,
           is_live = EXCLUDED.is_live,
           taken_at = EXCLUDED.taken_at,
           reveal_phase = -1,
           updated_at = NOW()`,
    [projectId, slot, pageId, isLive]
  );
  return fetchCues(projectId);
}

async function upsertCueTx(
  tx: TxClient,
  projectId: number,
  slot: Slot,
  pageId: number | null
): Promise<void> {
  const isLive = pageId !== null;
  // reveal_phase は常に -1（段階公開未使用＝全件表示。migration 256）で書き直す —
  // TAKE で新しいページが乗るときも OUT でスロットが空くときも、前の段階を引き継がせない
  // （「続き」は今出ているページのためだけの状態であるべき。「一度も続きを押していない」
  // 状態は 0 ではなく -1 で表す — 0 だと「1件目まで表示」という段階公開の値と区別が
  // 付かず、TAKEしただけで巻き添えで表示が絞られてしまうため）
  await tx.execute(
    `INSERT INTO graphics_cue_state (project_id, slot, page_id, is_live, taken_at, reveal_phase, updated_at)
     VALUES (?, ?, ?, ?, ${isLive ? 'NOW()' : 'NULL'}, -1, NOW())
     ON CONFLICT (project_id, slot) DO UPDATE
       SET page_id = EXCLUDED.page_id,
           is_live = EXCLUDED.is_live,
           taken_at = EXCLUDED.taken_at,
           reveal_phase = -1,
           updated_at = NOW()`,
    [projectId, slot, pageId, isLive]
  );
}

export interface CueTakeResult {
  cues: GraphicsCue[];
  /** このTAKEでルールにより自動OUTになったスロット（無ければ空配列）。 */
  autoOutSlots: Slot[];
}

/**
 * スロット cue の upsert を、段6-4のスロット間自動退出ルールと合わせて
 * 1つのDBトランザクションで適用する（`upsertCue` の上位互換。cue の差し替え口
 * ＝ REST `POST /projects/:id/cue` と Socket `cg:set` の両方がここを通る）。
 *
 * pageId が null でない（= OUT ではなく TAKE の）ときだけ、プロジェクトの
 * `slot_exit_rules` を見て `whenSlot === slot` に一致するルールの
 * `autoOutSlots` も同じトランザクションで OUT にする。呼び出し側は返る
 * `autoOutSlots` を使って Socket 同報・オペレーター表示を1回にまとめられる。
 */
export async function applyCueTake(
  projectId: number,
  slot: Slot,
  pageId: number | null
): Promise<CueTakeResult> {
  const autoOutSlots: Slot[] = [];
  await withTransaction(async (tx) => {
    // FOR UPDATE でプロジェクト行をロック — 同じプロジェクトへの同時 TAKE で
    // ルール判定が古い slot_exit_rules を見たまま進まないようにする
    const projectRow = await tx.queryOne(
      `SELECT slot_exit_rules FROM graphics_projects WHERE id = ? FOR UPDATE`,
      [projectId]
    );
    const rules = normalizeSlotExitRules(projectRow?.slot_exit_rules);

    await upsertCueTx(tx, projectId, slot, pageId);

    if (pageId !== null) {
      const targets = new Set<Slot>();
      for (const rule of rules) {
        if (rule.whenSlot !== slot) continue;
        for (const s of rule.autoOutSlots) {
          if (s !== slot) targets.add(s);
        }
      }
      for (const s of targets) {
        await upsertCueTx(tx, projectId, s, null);
        autoOutSlots.push(s);
      }
    }
  });
  const cues = await fetchCues(projectId);
  return { cues, autoOutSlots };
}

/** 段階カウンタの上限（安全のためのクランプ。部品側の意味は決め打ちしない — 段6-1）。 */
const REVEAL_PHASE_MAX = 99;

/**
 * 「続き」動詞（段6-1・汎用機構）: 対象スロットの cue の `reveal_phase` を +1 する。
 * 上限（`REVEAL_PHASE_MAX`）に達したらそこで止まる — 「もう増えない」の判断は部品側
 * （例: `FullscreenList`）に委ねる。ライブでないスロット（pageId が無い）に送っても
 * 実害は無いが、呼び出し側（ルート／Socket）で PGM に乗っているかを確認してから呼ぶ想定。
 */
export async function bumpRevealPhase(projectId: number, slot: Slot): Promise<GraphicsCue[]> {
  await execute(
    `UPDATE graphics_cue_state
       SET reveal_phase = LEAST(reveal_phase + 1, ?), updated_at = NOW()
     WHERE project_id = ? AND slot = ?`,
    [REVEAL_PHASE_MAX, projectId, slot]
  );
  return fetchCues(projectId);
}

/** スロット別ブロック内の最小の空き呼出番号を払い出す。 */
export async function nextCallNo(projectId: number, slot: Slot): Promise<number> {
  const rows = await queryAll(
    `SELECT call_no FROM graphics_pages WHERE project_id = ?`,
    [projectId]
  );
  const used = new Set(rows.map((r) => r.call_no as number));
  let n = SLOT_CALL_BASE[slot];
  while (used.has(n)) n += 1;
  return n;
}
