// 会場図面 — 「並べ方」の入力欄の構成（設計: docs/design/v4/venue-layout.md §7・§11-5）。
// `VenueArrangePanel`（新しく並べる）と `VenueInspector`（グループの「並べ直す」）の
// 両方が同じ入力欄の定義を使うため、ここに1つだけ置く。
//
// ⚠️ v1 の割り切り: `shared/src/venue/arrange.ts`（触らない）は「向き先」
// （客席を任意の点へ向ける）や「起点をつかんで動かす」引数を持たない純粋関数のため、
// その2つはこの入力欄には出さない。
import type { VenueCatalogItem, VenueItem } from "@gmo-onair/shared/src/venue/types";
import {
  ARRANGE_PRESETS,
  arrangeGrid,
  type VenueArrangeParams,
  type VenueArrangePreset,
  type VenueArrangeResult,
} from "@gmo-onair/shared/src/venue/arrange";

export const PRESET_LABEL: Record<VenueArrangePreset, string> = {
  grid: "格子形式", theater: "劇場形式", classroom: "スクール形式", island: "島形式",
  round: "円卓", "u-shape": "コの字", "o-shape": "ロの字",
};

export interface ArrangeFieldDef { key: keyof VenueArrangeParams; label: string; step: number; min: number; max: number }

export const ARRANGE_FIELDS: Record<VenueArrangePreset, ArrangeFieldDef[]> = {
  grid: [
    { key: "rows", label: "行", step: 1, min: 1, max: 20 }, { key: "cols", label: "列", step: 1, min: 1, max: 20 },
  ],
  theater: [
    { key: "rows", label: "行", step: 1, min: 1, max: 20 }, { key: "cols", label: "列", step: 1, min: 1, max: 24 },
    { key: "pitchXMmTheater", label: "横ピッチ", step: 50, min: 400, max: 1200 }, { key: "pitchYMmTheater", label: "縦ピッチ", step: 50, min: 600, max: 1600 },
    { key: "centerAisleMm", label: "中央通路", step: 100, min: 0, max: 3000 }, { key: "sideAisleMm", label: "脇", step: 100, min: 0, max: 2000 },
    { key: "frontClearanceMm", label: "前の空き", step: 100, min: 0, max: 6000 },
  ],
  classroom: [
    { key: "tablesPerRow", label: "机（列）", step: 1, min: 1, max: 8 }, { key: "rows", label: "行", step: 1, min: 1, max: 10 },
    { key: "chairsPerTable", label: "机1台の椅子", step: 1, min: 1, max: 4 }, { key: "rowPitchMm", label: "行ピッチ", step: 100, min: 900, max: 2400 },
    { key: "centerAisleMm", label: "中央通路", step: 100, min: 0, max: 3000 },
  ],
  island: [
    { key: "islands", label: "島の数", step: 1, min: 1, max: 12 }, { key: "chairsPerSide", label: "片側の椅子", step: 1, min: 1, max: 6 },
    { key: "islandGapMm", label: "島の間", step: 100, min: 500, max: 3000 },
  ],
  round: [
    { key: "chairs", label: "椅子の数", step: 1, min: 2, max: 12 }, { key: "radiusMm", label: "半径", step: 50, min: 300, max: 1500 },
  ],
  "u-shape": [
    { key: "widthTables", label: "幅（机の数）", step: 1, min: 1, max: 8 }, { key: "depthTables", label: "奥行（机の数）", step: 1, min: 0, max: 6 },
    { key: "innerClearanceMm", label: "内側の空き", step: 100, min: 600, max: 4000 },
  ],
  "o-shape": [
    { key: "widthTables", label: "幅（机の数）", step: 1, min: 1, max: 8 }, { key: "depthTables", label: "奥行（机の数）", step: 1, min: 0, max: 6 },
    { key: "innerClearanceMm", label: "内側の空き", step: 100, min: 600, max: 4000 },
  ],
};

export const ARRANGE_USED_ITEMS: Record<VenueArrangePreset, string> = {
  grid: "選んだ品目", theater: "ルベックチェア", classroom: "長机（白）＋ルベックチェア", island: "長机（白）＋ルベックチェア",
  round: "ハイテーブル＋ハイチェア", "u-shape": "長机（白）＋ルベックチェア", "o-shape": "長机（白）＋ルベックチェア",
};

