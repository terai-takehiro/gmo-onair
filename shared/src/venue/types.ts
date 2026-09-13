/**
 * 会場図面（新ミニアプリ）— 型の正。
 * 設計: docs/design/v4/venue-layout.md §5-2（品目の形）・§8（縮尺）。
 *
 * ⚠️ mm を唯一の単位にする（§8-7）。px はここに一切持たせない
 * （「mm → 画面の px」は client 側の描画時にだけ計算する）。
 */

/** 品目の種類。`catalog` はカタログ（備品・カメラ・人）を参照、`shape`〜`dimension` は自由図形、`group` は並べた結果や複数選択のまとめ */
export type VenueItemKind = 'catalog' | 'camera' | 'person' | 'shape' | 'text' | 'line' | 'dimension' | 'group';

/** 図形の下位種別（`kind: 'shape'` のときの見た目） */
export type VenueShapeVariant = 'rect' | 'circle';

/**
 * 図面に置く品目1個。`ManualBlockBase { id; x; y; w; h; z; rotation? }` と同じ骨格
 * （`shared/src/opsmanual/types.ts`）なので、運営マニュアルの純粋関数
 * （`alignBlocks`・`distributeBlocks`・`reorderZ`・`snapPosition`・`applyResize`・`angleFromCenter`。
 * `client-techops/src/pages/opsmanual/manualCanvasGeometry.ts`）にそのまま渡せる。
 */
export interface VenueItem {
  id: string;
  kind: VenueItemKind;
  /** catalog / camera / person のとき、カタログの `key`（rubeck-chair など） */
  key?: string;
  /** 階の絶対座標（mm）。X16×Y16 の交点が原点・右が +x・下が +y。足元の中心 */
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
  /** 線種（実線／点線）など CSS に落ちる値だけ */
  style?: Record<string, string | number>;
  groupId?: string;
  locked?: boolean;
  /** 並べた結果のグループだけ持つ。並べ直しの入力値（§7） */
  arrange?: { preset: string; params: Record<string, number | string | null> };
}

export interface VenueCalibration {
  mmPerPtX: number;
  mmPerPtY: number;
  originPt: { x: number; y: number };
  gridLinePt?: Record<string, number>;
  method?: string;
}

export interface VenueGrid {
  x: string[];
  y: string[];
  pitchMm: number;
  totalMm: number;
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

export type VenueFixtureKind = 'wall' | 'truss' | 'stair' | 'elevator' | 'door' | 'screen' | 'loading' | 'other';

export interface VenueFixture {
  key: string;
  floor: string;
  area?: string;
  label: string;
  kind: VenueFixtureKind;
  bboxMm?: { x: number; y: number; w: number; h: number };
  sizeMm?: { w: number; h: number };
  estimated?: boolean;
  note?: string;
}

export interface VenueVerificationCheck {
  what: string;
  expectedMm: number | string;
  measuredMm?: number | string;
}

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

export type VenueCatalogCategory = 'furniture' | 'monitor' | 'appliance' | 'sign' | 'service' | 'camera' | 'people' | 'generic';

export type VenueFootprint =
  | { shape: 'rect'; w: number; d: number }
  | { shape: 'circle'; diameter: number }
  | { shape: 'line'; length: number }
  | { shape: 'none' };

export interface VenueCatalogItem {
  key: string;
  category: VenueCatalogCategory;
  listNo: string | null;
  label: string;
  sizeMm: Record<string, number | boolean | undefined>;
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
  floorLabel?: string;
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
  /** その図面を差し込んでいる運営マニュアルの一覧（§9-6「冊子に載っています」） */
  linkedManuals?: { id: string; docNo: string | null; title: string; status: string }[];
}

export interface VenueLayoutDetail extends VenueLayoutSummary {
  items: VenueItem[];
}

/** 楽観ロックの衝突（`ConflictError` と同じ形。スケジュール表・運営マニュアルと同じ） */
export interface VenueConflictError {
  code: 'CONFLICT';
  message: string;
  current_updated_at: string;
  updated_by_name: string | null;
}

/** 編集ロックの競合（`LockError` と同じ形） */
export interface VenueLockError {
  code: 'LOCKED';
  message: string;
  locked_by: string | null;
  locked_by_name: string | null;
}
