// 会場図面 — 表示範囲(bounds・mm)の算出。エリアを選んでいればその内法の bbox、
// 「階全体」（エリア未選択）ならその階の全エリア・固定物を含む外接矩形
// （§8-4「26Fと27Fは同じ原点」なので、階が違っても同じ mm 空間で扱える）。
import type { VenueArea, VenueFixture } from "@gmo-onair/shared/src/venue/types";

export interface VenueBoundsMm { x: number; y: number; w: number; h: number }

const MARGIN_RATIO = 0.04;

function withMargin(b: VenueBoundsMm): VenueBoundsMm {
  const mx = b.w * MARGIN_RATIO;
  const my = b.h * MARGIN_RATIO;
  return { x: b.x - mx, y: b.y - my, w: b.w + mx * 2, h: b.h + my * 2 };
}

export function boundsForArea(area: VenueArea): VenueBoundsMm {
  return withMargin(area.bboxMm);
}

/** エリア未選択（階全体）のときの範囲。エリア・固定物が1つも無ければ null */
export function boundsForFloor(areas: VenueArea[], fixtures: VenueFixture[]): VenueBoundsMm | null {
  const boxes: VenueBoundsMm[] = [
    ...areas.map((a) => a.bboxMm),
    ...fixtures.filter((f): f is VenueFixture & { bboxMm: VenueBoundsMm } => !!f.bboxMm).map((f) => f.bboxMm),
  ];
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return withMargin({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
}

/** エリアの内法多角形（3点未満なら bbox の矩形で代用） */
export function polygonForArea(area: VenueArea): [number, number][] {
  if (area.polygonMm.length >= 3) return area.polygonMm;
  const b = area.bboxMm;
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
}

/** 通り芯のmm座標（§8-4「X16×Y16の交点が原点」なので index×pitchMmでそのまま求まる） */
export function axisLinesMm(grid: { x: string[]; y: string[]; pitchMm: number } | undefined): { x: number[]; y: number[] } | null {
  if (!grid) return null;
  return {
    x: grid.x.map((_, i) => i * grid.pitchMm),
    y: grid.y.map((_, i) => i * grid.pitchMm),
  };
}
