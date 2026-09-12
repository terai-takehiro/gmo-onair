/**
 * 運営マニュアル 段C — 差し込みブロックの resolver: スケジュール表
 * （`schedule.day`＝当日の流れ／`schedule.loadInOut`＝搬入出）。
 * 設計: docs/design/v4/production-manual.md §4-3・§5-4。レジストリは
 * `shared/src/production/manualBlocks.ts`（`server/src/shared/production/manualBlocks.ts` は複製・変更しない）。
 *
 * ── 共通ポリシー（resolver 全員が守る決めごと。呼び出し元＝ `GET /techops/manuals/:id/resolve` 側の実装） ──
 * resolve はサーバーの実行権限で読む。呼び出しユーザーが `qsheet` モジュール権限を個別に
 * 持っているかはここでは再チェックせず、`canAccessSchedule` も呼ばない——**冊子自体が
 * `canAccessManual` を通っていること**だけをゲートにする（一度差し込んだ情報は、冊子を
 * 見られる人になら見える、という設計判断）。この resolver は `resolve` 経由専用で、
 * 単体で外部公開しない。
 *
 * ── どの `qsheet_schedules` 行を選ぶか（v1 の割り切り） ────────────────────────
 * 冊子は project_id/program_id は持つが「どの日のスケジュール表か」は持たない。
 * MCP の `get_day_schedule`（`production/schedule-read.service.ts`）は `date` 入力で
 * 曖昧さを解いているが、差し込みブロックには日付を選ぶ UI が無い
 * （`link-sources` は sheet.* の3種にしか候補を出さない＝§4-3 の設計どおり）。
 * そこで、同じ project/program に複数のスケジュール表があるときは
 *   ① 冊子自身の予定日（`ctx.manualServiceDate`）と `service_date` が一致する表を優先
 *   ② 一致が無ければ、いちばん日付が早い表（`service_date ASC`。無ければ作成が早い順）
 * を1つ選ぶ。**表そのものが1つも無ければ `{ data: null, updatedAt: null }`**（存在チェックは
 * `link-catalog` 側の役目でここではしない）。
 *
 * ── `schedule.loadInOut` の絞り込み（v1 の割り切り） ────────────────────────────
 * `ITEM_KINDS`（`shared/src/schedule/kinds.ts`）に「搬入」「搬出」の区分は無い
 * （近い setup/teardown は仕込み/撤収で意味が違う）。スキーマ変更をしない今回は
 * **タイトルの文字列一致**（「搬入」または「搬出」を含む）で拾う。
 *
 * ── data の形（client-linked-ui 担当向け） ─────────────────────────────────
 * `schedule.day` / `schedule.loadInOut` とも `ScheduleDayData | null`。列・時間帯の絞り込みは
 * せず生データをそのまま返す（`schedule.loadInOut` だけ `items` を搬入出に絞る）——
 * 出す列・時間帯の絞り込みは `link.options` の解釈としてクライアント側が行う。
 *   {
 *     scheduleId: string;
 *     title: string;
 *     serviceDate: string;         // YYYY-MM-DD
 *     locationName?: string;
 *     slotMin: number;
 *     viewStartMin: number;
 *     viewEndMin: number;
 *     columns: { id: string; group: string; label: string; roomName?: string }[];
 *     items: {
 *       id: string; columnId: string; title: string; kind: string;
 *       startMin: number; endMin: number; startText: string; endText: string;
 *       assignee?: string; note?: string;
 *     }[];
 *   }
 */
import { queryOne, type Row } from '../../../../shared/db/connection';
import { fmtHm } from '../../../../shared/schedule/time';
import { getScheduleWithMeta, getScheduleColumns, getScheduleItems } from '../schedule.service';
import type { ManualResolverCtx, ManualResolverResult } from './project.resolver';

export interface ScheduleDayColumn {
  id: string;
  group: string;
  label: string;
  roomName?: string;
}

export interface ScheduleDayItem {
  id: string;
  columnId: string;
  title: string;
  kind: string;
  startMin: number;
  endMin: number;
  startText: string;
  endText: string;
  assignee?: string;
  note?: string;
}

