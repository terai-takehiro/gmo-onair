// 運営マニュアル — クライアント用の型（docs/design/v4/production-manual.md §5）
//
// ⚠️ サーバーは複製しない。`shared/src/schedule/types.ts` と同じ理由
// （04-schedule-impl.md §3-7）— サーバーは Express の req.body を自前で検証するので、
// 型を共有しても検査が増えない。
//
// 段A（器だけ）: 冊子の一覧・作成・削除、ページの一覧・追加・削除・並べ替え・
// タイトル/章名の編集。段B: 紙面の自由ブロック（`ManualFreeBlock`）。
// 段C: 差し込みブロック（`ManualLinkedBlock`。レジストリは
// `shared/src/production/manualBlocks.ts`）。ひな形ブロック（`kind: 'master'`）は段E以降。

export type ManualStatus = "draft" | "fixed" | "archived";

/**
 * 編集ロックの状態（段E・production-manual.md §6-2-1）。冊子まるごとの1本のロックで、
 * `GET /manuals`・`GET /manuals/:id`（どちらも同じ SELECT）にも、ロック操作4本
 * （`POST/DELETE …/lock`・`…/lock/takeover`・`…/lock/request`）の応答にも同じ形で乗る。
 */
export interface ManualLockFields {
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
  lock_requested_by: string | null;
  lock_requested_by_name: string | null;
  lock_requested_at: string | null;
}

/** ロック操作4本が返す最小限の行（`GET /manuals/:id` ほど情報を持たない） */
export interface ManualLockState extends ManualLockFields {
  id: string;
  status: ManualStatus;
}

