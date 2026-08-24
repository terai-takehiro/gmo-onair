/**
 * `create_schedule_item` / `update_schedule_item` / `delete_schedule_item`（MCP・機材管理MCP新設と
 * 同時に、techops スケジュール表への書き込みも対応した）。
 *
 * 既存の `schedule-item.service.ts`（04-schedule-impl.md §4-1）をそのまま呼ぶ。MCP のために
 * 別のクエリは作らない — `get_day_schedule`（`schedule-read.service.ts`）と同じ方針。
 *
 * アクセス判定（作成者／共有先／`system_admin`）は `get_day_schedule` と同じ `canAccessSchedule`。
 * HTTP 側の `schedule-items.routes.ts` は `requireAccessible()` で毎回スケジュール表単位のアクセスを
 * 確認してから呼んでおり、ここも同じ順序（アクセス確認 → 書き込み）にする。
 */
import { AppError } from '../../../../shared/middleware/errorHandler';
import { canAccessSchedule, type AccessUser } from '../../access';
import {
  getScheduleRaw,
  createSchedule,
  updateSchedule,
  type CreateScheduleInput,
  type UpdateScheduleInput,
} from '../../services/schedule.service';
import {
  createItem,
  updateItem,
  deleteItem,
  type CreateItemInput,
  type UpdateItemInput,
} from '../../services/schedule-item.service';
import {
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  type CreateColumnInput,
  type UpdateColumnInput,
} from '../../services/schedule-column.service';
import { HttpError } from '../../services/httpErrors';

/**
 * `schedule-item.service.ts` は route 層向けの `HttpError`（qsheet ローカル）を投げる。
 * MCP 共通の `runTool`（helpers.ts）は `AppError`（shared）だけを code 付きで isError にするため、
 * そのままだと 404/400/409 が全部 INTERNAL_ERROR に落ちる。read 側（`schedule-read.service.ts`）は
 * もともと `AppError` を使っているので、ここで揃える。
 */
function toAppError(err: unknown): never {
  if (err instanceof HttpError) {
    throw new AppError(err.status, err.code, err.message, err.extra);
  }
  throw err;
}

async function requireAccessibleSchedule(actor: AccessUser, scheduleId: string): Promise<void> {
  const raw = await getScheduleRaw(scheduleId);
  if (!raw || !(await canAccessSchedule(actor, scheduleId, (raw.created_by as string) ?? null))) {
    throw new AppError(404, 'NOT_FOUND', 'スケジュール表が見つかりません');
  }
}

export async function createScheduleItem(actor: AccessUser, scheduleId: string, input: CreateItemInput) {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    return await createItem(scheduleId, input);
  } catch (err) {
    toAppError(err);
  }
}

export async function updateScheduleItem(
  actor: AccessUser,
  scheduleId: string,
  itemId: string,
  input: UpdateItemInput,
) {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    return await updateItem(scheduleId, itemId, actor.id, input);
  } catch (err) {
    toAppError(err);
  }
}

export async function deleteScheduleItem(actor: AccessUser, scheduleId: string, itemId: string): Promise<void> {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    await deleteItem(scheduleId, itemId);
  } catch (err) {
    toAppError(err);
  }
}

// ── スケジュール表そのもの（`qsheet_schedules`） ──────────────
// 既存の枠 (items) と違い「新規に作る」操作なのでアクセス確認は不要
// (HTTP 側 `schedules.routes.ts` の POST /schedules も同様に無条件で作成する)。

export async function createScheduleTable(actor: AccessUser, input: Omit<CreateScheduleInput, 'createdBy'>) {
  try {
    return await createSchedule({ ...input, createdBy: actor.id });
  } catch (err) {
    toAppError(err);
  }
}

export async function updateScheduleTable(actor: AccessUser, scheduleId: string, input: UpdateScheduleInput) {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    return await updateSchedule(scheduleId, actor.id, input);
  } catch (err) {
    toAppError(err);
  }
}

// ── スケジュール表の列（`qsheet_schedule_columns`） ───────────
// HTTP 側 (`schedule-columns.routes.ts`) と同じくスケジュール表単位のアクセス確認 → 書き込みの順。

export async function createScheduleColumn(actor: AccessUser, scheduleId: string, input: CreateColumnInput) {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    return await createColumn(scheduleId, input);
  } catch (err) {
    toAppError(err);
  }
}

export async function updateScheduleColumn(
  actor: AccessUser,
  scheduleId: string,
  columnId: string,
  input: UpdateColumnInput,
) {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    return await updateColumn(scheduleId, columnId, actor.id, input);
  } catch (err) {
    toAppError(err);
  }
}

export async function deleteScheduleColumn(actor: AccessUser, scheduleId: string, columnId: string): Promise<number> {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    return await deleteColumn(scheduleId, columnId);
  } catch (err) {
    toAppError(err);
  }
}

interface ReorderColumnEntry { id: string; col_group: string; sort_order: number }

export async function reorderScheduleColumns(actor: AccessUser, scheduleId: string, order: ReorderColumnEntry[]) {
  await requireAccessibleSchedule(actor, scheduleId);
  try {
    return await reorderColumns(scheduleId, order);
  } catch (err) {
    toAppError(err);
  }
}
