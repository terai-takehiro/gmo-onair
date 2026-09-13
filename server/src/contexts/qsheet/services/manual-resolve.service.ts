/**
 * 運営マニュアル 段C — 差し込みブロックの resolver ディスパッチャ。
 * 設計: docs/design/v4/production-manual.md §4-3（カタログ）・§5-4（`resolve` API）。
 *
 * 4人が並行して作った8つの resolver ファイル（`./manual-resolvers/*.ts`）を、
 * レジストリのキー（`ManualLinkedBlockKey`。接頭辞 project./schedule./sheet./recording./
 * streaming./rental./equipment.）で振り分けるだけの薄い層。ルート（`manual-resolve.routes.ts`）
 * はここだけを呼び、個々の resolver ファイルを直接 import しない。
 *
 * ⚠️ ここでは権限の再チェックをしない（「共通ポリシー」節どおり、マニュアル自体が
 * `canAccessManual` を通っていることだけをゲートにする）。呼び出し元のルートが
 * 必ず先に `canAccessManual` を確認していることが前提。
 */
import { queryOne } from '../../../shared/db/connection';
import { EQUIPMENT_LENDING_STATUS } from '../../../shared/constants/statuses';
import type { ManualLinkedBlockKey } from '../../../shared/production/manualBlocks';
import type { AccessUser } from '../access';

import { resolveProjectHeading, resolveProjectTeam, type ManualResolverCtx } from './manual-resolvers/project.resolver';
import { resolveScheduleDay, resolveScheduleLoadInOut } from './manual-resolvers/schedule.resolver';
import {
  resolveSheetRundown,
  resolveSheetExcerpt,
  resolveSheetMicAssignment,
  listSheetSources,
  type ManualLinkResolveCtx,
} from './manual-resolvers/sheet.resolver';
import { resolveRecordingList } from './manual-resolvers/recording.resolver';
import { resolveStreamingList, resolveStreamingWebMeeting } from './manual-resolvers/streaming.resolver';
import { resolveRentalList } from './manual-resolvers/rental.resolver';
import { resolveEquipmentLending } from './manual-resolvers/equipment.resolver';
import {
  resolveVenueLayout,
  resolveVenueItems,
  listVenueSources,
  type ManualVenueResolveCtx,
} from './manual-resolvers/venue.resolver';

/** ディスパッチャが受け取る文脈。個々の resolver が要る分だけをそれぞれの ctx へ詰め替える */
export interface ResolveCtx {
  projectId: string | null;
  programId: string | null;
  /** sheet.* の3種だけ必須。他の種別では無視される */
  sourceId: string | null;
  /** `link.reveal?.fields`。streaming.* の2種だけ見る */
  revealFields: string[];
  /** マニュアル自身の `service_date`（YYYY-MM-DD） */
  manualServiceDate: string | null;
  /** 呼び出し本人。sheet.* の3種だけが使う（`canAccessDoc` の判定・レビュー指摘 P1） */
  user: AccessUser;
}

/** resolve の1ブロックぶんの結果（統一シグネチャ。§5-4「共通ポリシー3」） */
export interface ResolveResult {
  data: unknown;
  updatedAt: string | null;
  error?: string;
}

/**
 * key の接頭辞で対応する resolver へ振り分ける。存在しない/対応していない key は
 * `error: 'unknown_block'` を返す（例外は投げない——呼び出し元が blockId ごとにまとめて返す形）。
 */
export async function resolveLinkedBlock(key: string, ctx: ResolveCtx): Promise<ResolveResult> {
  // project.* / schedule.* / recording.* / streaming.* / rental.* / equipment.* は
  // 全員同じ ManualResolverCtx（project.resolver.ts が定義する形）をそのまま使う
  const rctx: ManualResolverCtx = ctx;
  // sheet.* の3種だけ sourceId 必須の別 ctx（ManualLinkResolveCtx）を使う
  const sheetCtx: ManualLinkResolveCtx = {
    projectId: ctx.projectId,
    programId: ctx.programId,
    sourceId: ctx.sourceId,
    user: ctx.user,
  };
  // venue.* の2種も sourceId 必須（venue-layout.md §9-1）。sheet.* と同じ理由で別 ctx を使う
  const venueCtx: ManualVenueResolveCtx = {
    projectId: ctx.projectId,
    programId: ctx.programId,
    sourceId: ctx.sourceId,
    user: ctx.user,
  };

  switch (key as ManualLinkedBlockKey) {
    case 'project.heading':
      return resolveProjectHeading(rctx);
    case 'project.team':
      return resolveProjectTeam(rctx);
    case 'schedule.day':
      return resolveScheduleDay(rctx);
    case 'schedule.loadInOut':
      return resolveScheduleLoadInOut(rctx);
    case 'sheet.rundown':
      return resolveSheetRundown(sheetCtx);
    case 'sheet.excerpt':
      return resolveSheetExcerpt(sheetCtx);
    case 'sheet.micAssignment':
      return resolveSheetMicAssignment(sheetCtx);
    case 'recording.list':
      return resolveRecordingList(rctx);
    case 'streaming.list':
      return resolveStreamingList(rctx);
    case 'streaming.webMeeting':
      return resolveStreamingWebMeeting(rctx);
    case 'rental.list':
      return resolveRentalList(rctx);
    case 'equipment.lending':
      return resolveEquipmentLending(rctx);
    case 'venue.layout':
      return resolveVenueLayout(venueCtx);
    case 'venue.items':
      return resolveVenueItems(venueCtx);
    default:
      return { data: null, updatedAt: null, error: 'unknown_block' };
  }
}