/** 並べ方1つぶんの結果を計算する（`grid` だけ品目・寸法が要るので分岐する） */
export function computeArrangeResult(
  preset: VenueArrangePreset,
  params: VenueArrangeParams,
  gridItem: VenueCatalogItem | undefined,
  groupId: string,
): VenueArrangeResult {
  if (preset === "grid") {
    const w = gridItem?.footprint.shape === "rect" ? gridItem.footprint.w : gridItem?.footprint.shape === "circle" ? gridItem.footprint.diameter : 500;
    const d = gridItem?.footprint.shape === "rect" ? gridItem.footprint.d : gridItem?.footprint.shape === "circle" ? gridItem.footprint.diameter : 500;
    return arrangeGrid(gridItem?.key ?? params.itemKey ?? "rubeck-chair", w, d, params, groupId);
  }
  return ARRANGE_PRESETS[preset](params, groupId);
}

/**
 * `arrange.ts` の `VenueArrangeResult.bbox` は幅・高さだけ（`shared/src/venue/arrange.ts`
 * の `bboxOf`。触らない）で、左上の位置（min）は持たない。劇場形式は既定で
 * `frontClearanceMm`(1500)・`sideAisleMm`(600) の分だけ原点からずれた場所に品目を
 * 置くため、bbox の幅・高さだけを前提に「原点から始まる」と決め打つ計算は、
 * このずれの分だけプレビューの下端が切れて見える。`computeArrangeResult` が返す
 * 品目の実座標から左上を測り、**プレビューを中心に収めるためだけ**に使う。
 *
 * ⚠️ **盤に置く位置（`VenueArrangePanel` の dx/dy・`VenueInspector` の「並べ直す」）
 * には使わない。** `frontClearanceMm`・`sideAisleMm` は §7「起点はエリアの正面から
 * 前の空きを取った中央」の通り、盤に置いたときの位置に効くのが仕様（Codexレビュー
 * 指摘・P1）——ここで補正すると2つの入力欄の値を変えても盤上の位置が変わらなくなる。
 * プレビューは壁の基準線を描かない単なる形の確認なので、そちらだけ中心に収めてよい
 */
export function boundsOfArrangeItems(items: VenueItem[]): { minX: number; minY: number } {
  let minX = Infinity;
  let minY = Infinity;
  for (const it of items) {
    const w = it.w ?? it.diameter ?? 0;
    const d = it.d ?? it.diameter ?? 0;
    minX = Math.min(minX, it.x - w / 2);
    minY = Math.min(minY, it.y - d / 2);
  }
  return { minX: Number.isFinite(minX) ? minX : 0, minY: Number.isFinite(minY) ? minY : 0 };
}

/** グループの外接寸法・脚数・保有数との差（`isOverStock`）をまとめて出す */
export function summarizeArrangeResult(result: VenueArrangeResult, catalogByKey: Map<string, VenueCatalogItem>) {
  const isOverStock = Object.entries(result.counts).some(([key, n]) => {
    const c = catalogByKey.get(key);
    return c?.qty != null && n > c.qty;
  });
  return { count: result.items.length, bbox: result.bbox, isOverStock };
}

export function groupOf(items: VenueItem[], groupId: string): VenueItem[] {
  return items.filter((it) => it.groupId === groupId);
}

/**
 * `VenueItem.arrange.params` は保存用に `Record<string, string|number|null>`
 * （`shared/src/venue/types.ts`）という広い型で持つ一方、入力欄が組み立てるのは
 * 名前付きの `VenueArrangeParams`（`shared/src/venue/arrange.ts`）。どちらも
 * 触らない前提のため、書くとき・読むときの変換をここに1つだけ置く。
 */
export function serializeArrangeParams(params: VenueArrangeParams): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v as string | number | null;
  }
  return out;
}

export function deserializeArrangeParams(params: Record<string, string | number | null> | undefined): VenueArrangeParams {
  return (params ?? {}) as unknown as VenueArrangeParams;
}
