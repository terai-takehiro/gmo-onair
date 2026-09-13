/**
 * 会場図面 — 会場・階・エリア・備品カタログ（`qsheet_venue_floors` / `qsheet_venue_areas` /
 * `qsheet_venue_catalog_items`）。設計: docs/design/v4/venue-layout.md §5-1・§10・§11。
 *
 * **読み取り専用**（段A・段Bのスコープ）。用賀のマスタは migration 299 で入れてあり、
 * 書き込み（④会場と階・⑤備品カタログの編集）は段F——今回は実装しない
 * （venue-layout.md §13「作る順」）。
 */
import { queryAll, type Row } from '../../../shared/db/connection';
import type { VenueArea, VenueCatalogItem, VenueFixture, VenueFloor, VenueFloorWithAreas, VenueUnderlay } from '../types/venue';

/** `underlay` 列は無い階でも `'{}'::jsonb`（空オブジェクト）で入っている（migration 298 の DEFAULT）。
 *  型どおり `null` に正規化する。 */
function normalizeUnderlay(value: unknown): VenueUnderlay | null {
  if (!value || typeof value !== 'object') return null;
  if (Object.keys(value as Record<string, unknown>).length === 0) return null;
  return value as VenueUnderlay;
}

function mapFloorRow(row: Row): VenueFloor {
  return {
    id: row.id as string,
    venueName: row.venue_name as string,
    locationId: (row.location_id as string | null) ?? null,
    floorLabel: row.floor_label as string,
    sortOrder: (row.sort_order as number) ?? 0,
    calibration: (row.calibration as VenueFloor['calibration']) ?? {},
    grid: (row.grid as VenueFloor['grid']) ?? {},
    underlay: normalizeUnderlay(row.underlay),
    fixtures: Array.isArray(row.fixtures) ? (row.fixtures as VenueFixture[]) : [],
    verification: Array.isArray(row.verification) ? (row.verification as VenueFloor['verification']) : [],
    verifiedAt: row.verified_at ? new Date(row.verified_at as string).toISOString() : null,
    verifiedByName: (row.verified_by_name as string | null) ?? null,
  };
}

function mapAreaRow(row: Row): VenueArea {
  return {
    id: row.id as string,
    floorId: row.floor_id as string,
    key: row.key as string,
    label: row.label as string,
    polygonMm: Array.isArray(row.polygon_mm) ? (row.polygon_mm as [number, number][]) : [],
    bboxMm: (row.bbox_mm as VenueArea['bboxMm']) ?? { x: 0, y: 0, w: 0, h: 0 },
    drawnAreaM2: row.drawn_area_m2 == null ? null : Number(row.drawn_area_m2),
    shownAreaM2: row.shown_area_m2 == null ? null : Number(row.shown_area_m2),
    roomId: (row.room_id as string | null) ?? null,
    underlay: normalizeUnderlay(row.underlay),
    estimated: !!row.estimated,
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

/**
 * ④「会場と階」・②編集画面の下敷き読み込みが使う一覧（§5-4）。階ごとにエリアを畳み込む。
 * 会場は用賀の1件しか無い v1 でも、段Fで会場が増えたときにそのまま使える形にしておく。
 */
export async function listVenueFloors(): Promise<VenueFloorWithAreas[]> {
  const floorRows = await queryAll(
    `SELECT f.*, u.name AS verified_by_name
     FROM qsheet_venue_floors f
     LEFT JOIN users u ON f.verified_by = u.id
     WHERE f.deleted_at IS NULL
     ORDER BY f.sort_order, f.floor_label`,
  );
  const areaRows = await queryAll('SELECT * FROM qsheet_venue_areas ORDER BY sort_order, label');

  const areasByFloor = new Map<string, VenueArea[]>();
  for (const row of areaRows) {
    const area = mapAreaRow(row);
    const list = areasByFloor.get(area.floorId) ?? [];
    list.push(area);
    areasByFloor.set(area.floorId, list);
  }

  return floorRows.map((row) => {
    const floor = mapFloorRow(row);
    return { ...floor, areas: areasByFloor.get(floor.id) ?? [] };
  });
}

function mapCatalogRow(row: Row): VenueCatalogItem {
  return {
    key: row.key as string,
    category: row.category as VenueCatalogItem['category'],
    listNo: (row.list_no as string | null) ?? null,
    label: row.label as string,
    sizeMm: (row.size_mm as Record<string, unknown>) ?? {},
    footprint: (row.footprint as VenueCatalogItem['footprint']) ?? { shape: 'none' },
    qty: row.qty == null ? null : Number(row.qty),
    unit: (row.unit as string | null) ?? null,
    storage: (row.storage as string | null) ?? null,
    symbol: row.symbol as string,
    front: !!row.front,
    estimated: !!row.estimated,
    toConfirm: (row.to_confirm as string | null) ?? null,
    fixed: !!row.fixed,
    confirmed: (row.confirmed as Record<string, unknown>) ?? {},
    extra: (row.extra as Record<string, unknown>) ?? {},
    equipmentItemId: (row.equipment_item_id as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

/** ⑤備品カタログ・②「置く」タブが使う一覧（§5-4・§11。36件＝備品24＋カメラ4＋人3＋図形5） */
export async function listVenueCatalog(): Promise<VenueCatalogItem[]> {
  const rows = await queryAll('SELECT * FROM qsheet_venue_catalog_items ORDER BY sort_order, key');
  return rows.map(mapCatalogRow);
}
