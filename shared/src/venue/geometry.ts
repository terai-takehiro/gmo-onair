/**
 * 会場図面（新ミニアプリ）— 縮尺変換・当たり判定の純粋関数。React に依存しない。
 * 設計: docs/design/v4/venue-layout.md §8（縮尺の規律と担保）。
 *
 * ⚠️ 選ぶ・つかんで動かす・8方向リサイズ・回転・整列・等間隔・重ね順は
 * **運営マニュアルの `client-techops/src/pages/opsmanual/manualCanvasGeometry.ts` をそのまま使う**
 * （`alignBlocks`・`distributeBlocks`・`reorderZ`・`rectsIntersect`・`angleFromCenter`・
 * `normalizeAngle`・`beginResize`・`applyResize`・`clamp`・`isEditableTarget` は完全に汎用の
 * 純粋関数で書き換えが要らない。§6 ②の操作表のとおり）。ここに置くのは、それらの関数へ
 * 渡す前に `VenueItem`（中心 x/y）を `{x,y,w,h}`（左上基準）へ変換するアダプタと、
 * 会場図面だけに要る計算（2軸縮尺・スナップ先・はみ出し判定・仕上がりの自動縮尺）。
 */
import type { VenueFixture, VenueItem, VenueUnderlay } from './types';

// ── 2軸の縮尺変換（§8-1・§8-3） ──────────────────────────────

/** mm → 下敷き画像の px（X と Y で別の縮尺。§8-3 の式） */
export function mmToUnderlayPx(mm: { x: number; y: number }, underlay: VenueUnderlay): { x: number; y: number } {
  return {
    x: (mm.x - underlay.originMm.x) * underlay.pxPerMmX,
    y: (mm.y - underlay.originMm.y) * underlay.pxPerMmY,
  };
}

/** 下敷き画像の px → mm（逆変換） */
export function underlayPxToMm(px: { x: number; y: number }, underlay: VenueUnderlay): { x: number; y: number } {
  return {
    x: px.x / underlay.pxPerMmX + underlay.originMm.x,
    y: px.y / underlay.pxPerMmY + underlay.originMm.y,
  };
}

// ── 品目の足元の大きさ（§4-3・§5-2） ──────────────────────────

export interface FootprintSize {
  /** 外接矩形の幅・奥行（mm）。円は直径を w=d として持つ */
  w: number;
  d: number;
  shape: 'rect' | 'circle' | 'line' | 'point';
}

/** 品目1個の足元の大きさ（外接矩形）。line/dimension は2点の外接矩形、それ以外は w/d か diameter から */
export function itemFootprintSize(item: VenueItem): FootprintSize {
  if (item.points && item.points.length >= 2) {
    const xs = item.points.map((p) => p[0]);
    const ys = item.points.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    return { w: Math.max(w, 1), d: Math.max(d, 1), shape: 'line' };
  }
  if (typeof item.diameter === 'number') {
    return { w: item.diameter, d: item.diameter, shape: 'circle' };
  }
  if (typeof item.w === 'number' && typeof item.d === 'number') {
    return { w: item.w, d: item.d, shape: 'rect' };
  }
  return { w: 1, d: 1, shape: 'point' };
}

/** `VenueItem`（中心 x/y）を、運営マニュアルの汎用関数が要求する左上基準の `{x,y,w,h}` に変換する */
export function toTopLeftRect(item: VenueItem): { id: string; x: number; y: number; w: number; h: number } {
  const { w, d } = itemFootprintSize(item);
  if (item.points && item.points.length >= 2) {
    const xs = item.points.map((p) => p[0]);
    const ys = item.points.map((p) => p[1]);
    return { id: item.id, x: Math.min(...xs), y: Math.min(...ys), w, h: d };
  }
  return { id: item.id, x: item.x - w / 2, y: item.y - d / 2, w, h: d };
}

