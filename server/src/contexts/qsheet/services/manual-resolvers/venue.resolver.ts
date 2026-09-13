/**
 * 運営マニュアル — 差し込みブロックの resolver: 会場図面（`venue.layout`・`venue.items`）。
 * 設計: docs/design/v4/venue-layout.md §9-2（触る11か所）・§9-3（resolver の data は
 * 自己完結の線画データ）。
 *
 * ── 共通ポリシー（他の resolver と同じ・冒頭のコメントは schedule.resolver.ts を参照） ──
 * resolve はマニュアル自身の `canAccessManual` が通っていることをゲートにする。ただし
 * `sheet.resolver.ts`／`schedule.resolver.ts` と同じ理由で、この resolver だけは
 * 追加の検査を2つ行う:
 *   ① `sourceId` の図面がマニュアルと**同じ案件/番組**か（`ownerMatchesCtx`）
 *   ② その図面自体に呼び出し本人が `canAccessVenueLayout` を通るか
 * ①だけでは足りない理由: `qsheet_programs` は行単位の権限を持たない
 * （`programs.routes.ts` 冒頭のコメント）ため、`program_id` は誰でも詐称できる
 * 「弱い」識別子——攻撃者が自分の manual を同じ `program_id` で作れば、①だけのゲートは
 * 突破できてしまう。②を必ず通すことで、他人の（作成者/案件メンバー/admin 以外が
 * 見えない）番組図面を、program_id を合わせただけのマニュアル経由で覗く経路を閉じる
 * （`canAccessVenueLayout` は `access.ts` 参照——project 紐づけは案件メンバー全員に
 * 自動で見えるため実害は無いが、program 紐づけは作成者/admin 限定であり、ここが
 * その境界そのもの）。
 *
 * ── data の形（§9-3。下敷き画像・外部URLは含めない＝線画データだけ） ──────────────
 * `venue.layout`:
 *   { layoutId, docNo, rev, title, planLabel, floor, area, boundsMm, polygonMm,
 *     fixtures, items, scale, updatedAt }
 * `venue.items`（数量表）:
 *   { layoutId, docNo, rev, title, planLabel, rows: [{ key, label, placed, qty, unit, storage }], updatedAt }
 */
import { queryAll, queryOne } from '../../../../shared/db/connection';
import { canAccessVenueLayout, type AccessUser } from '../../access';
import { getVenueLayoutDetail } from '../venue-layout.service';

/** resolver へ渡す文脈。マニュアル（`qsheet_manuals`）の project_id/program_id をそのまま渡す */
export interface ManualVenueResolveScope {
  projectId: string | null;
  programId: string | null;
}

/** venue.* の2種は `sourceId`（`qsheet_venue_layouts.id`）が必須（§9-1「sourceId 必須」） */
export interface ManualVenueResolveCtx extends ManualVenueResolveScope {
  sourceId: string | null;
  /** 呼び出し本人。`canAccessVenueLayout` の判定に使う */
  user: AccessUser;
}

/** resolver 全員の統一シグネチャ（`manual-resolve.service.ts` の `ResolveResult` と同じ形） */
export interface ManualVenueResolveResult {
  data: unknown;
  updatedAt: string | null;
  error?: string;
}

interface VenueLayoutOwner {
  projectId: string | null;
  programId: string | null;
  createdBy: string | null;
}

async function fetchVenueLayoutOwner(sourceId: string): Promise<VenueLayoutOwner | null> {
  const row = await queryOne(
    'SELECT project_id, program_id, created_by FROM qsheet_venue_layouts WHERE id = $1 AND deleted_at IS NULL',
    [sourceId],
  );
  if (!row) return null;
  return {
    projectId: (row.project_id as string) ?? null,
    programId: (row.program_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
  };
}

/** マニュアルと同じ project_id、または同じ program_id を持つ図面だけを true にする（null 同士は一致させない） */
function ownerMatchesCtx(ctx: ManualVenueResolveScope, owner: VenueLayoutOwner): boolean {
  if (ctx.projectId && owner.projectId === ctx.projectId) return true;
  if (ctx.programId && owner.programId === ctx.programId) return true;
  return false;
}

type AccessibleVenueLayout =
  | { ok: true; layoutId: string }
  | { ok: false; result: ManualVenueResolveResult };

/**
 * sourceId を検査してから中身を読む共通の入口（`sheet.resolver.ts` の `resolveAccessibleDoc`
 * と同じ形）。ここで弾かれた場合は絶対に図面の中身を読まない。
 */
async function resolveAccessibleVenueLayout(ctx: ManualVenueResolveCtx): Promise<AccessibleVenueLayout> {
  if (!ctx.sourceId) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'source_id_required' } };
  }
  const owner = await fetchVenueLayoutOwner(ctx.sourceId);
  if (!owner) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'source_missing' } };
  }
  if (!ownerMatchesCtx(ctx, owner)) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'access_denied' } };
  }
  if (!(await canAccessVenueLayout(ctx.user, ctx.sourceId, owner.createdBy))) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'access_denied' } };
  }
  return { ok: true, layoutId: ctx.sourceId };
}