export interface ScheduleDayData {
  scheduleId: string;
  title: string;
  serviceDate: string;
  locationName?: string;
  slotMin: number;
  viewStartMin: number;
  viewEndMin: number;
  columns: ScheduleDayColumn[];
  items: ScheduleDayItem[];
}

/**
 * ctx の project/program に紐づく `qsheet_schedules` を1つ選ぶ（頭注「どの行を選ぶか」参照）。
 * 見つからなければ null。
 */
async function pickScheduleId(ctx: ManualResolverCtx): Promise<string | null> {
  const ownerId = ctx.projectId ?? ctx.programId;
  if (!ownerId) return null;

  const row = (await queryOne(
    `SELECT id FROM qsheet_schedules
      WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL
      ORDER BY
        (CASE WHEN $2::date IS NOT NULL AND service_date = $2::date THEN 0 ELSE 1 END) ASC,
        service_date ASC NULLS LAST,
        created_at ASC
      LIMIT 1`,
    [ownerId, ctx.manualServiceDate],
  )) as Row | undefined;
  return row ? (row.id as string) : null;
}

/** 選んだスケジュール表を `ScheduleDayData` の形に組み立てる（meta/columns/items は schedule.service.ts の組み合わせ。
 *  `get_day_schedule`（MCP）と同じ組み合わせだが、access チェックはしない——頭注の共通ポリシー参照） */
async function loadScheduleDay(scheduleId: string): Promise<{ data: ScheduleDayData; updatedAt: string | null } | null> {
  const meta = await getScheduleWithMeta(scheduleId);
  if (!meta) return null;
  const [columns, items] = await Promise.all([
    getScheduleColumns(scheduleId),
    getScheduleItems(scheduleId),
  ]);

  const data: ScheduleDayData = {
    scheduleId,
    title: meta.title as string,
    serviceDate: meta.service_date as string,
    slotMin: meta.slot_min as number,
    viewStartMin: meta.view_start_min as number,
    viewEndMin: meta.view_end_min as number,
    columns: columns.map((c) => {
      const col: ScheduleDayColumn = {
        id: c.id as string,
        group: c.col_group as string,
        label: c.label as string,
      };
      if (c.room_name) col.roomName = c.room_name as string;
      return col;
    }),
    items: items.map((i) => {
      const startMin = i.start_min as number;
      const endMin = i.end_min as number;
      const item: ScheduleDayItem = {
        id: i.id as string,
        columnId: i.column_id as string,
        title: i.title as string,
        kind: i.kind as string,
        startMin,
        endMin,
        startText: fmtHm(startMin),
        endText: fmtHm(endMin),
      };
      if (i.assignee) item.assignee = i.assignee as string;
      if (i.note) item.note = i.note as string;
      return item;
    }),
  };
  if (meta.location_name) data.locationName = meta.location_name as string;

  const updatedAt = meta.updated_at ? new Date(meta.updated_at as string).toISOString() : null;
  return { data, updatedAt };
}

/** `schedule.day`: 当日の流れ。列・時間帯は絞らず全部返す */
export async function resolveScheduleDay(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  const scheduleId = await pickScheduleId(ctx);
  if (!scheduleId) return { data: null, updatedAt: null };

  const loaded = await loadScheduleDay(scheduleId);
  if (!loaded) return { data: null, updatedAt: null };
  return loaded;
}

/** `schedule.loadInOut`: 搬入出だけに絞ったリスト（タイトルの文字列一致。頭注参照） */
export async function resolveScheduleLoadInOut(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  const scheduleId = await pickScheduleId(ctx);
  if (!scheduleId) return { data: null, updatedAt: null };

  const loaded = await loadScheduleDay(scheduleId);
  if (!loaded) return { data: null, updatedAt: null };

  const filtered: ScheduleDayData = {
    ...loaded.data,
    items: loaded.data.items.filter((i) => i.title.includes('搬入') || i.title.includes('搬出')),
  };
  return { data: filtered, updatedAt: loaded.updatedAt };
}