/** `toTopLeftRect` の逆。整列・等間隔・リサイズ後の `{x,y,w,h}` を品目の中心座標へ戻す（line/dimension は points も動かす） */
export function fromTopLeftRect(item: VenueItem, rect: { x: number; y: number; w: number; h: number }): VenueItem {
  if (item.points && item.points.length >= 2) {
    const orig = toTopLeftRect(item);
    const scaleX = orig.w > 0 ? rect.w / orig.w : 1;
    const scaleY = orig.h > 0 ? rect.h / orig.h : 1;
    const points: [number, number][] = item.points.map(([px, py]) => [
      rect.x + (px - orig.x) * scaleX,
      rect.y + (py - orig.y) * scaleY,
    ]);
    return { ...item, points };
  }
  const next: VenueItem = { ...item, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  if (typeof item.diameter === 'number') next.diameter = rect.w;
  else if (typeof item.w === 'number' && typeof item.d === 'number') {
    next.w = rect.w;
    next.d = rect.h;
  }
  return next;
}

// ── スナップ先（§6 ②「スナップ先は壁・通り芯・他の品目の端と中心・1mグリッド」） ─────

export interface VenueSnapTargets {
  vertical: number[];
  horizontal: number[];
}

/**
 * スナップ先を集める。壁（エリアの bbox の辺と中心）・通り芯（`axisLinesMm`）・
 * 他の品目の端と中心・1mグリッド（`gridOn` のときだけ）。`SNAP_THRESHOLD_MM` の判定自体は
 * 呼び出し側（`manualCanvasGeometry.ts` の `snapPosition`）が行う——ここは候補の列挙だけ。
 */
export function collectVenueSnapTargets(
  items: VenueItem[],
  excludeIds: string[],
  areaBboxMm: { x: number; y: number; w: number; h: number },
  axisLinesMm: { x: number[]; y: number[] },
  gridOn: boolean,
): VenueSnapTargets {
  const vertical = [areaBboxMm.x, areaBboxMm.x + areaBboxMm.w / 2, areaBboxMm.x + areaBboxMm.w, ...axisLinesMm.x];
  const horizontal = [areaBboxMm.y, areaBboxMm.y + areaBboxMm.h / 2, areaBboxMm.y + areaBboxMm.h, ...axisLinesMm.y];
  for (const item of items) {
    if (excludeIds.includes(item.id)) continue;
    const r = toTopLeftRect(item);
    vertical.push(r.x, r.x + r.w / 2, r.x + r.w);
    horizontal.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  if (gridOn) {
    const gStartX = Math.floor(areaBboxMm.x / 1000) * 1000;
    const gEndX = Math.ceil((areaBboxMm.x + areaBboxMm.w) / 1000) * 1000;
    for (let gx = gStartX; gx <= gEndX; gx += 1000) vertical.push(gx);
    const gStartY = Math.floor(areaBboxMm.y / 1000) * 1000;
    const gEndY = Math.ceil((areaBboxMm.y + areaBboxMm.h) / 1000) * 1000;
    for (let gy = gStartY; gy <= gEndY; gy += 1000) horizontal.push(gy);
  }
  return { vertical, horizontal };
}

// ── はみ出し判定（§4-5） ────────────────────────────────────

function pointInPolygon(pt: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function rectOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * 品目の足元4隅がエリアの内法（多角形。無ければ bbox）の外に出るか、固定物に重なるかを見る。
 * どちらか一方でも true なら「はみ出し」（§4-5。置くのは止めず、赤いハッチと仕上がりの検査に使う）。
 */
export function isItemOverflowing(
  item: VenueItem,
  area: { polygonMm: [number, number][]; bboxMm: { x: number; y: number; w: number; h: number } },
  fixtures: VenueFixture[],
): boolean {
  const rect = toTopLeftRect(item);
  const corners: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ];
  const polygon = area.polygonMm.length >= 3 ? area.polygonMm : bboxToPolygon(area.bboxMm);
  const outside = corners.some((c) => !pointInPolygon(c, polygon));
  if (outside) return true;
  for (const f of fixtures) {
    if (!f.bboxMm) continue;
    if (rectOverlap(rect, f.bboxMm)) return true;
  }
  return false;
}

function bboxToPolygon(b: { x: number; y: number; w: number; h: number }): [number, number][] {
  return [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ];
}

// ── 仕上がりの自動縮尺（§9-1: 段は 1:50/75/100/150/200/250/300/400） ───────────

export const SCALE_STEPS = [50, 75, 100, 150, 200, 250, 300, 400] as const;

/**
 * 幅と高さの**両方**が版面（紙・ブロックの実寸）に収まる最大の切りのよい縮尺を選ぶ
 * （§9-1 の注記どおり、幅だけ見て決めると高さが入らないことがある）。
 * どの段でも収まらなければ最大の段（縮小率がいちばん高い＝分母が最大）を返す。
 */
export function computeAutoScale(
  contentWidthMm: number,
  contentHeightMm: number,
  paperWidthMm: number,
  paperHeightMm: number,
): number {
  for (const scale of SCALE_STEPS) {
    if (contentWidthMm / scale <= paperWidthMm && contentHeightMm / scale <= paperHeightMm) return scale;
  }
  return SCALE_STEPS[SCALE_STEPS.length - 1];
}

/** 品目の配列から外接矩形（mm）を出す。空配列なら null */
export function computeBBox(items: VenueItem[]): { x: number; y: number; w: number; h: number } | null {
  if (items.length === 0) return null;
  const rects = items.map(toTopLeftRect);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
