// 会場図面 — 盤（VenueBoard）の px 変換だけを閉じ込める。
// 設計: docs/design/v4/venue-layout.md §8-7「mm を唯一の単位にする」
// 「描画は純関数」「測って書き戻さない」。
//
// 盤の SVG は `viewBox` を mm で描く（`VenueBoard.tsx`）。この SVG の `width`/`height`
// 属性だけがズームに応じた px を持ち、画面表示の最後の一瞬でだけ mm→px の変換をする。
// ここに置くのはその変換の計算（純関数）で、DOM を測って座標へ書き戻す処理は
// 一切しない——`svgRef.getBoundingClientRect()` は「いまの1px あたりの mm」を
// 逆算するためだけに使う（ドラッグ中のポインタ位置→mm の変換。運営マニュアルの
// `pxPerMm()` と同じ考え方）。
import type { VenueFloor } from "@gmo-onair/shared/src/venue/types";

/** ズーム 100% のときの 1mm あたりの px（§6②「ズーム 25〜400%」の基準点） */
export const BASE_PX_PER_MM = 0.052;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;
/** 盤の周囲に足す余白（mm）。エリアの内法ぴったりだと壁際の品目が見切れる */
export const BOARD_MARGIN_MM = 1500;

export interface ViewBoxMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** エリア（または階全体）の表示範囲。§6②「階全体を表示」の切替もここで吸収する */
export function computeViewBox(
  areaBboxMm: { x: number; y: number; w: number; h: number },
  floor: Pick<VenueFloor, "grid" | "underlay"> | undefined,
  showWholeFloor: boolean,
): ViewBoxMm {
  if (showWholeFloor && floor) {
    const extent = computeFloorExtentMm(floor);
    if (extent) return extent;
  }
  return {
    x: areaBboxMm.x - BOARD_MARGIN_MM,
    y: areaBboxMm.y - BOARD_MARGIN_MM,
    w: areaBboxMm.w + BOARD_MARGIN_MM * 2,
    h: areaBboxMm.h + BOARD_MARGIN_MM * 2,
  };
}

/** 階全体の表示範囲（下敷きの実寸から。無ければグリッドの総延長を正方形として使う） */
function computeFloorExtentMm(floor: Pick<VenueFloor, "grid" | "underlay">): ViewBoxMm | null {
  const u = floor.underlay;
  if (u) {
    return {
      x: u.originMm.x - BOARD_MARGIN_MM,
      y: u.originMm.y - BOARD_MARGIN_MM,
      w: u.widthPx / u.pxPerMmX + BOARD_MARGIN_MM * 2,
      h: u.heightPx / u.pxPerMmY + BOARD_MARGIN_MM * 2,
    };
  }
  const total = floor.grid?.totalMm;
  if (total) return { x: -BOARD_MARGIN_MM, y: -BOARD_MARGIN_MM, w: total + BOARD_MARGIN_MM * 2, h: total + BOARD_MARGIN_MM * 2 };
  return null;
}

/** いまの1mmあたりの画面px（盤のSVGの実測幅 ÷ viewBoxの幅） */
export function pxPerMmFromRect(rectWidthPx: number, viewBox: ViewBoxMm): number {
  return viewBox.w > 0 ? rectWidthPx / viewBox.w : BASE_PX_PER_MM;
}

/** mm → 盤の画面座標（px。ルーラー・1mバー・札などのHTMLオーバーレイの位置決めに使う） */
export function mmToBoardPx(mm: { x: number; y: number }, viewBox: ViewBoxMm, pxPerMm: number): { x: number; y: number } {
  return { x: (mm.x - viewBox.x) * pxPerMm, y: (mm.y - viewBox.y) * pxPerMm };
}

/** 3桁区切りの整数表示（mm）。負の値もそのまま出す */
export function fmtMm(v: number): string {
  const n = Math.round(v);
  return n.toLocaleString("ja-JP");
}

export interface RulerTick {
  posPx: number;
  label: string;
  major: boolean;
}

/** ルーラーの目盛。込み合うときは 5m 間隔だけにする（§6②「ルーラー」） */
export function computeRulerTicks(viewBox: ViewBoxMm, pxPerMm: number, axis: "x" | "y"): RulerTick[] {
  const originMm = axis === "x" ? viewBox.x : viewBox.y;
  const lengthMm = axis === "x" ? viewBox.w : viewBox.h;
  const stepM = pxPerMm * 1000 >= 26 ? 1 : 5;
  const ticks: RulerTick[] = [];
  const startM = Math.floor(originMm / 1000 / stepM) * stepM;
  const endM = (originMm + lengthMm) / 1000;
  for (let m = startM; m <= endM; m += stepM) {
    const posPx = (m * 1000 - originMm) * pxPerMm;
    if (posPx < -1 || posPx > lengthMm * pxPerMm + 1) continue;
    const major = m % 5 === 0;
    ticks.push({ posPx, major, label: major ? `${m}m` : "" });
  }
  return ticks;
}
