/**
 * 会場図面（新ミニアプリ）— 一気に並べる（§7）。React に依存しない純粋関数。
 * 「入力 → 薄いプレビュー → 置く」の入力側（`入力 → VenueItem[]`）だけをここに置く。
 * はみ出し・保有数との差は `geometry.ts`（`isItemOverflowing`）と呼び出し側で見る。
 *
 * ⚠️ 品目は伸ばせない（§8-7）。ここで作る `VenueItem` の w/d/diameter はカタログの
 * 実寸をそのまま写すだけで、配置座標（x/y・中心基準）だけを計算する。
 */
import type { VenueItem } from './types';

export type VenueArrangePreset = 'grid' | 'theater' | 'classroom' | 'island' | 'round' | 'u-shape' | 'o-shape';

/** 並べ方ごとの入力値。null は「未指定＝既定計算」（格子のピッチなど） */
export interface VenueArrangeParams {
  // grid
  rows?: number;
  cols?: number;
  pitchXMm?: number | null;
  pitchYMm?: number | null;
  itemKey?: string;
  // theater / classroom 共通
  centerAisleMm?: number;
  // theater
  pitchXMmTheater?: number;
  pitchYMmTheater?: number;
  sideAisleMm?: number;
  frontClearanceMm?: number;
  // classroom
  chairsPerTable?: number;
  tablesPerRow?: number;
  tableGapMm?: number;
  rowPitchMm?: number;
  // island
  tablesPerIsland?: number;
  chairsPerSide?: number;
  islands?: number;
  islandGapMm?: number;
  // round
  chairs?: number;
  radiusMm?: number;
  // u-shape / o-shape
  widthTables?: number;
  depthTables?: number;
  chairsOutside?: boolean;
  innerClearanceMm?: number;
}

export interface VenueArrangeResult {
  /** 起点（0,0）を基準にした相対座標の品目。呼び出し側で起点へ平行移動する */
  items: VenueItem[];
  /** 外接寸法（mm） */
  bbox: { w: number; h: number };
  /** 品目キーごとの必要数（保有数との差の判定に使う） */
  counts: Record<string, number>;
}

const TABLE_KEY = 'long-table-white';
const CHAIR_KEY = 'rubeck-chair';
const HIGH_TABLE_KEY = 'high-table';
const HIGH_CHAIR_KEY = 'high-chair';

let seq = 0;
/** 並べた結果の品目 id を発番する（呼び出しごとに一意。永続化前提ではないので単純なカウンタで足りる） */
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function makeItem(key: string, w: number, d: number, x: number, y: number, rotation: number, groupId: string): VenueItem {
  return { id: nextId(key), kind: 'catalog', key, x, y, w, d, rotation, z: 0, groupId };
}

function bboxOf(items: VenueItem[]): { w: number; h: number } {
  if (items.length === 0) return { w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const w = it.w ?? it.diameter ?? 0;
    const d = it.d ?? it.diameter ?? 0;
    minX = Math.min(minX, it.x - w / 2);
    minY = Math.min(minY, it.y - d / 2);
    maxX = Math.max(maxX, it.x + w / 2);
    maxY = Math.max(maxY, it.y + d / 2);
  }
  return { w: maxX - minX, h: maxY - minY };
}

function countBy(items: VenueItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of items) {
    if (!it.key) continue;
    counts[it.key] = (counts[it.key] ?? 0) + 1;
  }
  return counts;
}

/** §7「格子に並べる」。行×列。ピッチ未指定なら品目の幅・奥行＋50（劇場形式の内部もこれを使う） */
export function arrangeGrid(
  key: string,
  itemW: number,
  itemD: number,
  params: Pick<VenueArrangeParams, 'rows' | 'cols' | 'pitchXMm' | 'pitchYMm'>,
  groupId: string,
): VenueArrangeResult {
  const rows = params.rows ?? 2;
  const cols = params.cols ?? 2;
  const pitchX = params.pitchXMm ?? itemW + 50;
  const pitchY = params.pitchYMm ?? itemD + 50;
  const items: VenueItem[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      items.push(makeItem(key, itemW, itemD, c * pitchX, r * pitchY, 0, groupId));
    }
  }
  return { items, bbox: bboxOf(items), counts: countBy(items) };
}