const SCALE_STEPS = [50, 75, 100, 150, 200, 250, 300, 400] as const;
/** venue.layout の既定サイズ（`manualBlocks.ts` の `defaultSize` = 180×120mm）に収まる自動縮尺。
 *  実際に置いたブロックの大きさ・options の指定はここでは分からない（差し込み時に決まる）ため、
 *  あくまで参考値——クライアントは `boundsMm`（自己完結の実寸データ）から options の縮尺で
 *  描き直せる（§9-1・§9-3）。`shared/src/venue/geometry.ts` の `computeAutoScale` と同じ考え方
 *  だが、server は shared/ を import できないためここに小さく複製する。 */
function computeDefaultScale(boundsMm: { w: number; h: number }): number {
  const paperWidthMm = 180;
  const paperHeightMm = 120;
  for (const scale of SCALE_STEPS) {
    if (boundsMm.w / scale <= paperWidthMm && boundsMm.h / scale <= paperHeightMm) return scale;
  }
  return SCALE_STEPS[SCALE_STEPS.length - 1];
}

async function fetchFloorFixtures(floorId: string): Promise<unknown[]> {
  const row = await queryOne('SELECT fixtures FROM qsheet_venue_floors WHERE id = $1 AND deleted_at IS NULL', [floorId]);
  return Array.isArray(row?.fixtures) ? (row!.fixtures as unknown[]) : [];
}

interface AreaGeometry {
  polygonMm: [number, number][];
  bboxMm: { x: number; y: number; w: number; h: number };
}

async function fetchAreaGeometry(areaId: string): Promise<AreaGeometry | null> {
  const row = await queryOne('SELECT polygon_mm, bbox_mm FROM qsheet_venue_areas WHERE id = $1', [areaId]);
  if (!row) return null;
  return {
    polygonMm: Array.isArray(row.polygon_mm) ? (row.polygon_mm as [number, number][]) : [],
    bboxMm: (row.bbox_mm as AreaGeometry['bboxMm']) ?? { x: 0, y: 0, w: 0, h: 0 },
  };
}

/** area_id が null（階全体を選んだ図面）のときの範囲。v1 は階の通り芯グリッド（総幅×総幅の
 *  正方形）で近似する——建物の正確な外形ポリゴンは v1 のデータに無い（venue-layout.md §10-2
 *  はエリアの内法だけを実測しており、階の外形そのものは持たない）。差し込みは「線画で
 *  だいたいの位置関係が分かればよい」用途で、階全体を選ぶ運用も少ないと想定し、v1 の
 *  割り切りとして許容する。 */
async function fetchFloorBoundsFallback(floorId: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const row = await queryOne('SELECT grid FROM qsheet_venue_floors WHERE id = $1', [floorId]);
  const grid = (row?.grid as { totalMm?: number }) ?? {};
  const total = typeof grid.totalMm === 'number' && grid.totalMm > 0 ? grid.totalMm : 44800;
  return { x: 0, y: 0, w: total, h: total };
}

// ============================================================
// venue.layout（エリアの内法・固定物・品目の線画。§9-1）
// ============================================================
export async function resolveVenueLayout(ctx: ManualVenueResolveCtx): Promise<ManualVenueResolveResult> {
  const resolved = await resolveAccessibleVenueLayout(ctx);
  if (!resolved.ok) return resolved.result;

  const layout = await getVenueLayoutDetail(resolved.layoutId);
  if (!layout) return { data: null, updatedAt: null, error: 'source_missing' };

  const floorId = layout.floor_id as string;
  const areaId = (layout.area_id as string | null) ?? null;
  const fixtures = await fetchFloorFixtures(floorId);

  let boundsMm: { x: number; y: number; w: number; h: number };
  let polygonMm: [number, number][];
  if (areaId) {
    const area = await fetchAreaGeometry(areaId);
    boundsMm = area?.bboxMm ?? { x: 0, y: 0, w: 0, h: 0 };
    polygonMm = area?.polygonMm ?? [];
  } else {
    boundsMm = await fetchFloorBoundsFallback(floorId);
    polygonMm = [
      [boundsMm.x, boundsMm.y],
      [boundsMm.x + boundsMm.w, boundsMm.y],
      [boundsMm.x + boundsMm.w, boundsMm.y + boundsMm.h],
      [boundsMm.x, boundsMm.y + boundsMm.h],
    ];
  }

  const updatedAt = new Date(layout.updated_at as string).toISOString();
  return {
    data: {
      layoutId: layout.id,
      docNo: (layout.doc_no as string | null) ?? null,
      rev: (layout.rev as number) ?? 0,
      title: (layout.title as string) ?? '',
      planLabel: (layout.plan_label as string | null) ?? null,
      floor: (layout.floor_label as string | null) ?? '',
      area: (layout.area_label as string | null) ?? null,
      boundsMm,
      polygonMm,
      fixtures,
      items: Array.isArray(layout.items) ? layout.items : [],
      scale: computeDefaultScale(boundsMm),
      updatedAt,
    },
    updatedAt,
  };
}

