/**
 * 会場図面（新ミニアプリ）— サーバー側の型。
 * 設計の正: docs/design/v4/venue-layout.md §5（データの持ち方）。
 * 型の正（クライアント側）: shared/src/venue/types.ts。
 *
 * server は shared/ を import できない（server/tsconfig.json の rootDir 制約）ため、
 * ここへ手で同じ形を写す。scripts/check-collab-parity.mjs の対象（PAIRS）ではない
 * ——このファイルはクライアントの描画には使わず、サーバー内部（サービス層・resolver）の
 * 型注釈にだけ使う純データ型なので、乖離しても即座に画面が壊れる類のものではない。
 * ただし `VenueItem` の形と `qsheet_venue_*` の列名は、shared 側の型・migration 298 と
 * 必ず揃えること。
 */

export type VenueItemKind = 'catalog' | 'camera' | 'person' | 'shape' | 'text' | 'line' | 'dimension' | 'group';

/** 図面に置く品目1個（`qsheet_venue_layouts.items` の配列要素）。§5-2 */
export interface VenueItem {
  id: string;
  kind: VenueItemKind;
  /** catalog / camera / person のとき、カタログの `key`（rubeck-chair など） */
  key?: string;
  /** 階の絶対座標（mm）。足元の中心 */
  x: number;
  y: number;
  /** 度。正面は −y */
  rotation: number;
  z: number;
  /** `shape` だけ編集できる。備品・人・カメラはカタログの値を写すだけ（伸ばせない） */
  w?: number;
  d?: number;
  diameter?: number;
  /** line / dimension / ベルトパーテーション（2点で置く） */
  points?: [number, number][];
  /** ステージの h200 / h400 など */
  variant?: string;
  /** クレーンのアーム。台車の rotation と独立 */
  armAngle?: number;
  /** 図形・文字の名前／注記 */
  label?: string;
  style?: Record<string, string | number>;
  groupId?: string;
  locked?: boolean;
  /** 並べた結果のグループだけ持つ（§7） */
  arrange?: { preset: string; params: Record<string, number | string | null> };
}

export interface VenueCalibration {
  mmPerPtX?: number;
  mmPerPtY?: number;
  originPt?: { x: number; y: number };
  gridLinePt?: Record<string, number>;
  method?: string;
}

export interface VenueGrid {
  x?: string[];
  y?: string[];
  pitchMm?: number;
  totalMm?: number;
  subTickMm?: { x?: number[]; y?: number[] };
  extra?: Record<string, unknown>;
}

export interface VenueUnderlay {
  file: string;
  originMm: { x: number; y: number };
  pxPerMmX: number;
  pxPerMmY: number;
  widthPx: number;
  heightPx: number;
}

/** 固定物の `kind`。migration 299 の実データは `route`（搬入ルート）等この他の値も持つため
 *  文字列一般で受ける（読み取り専用のマスタで、サーバーはここへ検証を課さない）。 */
export type VenueFixtureKind = 'wall' | 'truss' | 'stair' | 'elevator' | 'door' | 'screen' | 'route' | 'other' | string;

export interface VenueFixture {
  key: string;
  floor: string;
  area?: string | null;
  label: string;
  kind: VenueFixtureKind;
  bboxMm?: { x: number; y: number; w: number; h: number };
  sizeMm?: { w?: number; d?: number; h?: number };
  estimated?: boolean;
  note?: string;
  /** トラス脚の `legsMm`・折れ線の `polylineMm`・線の `lineMm` など、固定物ごとに違う
   *  付帯データを許す（§10-3。読み取り専用なので厳密な判別共用体にしない） */
  [extra: string]: unknown;
}

export interface VenueVerificationCheck {
  what: string;
  expectedMm: number | string;
  measuredMm?: number | string;
}

/** `qsheet_venue_floors` の1行 */
export interface VenueFloor {
  id: string;
  venueName: string;
  locationId: string | null;
  floorLabel: string;
  sortOrder: number;
  calibration: VenueCalibration;
  grid: VenueGrid;
  underlay: VenueUnderlay | null;
  fixtures: VenueFixture[];
  verification: VenueVerificationCheck[];
  verifiedAt: string | null;
  verifiedByName?: string | null;
}

/** `qsheet_venue_areas` の1行 */
export interface VenueArea {
  id: string;
  floorId: string;
  key: string;
  label: string;
  polygonMm: [number, number][];
  bboxMm: { x: number; y: number; w: number; h: number };
  drawnAreaM2: number | null;
  shownAreaM2: number | null;
  roomId: string | null;
  underlay: VenueUnderlay | null;
  estimated: boolean;
  sortOrder: number;
}

/** `GET /techops/venue-floors` が返す形（§5-4「階＋エリア＋固定物＋下敷き」） */
export interface VenueFloorWithAreas extends VenueFloor {
  areas: VenueArea[];
}

export type VenueCatalogCategory = 'furniture' | 'monitor' | 'appliance' | 'sign' | 'service' | 'camera' | 'people' | 'generic';

export type VenueFootprint =
  | { shape: 'rect'; w: number; d: number }
  | { shape: 'circle'; diameter?: number }
  | { shape: 'line'; length?: number; postDiameter?: number }
  | { shape: 'none' };

/** `qsheet_venue_catalog_items` の1行 */
export interface VenueCatalogItem {
  key: string;
  category: VenueCatalogCategory;
  listNo: string | null;
  label: string;
  sizeMm: Record<string, unknown>;
  footprint: VenueFootprint;
  qty: number | null;
  unit: string | null;
  storage: string | null;
  symbol: string;
  front: boolean;
  estimated: boolean;
  toConfirm: string | null;
  fixed: boolean;
  confirmed: Record<string, unknown>;
  extra: Record<string, unknown>;
  equipmentItemId: string | null;
  sortOrder: number;
}

export type VenueLayoutStatus = 'draft' | 'fixed' | 'archived';

/** 一覧行（`GET /techops/venue-layouts`）。§5-4・§6① */
export interface VenueLayoutSummary {
  id: string;
  docNo: string | null;
  title: string;
  projectId: string | null;
  programId: string | null;
  projectName?: string | null;
  glsNumber?: string | null;
  programName?: string | null;
  floorId: string;
  floorLabel?: string | null;
  areaId: string | null;
  areaLabel?: string | null;
  planLabel: string | null;
  copiedFrom: string | null;
  status: VenueLayoutStatus;
  rev: number;
  createdBy: string | null;
  creatorName?: string | null;
  updatedBy: string | null;
  updaterName?: string | null;
  updatedAt: string;
  createdAt: string;
  lockedBy: string | null;
  lockedByName?: string | null;
  lockedAt: string | null;
  lockRequestedBy: string | null;
  lockRequestedByName?: string | null;
  lockRequestedAt: string | null;
}

/** 詳細（`GET /techops/venue-layouts/:id`）。§5-4 */
export interface VenueLayoutDetail extends VenueLayoutSummary {
  items: VenueItem[];
}