/** §7「劇場形式」。椅子を rows×cols、中央通路つき。奇数列でも中央通路は列数が偶数のとき中央（§7 の入力表） */
export function arrangeTheater(params: VenueArrangeParams, chairW = 535, chairD = 490, groupId = nextId('grp')): VenueArrangeResult {
  const rows = params.rows ?? 5;
  const cols = params.cols ?? 10;
  const pitchX = params.pitchXMmTheater ?? 550;
  const pitchY = params.pitchYMmTheater ?? 900;
  const centerAisle = params.centerAisleMm ?? 1200;
  const sideAisle = params.sideAisleMm ?? 600;
  const frontClearance = params.frontClearanceMm ?? 1500;
  const leftCols = Math.ceil(cols / 2);
  const rightCols = cols - leftCols;
  const items: VenueItem[] = [];
  for (let r = 0; r < rows; r++) {
    const y = frontClearance + r * pitchY;
    for (let c = 0; c < leftCols; c++) {
      const x = sideAisle + c * pitchX;
      items.push(makeItem(CHAIR_KEY, chairW, chairD, x, y, 180, groupId));
    }
    for (let c = 0; c < rightCols; c++) {
      const x = sideAisle + leftCols * pitchX + centerAisle + c * pitchX;
      items.push(makeItem(CHAIR_KEY, chairW, chairD, x, y, 180, groupId));
    }
  }
  return { items, bbox: bboxOf(items), counts: countBy(items) };
}

/** §7「スクール形式」。長机3列×4行、机1台に椅子2脚（机の手前） */
export function arrangeClassroom(params: VenueArrangeParams, groupId = nextId('grp')): VenueArrangeResult {
  const chairsPerTable = params.chairsPerTable ?? 2;
  const tablesPerRow = params.tablesPerRow ?? 3;
  const rows = params.rows ?? 4;
  const tableGap = params.tableGapMm ?? 0;
  const rowPitch = params.rowPitchMm ?? 1500;
  const centerAisle = params.centerAisleMm ?? 1200;
  const tableW = 1800;
  const tableD = 600;
  const leftTables = Math.ceil(tablesPerRow / 2);
  const rightTables = tablesPerRow - leftTables;
  const items: VenueItem[] = [];
  const placeRow = (rowIdx: number, tableCount: number, xOffset: number) => {
    const y = rowIdx * rowPitch;
    for (let t = 0; t < tableCount; t++) {
      const x = xOffset + t * (tableW + tableGap);
      items.push(makeItem(TABLE_KEY, tableW, tableD, x + tableW / 2, y, 0, groupId));
      const chairGap = tableW / (chairsPerTable + 1);
      for (let ci = 0; ci < chairsPerTable; ci++) {
        const cx = x + chairGap * (ci + 1);
        items.push(makeItem(CHAIR_KEY, 535, 490, cx, y + tableD / 2 + 490 / 2, 180, groupId));
      }
    }
  };
  for (let r = 0; r < rows; r++) {
    placeRow(r, leftTables, 0);
    if (rightTables > 0) placeRow(r, rightTables, leftTables * (tableW + tableGap) + centerAisle);
  }
  return { items, bbox: bboxOf(items), counts: countBy(items) };
}

/** §7「島形式」。長机2本を向かい合わせ（1,800×1,200の島）・片側に椅子・4島 */
export function arrangeIsland(params: VenueArrangeParams, groupId = nextId('grp')): VenueArrangeResult {
  const chairsPerSide = params.chairsPerSide ?? 3;
  const islands = params.islands ?? 4;
  const islandGap = params.islandGapMm ?? 1500;
  const tableW = 1800;
  const tableD = 600;
  const islandD = 1200; // 2本の机（各600）を向かい合わせた奥行
  const items: VenueItem[] = [];
  for (let i = 0; i < islands; i++) {
    const baseX = i * (tableW + islandGap);
    items.push(makeItem(TABLE_KEY, tableW, tableD, baseX + tableW / 2, tableD / 2, 0, groupId));
    items.push(makeItem(TABLE_KEY, tableW, tableD, baseX + tableW / 2, islandD - tableD / 2, 180, groupId));
    const gap = tableW / (chairsPerSide + 1);
    for (let c = 0; c < chairsPerSide; c++) {
      const cx = baseX + gap * (c + 1);
      items.push(makeItem(CHAIR_KEY, 535, 490, cx, -490 / 2 - 50, 180, groupId));
      items.push(makeItem(CHAIR_KEY, 535, 490, cx, islandD + 490 / 2 + 50, 0, groupId));
    }
  }
  return { items, bbox: bboxOf(items), counts: countBy(items) };
}