// ============================================================
// venue.items（数量表: 品目・数・保有数・保管場所。§9-1）
// ============================================================
interface VenueItemLike { key?: unknown }

export async function resolveVenueItems(ctx: ManualVenueResolveCtx): Promise<ManualVenueResolveResult> {
  const resolved = await resolveAccessibleVenueLayout(ctx);
  if (!resolved.ok) return resolved.result;

  const layout = await getVenueLayoutDetail(resolved.layoutId);
  if (!layout) return { data: null, updatedAt: null, error: 'source_missing' };

  const items = Array.isArray(layout.items) ? (layout.items as VenueItemLike[]) : [];
  const countByKey = new Map<string, number>();
  for (const item of items) {
    if (typeof item.key !== 'string' || !item.key) continue;
    countByKey.set(item.key, (countByKey.get(item.key) ?? 0) + 1);
  }
  const keys = [...countByKey.keys()].sort();
  const catalogRows = keys.length
    ? await queryAll('SELECT key, label, qty, unit, storage FROM qsheet_venue_catalog_items WHERE key = ANY($1::text[])', [keys])
    : [];
  const catalogByKey = new Map(catalogRows.map((r) => [r.key as string, r]));

  const rows = keys.map((key) => {
    const c = catalogByKey.get(key);
    return {
      key,
      label: (c?.label as string) ?? key,
      placed: countByKey.get(key) ?? 0,
      qty: c?.qty == null ? null : Number(c.qty),
      unit: (c?.unit as string | null) ?? null,
      storage: (c?.storage as string | null) ?? null,
    };
  });

  const updatedAt = new Date(layout.updated_at as string).toISOString();
  return {
    data: {
      layoutId: layout.id,
      docNo: (layout.doc_no as string | null) ?? null,
      rev: (layout.rev as number) ?? 0,
      title: (layout.title as string) ?? '',
      planLabel: (layout.plan_label as string | null) ?? null,
      rows,
      updatedAt,
    },
    updatedAt,
  };
}

// ============================================================
// link-sources エンドポイント用: この project/program に属する図面の一覧
// ============================================================
export interface VenueSourceOption {
  id: string;
  label: string;
}

/**
 * `sheet.resolver.ts` の `listSheetSources` と同じ形——一覧に出す時点で `canAccessVenueLayout`
 * を通し、本人が読めない図面（他人の非公開の番組図面など）をタイトルごと隠す
 * （resolve 本体は `access_denied` で弾いても、候補一覧に出ること自体が存在の手掛かりになるため）。
 */
export async function listVenueSources(scope: ManualVenueResolveScope, user: AccessUser): Promise<VenueSourceOption[]> {
  let sql = 'SELECT id, title, doc_no, plan_label, status, created_by FROM qsheet_venue_layouts WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (scope.projectId) {
    sql += ' AND project_id = ?';
    params.push(scope.projectId);
  } else if (scope.programId) {
    sql += ' AND program_id = ?';
    params.push(scope.programId);
  } else {
    return [];
  }
  sql += ' ORDER BY updated_at DESC LIMIT 200';

  const rows = await queryAll(sql, params);
  const STATUS_LABEL: Record<string, string> = { draft: '下書き', fixed: '確定', archived: '過去の版' };
  const options: VenueSourceOption[] = [];
  for (const r of rows) {
    if (!(await canAccessVenueLayout(user, r.id as string, (r.created_by as string) ?? null))) continue;
    const parts = [(r.doc_no as string) || '', (r.title as string) || '（無題）'];
    if (r.plan_label) parts.push(r.plan_label as string);
    const status = typeof r.status === 'string' ? STATUS_LABEL[r.status] : undefined;
    if (status) parts.push(`（${status}）`);
    options.push({ id: r.id as string, label: parts.filter(Boolean).join(' ') });
  }
  return options;
}