/** 一覧の1行・冊子1件（ページを含まない形） */
export interface ManualListItem extends ManualLockFields {
  id: string;
  doc_no: string | null;
  title: string;
  project_id: string | null;
  project_name?: string | null;
  gls_number?: string | null;
  program_id: string | null;
  program_name?: string | null;
  service_date: string | null;
  status: ManualStatus;
  rev: number;
  page_count: number;
  created_by: string | null;
  creator_name?: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * 紙面の中身（ManualBlock）。段B（production-manual.md §4-3・§5-2）で確定。
 *
 * 段Bで作るのは `kind: 'free'` だけ（文字・図形・画像・表・QR の5種）。
 * `kind: 'linked'`（差し込み・段C）・`kind: 'master'`（ひな形のブロック・段E）は
 * まだ無い — 型を足すときは判別可能な union を広げるだけで、段Bが保存した
 * JSON との互換は保たれる（既存の free ブロックは変わらず読める）。
 *
 * 見た目（書体・大きさ・色・枠・影・回転の下地になる scaleX など）はすべて
 * `style`（CSS に落ちる値のプレーンな連想配列）に置く。`free.content` には
 * 中身のデータだけを持ち、見た目を重複して持たない（§6-4・§6-5-1）。
 */
export type ManualFreeBlockType = "text" | "shape" | "image" | "table" | "qr";

export interface ManualTextContent {
  text: string;
  align?: "left" | "center" | "right";
}

/** 図形の6種（§4-3: 矩形・角丸・円・線・矢印・吹き出し） */
export type ManualShapeKind = "rect" | "rounded-rect" | "ellipse" | "line" | "arrow" | "callout";

export interface ManualShapeContent {
  shape: ManualShapeKind;
}

export interface ManualImageContent {
  url: string;
  alt?: string;
  fit?: "contain" | "cover";
}

/** 表（自由ブロック）。行×列のプレーンな文字列。1行目を見出し扱いにするかは style 側で決める */
export interface ManualTableContent {
  rows: string[][];
}

export interface ManualQrContent {
  /** QRが指す値（URLまたは文字列） */
  value: string;
  label?: string;
}

/**
 * 自由ブロックの中身の union（段C: `kind: 'linked'` には `content` が無いため、
 * `ManualBlock["free"]["content"]` という書き方はもう成立しない。中身編集の
 * コールバック（`ManualBlockView`/`ManualCanvas` の `onContentCommit`）はこの型を使う）。
 */
export type ManualFreeBlockContent =
  | ManualTextContent
  | ManualShapeContent
  | ManualImageContent
  | ManualTableContent
  | ManualQrContent;

interface ManualBlockBase {
  id: string;
  /** 紙の寸法（mm）。左上原点。A4横 = 297 × 210（PAGE_WIDTH_MM/PAGE_HEIGHT_MM） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 重なりの順（大きいほど手前） */
  z: number;
  /** 度。既定 0 */
  rotation?: number;
  /** CSS に落ちる値だけを持つ（font-size・font-weight・color・border・opacity・transform 等） */
  style: Record<string, string | number>;
}

export type ManualFreeBlock =
  | (ManualBlockBase & { kind: "free"; free: { type: "text"; content: ManualTextContent } })
  | (ManualBlockBase & { kind: "free"; free: { type: "shape"; content: ManualShapeContent } })
  | (ManualBlockBase & { kind: "free"; free: { type: "image"; content: ManualImageContent } })
  | (ManualBlockBase & { kind: "free"; free: { type: "table"; content: ManualTableContent } })
  | (ManualBlockBase & { kind: "free"; free: { type: "qr"; content: ManualQrContent } });

/**
 * 差し込みブロック（段C・production-manual.md §4-3・§5-2）。`block` はレジストリのキー
 * （`shared/src/production/manualBlocks.ts` の `ManualLinkedBlockKey`。循環 import を避けるため
 * ここでは string のまま持つ）。
 *
 * - `sourceId`: 差し込み元の資料 id（案件全体を指すときは null）
 * - `options`: 出す列・時間帯・見せ方など、ブロックごとに形が違う自由な設定
 * - `frozen`: 確定（段E）したときに書き込まれる「そのときの中身」。下書きの間は null
 * - `reveal`: 伏せ字を解除して紙に出した項目（配信の鍵・パスコード等）と、誰がいつ出したか（§7-2）。
 *   無ければサーバー（`resolve`）は伏せ字のまま返す
 */
export interface ManualLinkedBlockLink {
  block: string;
  sourceId: string | null;
  options: Record<string, unknown>;
  frozen: { at: string; data: unknown } | null;
  reveal?: { by: string; at: string; fields: string[] };
}

export type ManualLinkedBlock = ManualBlockBase & { kind: "linked"; link: ManualLinkedBlockLink };

/**
 * 段E で `kind: 'master'`（ひな形のブロック・全ページ共通）を足すときは、この union に
 * 1行足すだけでよい（既存の free/linked ブロックの JSON との互換は保たれる）。
 */
export type ManualBlock = ManualFreeBlock | ManualLinkedBlock;

/** A4横の実寸（mm）。§8-3 */
export const PAGE_WIDTH_MM = 297;
export const PAGE_HEIGHT_MM = 210;
/** 版面の余白（mm）。§8-3。すいつき（スナップ）先の1つ */
export const PAGE_MARGIN_MM = { top: 12, bottom: 12, left: 15, right: 15 };

export interface ManualPage {
  id: string;
  manual_id: string;
  sort_order: number;
  chapter: string | null;
  title: string;
  blocks: ManualBlock[];
  created_at: string;
  updated_at: string;
}

/** 冊子1件の画面（`GET /techops/manuals/:id`）が返す形 */
export interface ManualDetail extends ManualListItem {
  pages: ManualPage[];
}

/** 楽観ロック衝突。`shared/src/schedule/types.ts` の `ConflictError` と同じ形 */
export interface ConflictError {
  code: "CONFLICT";
  message: string;
  current_updated_at: string;
  updated_by_name: string | null;
}

/**
 * ひな形の一覧の1件（段E・production-manual.md §5-1・§10-5）。
 *
 * v1 で作るのは `scope: "org"`（組織共通）だけ——「この案件の前回の冊子から」は
 * このテーブルを経由せず `qsheet_manuals` を直接複製する別経路（`CreateManualPayload.copyFromManualId`）
 * なので、`scope: "project"` はクライアントからは到達しない（GET は常に scope=org を返す）。
 * ページの中身（`pages`）は一覧に持たない——選ぶ画面（`CreateManualDialog`）が必要とするのは
 * 名前と作成者だけで、複製そのものはサーバー（`POST /manuals` に `templateId` を渡す）が行う。
 */
export interface ManualTemplateListItem {
  id: string;
  name: string;
  scope: "org";
  page_count?: number;
  created_by: string | null;
  creator_name?: string | null;
  created_at: string;
}