/** §7「円卓」。ハイテーブルØ600を中心に、半径550の円周へ椅子を等間隔（各椅子はテーブルを向く） */
export function arrangeRound(params: VenueArrangeParams, groupId = nextId('grp')): VenueArrangeResult {
  const chairs = params.chairs ?? 4;
  const radius = params.radiusMm ?? 550;
  const items: VenueItem[] = [makeItem(HIGH_TABLE_KEY, 600, 600, radius, radius, 0, groupId)];
  for (let i = 0; i < chairs; i++) {
    const angle = (2 * Math.PI * i) / chairs;
    const cx = radius + radius * Math.sin(angle);
    const cy = radius - radius * Math.cos(angle);
    // テーブル中心を向く角度（正面は −y。テーブルへ向けるには中心方向へ180度反転した回転を与える）
    const rotationDeg = (angle * 180) / Math.PI;
    items.push(makeItem(HIGH_CHAIR_KEY, 400, 400, cx, cy, rotationDeg, groupId));
  }
  return { items, bbox: bboxOf(items), counts: countBy(items) };
}

/** §7「コの字」「ロの字」共通の実装。`closed=false` がコの字（正面が開く）、`true` がロの字（閉じる） */
function arrangeShape(params: VenueArrangeParams, closed: boolean, groupId: string): VenueArrangeResult {
  const widthTables = params.widthTables ?? 3;
  const depthTables = params.depthTables ?? 2;
  const innerClearance = params.innerClearanceMm ?? 1800;
  const tableW = 1800;
  const tableD = 600;
  const innerW = widthTables * tableW;
  const innerH = innerClearance;
  const items: VenueItem[] = [];
  // 奥辺（正面から見て一番奥。widthTables 本を横一列）
  for (let i = 0; i < widthTables; i++) {
    const x = i * tableW + tableW / 2;
    items.push(makeItem(TABLE_KEY, tableW, tableD, x, tableD / 2, 0, groupId));
    items.push(makeItem(CHAIR_KEY, 535, 490, x, -490 / 2 - 50, 180, groupId));
  }
  // 左右辺（depthTables 本ずつ縦に並べる。奥辺の分は除く）
  for (let i = 0; i < depthTables; i++) {
    const y = tableD + i * tableD + tableD / 2;
    items.push(makeItem(TABLE_KEY, tableD, tableW, -tableD / 2 - 50, y, 90, groupId));
    items.push(makeItem(CHAIR_KEY, 490, 535, -tableD - 50 - 490 / 2 - 50, y, -90, groupId));
    items.push(makeItem(TABLE_KEY, tableD, tableW, innerW + tableD / 2 + 50, y, -90, groupId));
    items.push(makeItem(CHAIR_KEY, 490, 535, innerW + tableD + 50 + 490 / 2 + 50, y, 90, groupId));
  }
  // ロの字（閉じる）: 手前辺も足す
  if (closed) {
    const frontY = tableD + depthTables * tableD + tableD / 2;
    for (let i = 0; i < widthTables; i++) {
      const x = i * tableW + tableW / 2;
      items.push(makeItem(TABLE_KEY, tableW, tableD, x, frontY, 180, groupId));
      items.push(makeItem(CHAIR_KEY, 535, 490, x, frontY + tableD / 2 + 490 / 2 + 50, 0, groupId));
    }
  }
  void innerH;
  return { items, bbox: bboxOf(items), counts: countBy(items) };
}

/** §7「コの字」 */
export function arrangeUShape(params: VenueArrangeParams, groupId = nextId('grp')): VenueArrangeResult {
  return arrangeShape(params, false, groupId);
}

/** §7「ロの字」 */
export function arrangeOShape(params: VenueArrangeParams, groupId = nextId('grp')): VenueArrangeResult {
  return arrangeShape(params, true, groupId);
}

/** 並べ方キー → 実装。`grid` だけ品目・寸法が呼び出し側指定のため別シグネチャ（`arrangeGrid` を直接呼ぶ） */
export const ARRANGE_PRESETS: Record<Exclude<VenueArrangePreset, 'grid'>, (params: VenueArrangeParams, groupId?: string) => VenueArrangeResult> = {
  // `arrangeTheater` は椅子の寸法（chairW/chairD）を差し込めるよう引数を1つ多く持つため、
  // このマップの共通シグネチャ（params, groupId）に合わせてラップする（既定値 535×490 のまま・挙動は変えない）
  theater: (params, groupId) => arrangeTheater(params, undefined, undefined, groupId),
  classroom: arrangeClassroom,
  island: arrangeIsland,
  round: arrangeRound,
  'u-shape': arrangeUShape,
  'o-shape': arrangeOShape,
};

/** グループの平行移動（起点を area 内の指定座標へ合わせる。§7「起点はエリアの正面から前の空きを取った中央」） */
export function translateArrangeResult(result: VenueArrangeResult, dx: number, dy: number): VenueItem[] {
  return result.items.map((it) => ({ ...it, x: it.x + dx, y: it.y + dy }));
}
