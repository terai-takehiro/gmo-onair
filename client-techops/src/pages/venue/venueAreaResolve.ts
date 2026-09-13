// 会場図面 — 図面が指すエリアを解決する。`area_id` が無い図面は「階全体」
// （設計: docs/design/v4/venue-layout.md §5-1「area_id … null = 階全体」）。
import type { VenueArea, VenueFloor, VenueLayoutSummary } from "@gmo-onair/shared/src/venue/types";

/** 階全体を1つの疑似エリアとして返す（`polygonMm` は空＝呼び出し側は `bboxMm` で代用する） */
export function wholeFloorArea(floor: VenueFloor): VenueArea {
  const total = floor.grid?.totalMm || 44800;
  return {
    id: `${floor.id}__whole`,
    floorId: floor.id,
    key: "__whole__",
    label: "階全体",
    polygonMm: [],
    bboxMm: { x: 0, y: 0, w: total, h: total },
    drawnAreaM2: null,
    shownAreaM2: null,
    roomId: null,
    underlay: floor.underlay,
    estimated: false,
    sortOrder: -1,
  };
}

export function resolveArea(floor: VenueFloor & { areas: VenueArea[] }, layout: Pick<VenueLayoutSummary, "areaId">): VenueArea {
  const found = layout.areaId ? floor.areas.find((a) => a.id === layout.areaId) : undefined;
  return found ?? wholeFloorArea(floor);
}