export interface AvailabilityCtx {
  projectId: string | null;
  programId: string | null;
}

/**
 * このマニュアルの project_id/program_id に対して「実在する」差し込みブロック種別だけを返す
 * （§4-3「押すと空になる項目を作らない」）。SHARED_CONTEXT「共通ポリシー」節の
 * 実在チェック SQL を12種ぶん実行する。
 */
export async function listAvailableLinkedBlocks(ctx: AvailabilityCtx): Promise<ManualLinkedBlockKey[]> {
  const ownerId = ctx.projectId ?? ctx.programId;
  const available: ManualLinkedBlockKey[] = [];
  if (!ownerId) return available; // project/program どちらも無いマニュアルは差し込み元を持たない

  const checks: { key: ManualLinkedBlockKey | ManualLinkedBlockKey[]; sql: string; params: unknown[] }[] = [
    // project.heading: プロジェクト専用（program 紐づけのマニュアルには対応する project が無い）
    ...(ctx.projectId
      ? [{ key: 'project.heading' as ManualLinkedBlockKey, sql: 'SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL', params: [ctx.projectId] }]
      : []),
    // project.team: プロジェクト専用・メンバーが1人以上いること
    ...(ctx.projectId
      ? [{ key: 'project.team' as ManualLinkedBlockKey, sql: 'SELECT 1 FROM project_members WHERE project_id = $1 AND deleted_at IS NULL LIMIT 1', params: [ctx.projectId] }]
      : []),
    // schedule.day / schedule.loadInOut: 表が1つでもあれば両方 available（頭注のとおり厳密な0件判定はしない）
    {
      key: ['schedule.day', 'schedule.loadInOut'],
      sql: 'SELECT 1 FROM qsheet_schedules WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL LIMIT 1',
      params: [ownerId],
    },
    // sheet.rundown / sheet.excerpt / sheet.micAssignment: 進行台本が1件でもあれば3種とも available
    {
      key: ['sheet.rundown', 'sheet.excerpt', 'sheet.micAssignment'],
      sql: 'SELECT 1 FROM qsheet_documents WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL LIMIT 1',
      params: [ownerId],
    },
    {
      key: 'recording.list',
      sql: 'SELECT 1 FROM qsheet_recording_settings WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL LIMIT 1',
      params: [ownerId],
    },
    {
      key: 'streaming.list',
      sql: 'SELECT 1 FROM qsheet_streaming_settings WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL AND jsonb_array_length(destinations) > 0 LIMIT 1',
      params: [ownerId],
    },
    {
      key: 'streaming.webMeeting',
      sql: 'SELECT 1 FROM qsheet_streaming_settings WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL AND jsonb_array_length(meetings) > 0 LIMIT 1',
      params: [ownerId],
    },
    {
      key: 'rental.list',
      sql: 'SELECT 1 FROM qsheet_rental_reservations WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL LIMIT 1',
      params: [ownerId],
    },
    // equipment.lending: project_id しか持たないため、programId 由来のマニュアルでは常に不在
    ...(ctx.projectId
      ? [{
          key: 'equipment.lending' as ManualLinkedBlockKey,
          sql: 'SELECT 1 FROM equipment_lendings WHERE project_id = $1 AND status = $2 LIMIT 1',
          params: [ctx.projectId, EQUIPMENT_LENDING_STATUS.LENT],
        }]
      : []),
    // venue.layout / venue.items: 会場図面が1件でもあれば両方 available（venue-layout.md §9-2 #7）
    {
      key: ['venue.layout', 'venue.items'],
      sql: 'SELECT 1 FROM qsheet_venue_layouts WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL LIMIT 1',
      params: [ownerId],
    },
  ];

  const results = await Promise.all(checks.map((c) => queryOne(c.sql, c.params)));
  results.forEach((row, i) => {
    if (!row) return;
    const k = checks[i].key;
    if (Array.isArray(k)) available.push(...k);
    else available.push(k);
  });
  return available;
}

/**
 * `sourceId` が要るブロック種別（sheet.rundown/sheet.excerpt/sheet.micAssignment）だけ
 * 複数件を返す。他の種別は空配列（§5-4「resolve API の形」）。
 */
export async function listLinkSourcesFor(
  key: string,
  ctx: { projectId: string | null; programId: string | null },
  user: AccessUser,
): Promise<{ id: string; label: string }[]> {
  if (key === 'sheet.rundown' || key === 'sheet.excerpt' || key === 'sheet.micAssignment') {
    return listSheetSources({ projectId: ctx.projectId, programId: ctx.programId }, user);
  }
  if (key === 'venue.layout' || key === 'venue.items') {
    return listVenueSources({ projectId: ctx.projectId, programId: ctx.programId }, user);
  }
  return [];
}
