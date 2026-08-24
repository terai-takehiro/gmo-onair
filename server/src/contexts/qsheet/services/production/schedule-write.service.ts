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
import { getScheduleRaw } from '../../services/schedule.service';
import {
  createItem,
  updateItem,
  deleteItem,
  type CreateItemInput,
  type UpdateItemInput,
} from '../../services/schedule-item.service';
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
