// 会場図面 — 仕上がりの「出す前の検査」3つ（段D・docs/design/v4/venue-layout.md §6③・§12-3）。
// DOM を測らない純粋関数（`manualPreExportChecks.ts` と同じ考え方）。**件数を数えるだけ**
// ——0件でも「安全」とは書かない（呼び出し側の文言で担保する）。
import type { VenueArea, VenueCatalogItem, VenueFixture, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { isItemOverflowing, toTopLeftRect } from "@gmo-onair/shared/src/venue/geometry";

function rectOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** エリアが無い（階全体）ときは、固定物への重なりだけ見る（内法の外という概念が無いため） */
function isOverflowingOrColliding(item: VenueItem, area: VenueArea | null, fixtures: VenueFixture[]): boolean {
  if (area) return isItemOverflowing(item, { polygonMm: area.polygonMm, bboxMm: area.bboxMm }, fixtures);
  const rect = toTopLeftRect(item);
  return fixtures.some((f) => f.bboxMm && rectOverlap(rect, f.bboxMm));
}

export interface VenuePreflightIssue {
  itemId: string;
  label: string;
}

export interface VenueQtyIssue {
  key: string;
  label: string;
  placed: number;
  qty: number;
}

export interface VenuePreflightChecks {
  overflowing: VenuePreflightIssue[];
  overQty: VenueQtyIssue[];
  estimated: VenuePreflightIssue[];
}

function itemLabel(item: VenueItem, catalog: Record<string, VenueCatalogItem>): string {
  if (item.key && catalog[item.key]) return catalog[item.key].label;
  if (item.label) return item.label;
  return item.kind === "group" ? "グループ" : "品目";
}

export function runVenuePreflightChecks(
  items: VenueItem[],
  area: VenueArea | null,
  fixtures: VenueFixture[],
  catalog: Record<string, VenueCatalogItem>,
): VenuePreflightChecks {
  const overflowing: VenuePreflightIssue[] = [];
  const estimated: VenuePreflightIssue[] = [];
  const placedByKey = new Map<string, number>();

  for (const item of items) {
    if (item.kind === "group") continue; // グループの中身は個別品目として別途 items に含まれる想定
    if (isOverflowingOrColliding(item, area, fixtures)) {
      overflowing.push({ itemId: item.id, label: itemLabel(item, catalog) });
    }
    if (item.key) {
      const cat = catalog[item.key];
      if (cat?.estimated) estimated.push({ itemId: item.id, label: itemLabel(item, catalog) });
      if (cat?.qty != null) placedByKey.set(item.key, (placedByKey.get(item.key) ?? 0) + 1);
    }
  }

  const overQty: VenueQtyIssue[] = [];
  for (const [key, placed] of placedByKey) {
    const cat = catalog[key];
    if (cat?.qty != null && placed > cat.qty) {
      overQty.push({ key, label: cat.label, placed, qty: cat.qty });
    }
  }

  return { overflowing, overQty, estimated };
}
