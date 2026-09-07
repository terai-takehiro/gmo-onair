/**
 * 定例報告パック — ONAiR に無い数字の手入力（`keep_report_inputs`・migration 291）
 *
 * 内覧会の満足度（Kairos3 のアンケート）・参加者・Web KPI・注記など、会議日 × key で1行。
 * 値は JSON（`inview_satisfaction` なら `{ score: 3.9 }`）。**パックを組むとき読む**
 * （`keep-pack.service.ts`）ので、凍結より前に入れておけば凍結した版にも入る。
 *
 * パックの組み立て（`keep-pack.service.ts`）と保存（`keep-pack-store.service.ts`）の両方が
 * 読むため、どちらにも置かず小さく分けてある（循環 import を作らない）。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { KEEP_INPUT_KEYS, type KeepInput, type KeepInputKey } from './keep-pack.types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertMeetingDate(value: unknown, label = 'meeting_date'): string {
  const s = String(value ?? '');
  if (!DATE_RE.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} は YYYY-MM-DD 形式で指定してください`);
  }
  return s;
}

export function isKeepInputKey(value: unknown): value is KeepInputKey {
  return typeof value === 'string' && (KEEP_INPUT_KEYS as readonly string[]).includes(value);
}

function toInput(r: Record<string, unknown>): KeepInput {
  const value = r.value && typeof r.value === 'object' && !Array.isArray(r.value)
    ? r.value as Record<string, unknown>
    : {};
  return {
    meeting_date: String(r.meeting_date),
    key: r.key as KeepInputKey,
    value,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : (r.updated_at as string | null) ?? null,
    updated_by: (r.updated_by as string | null) ?? null,
  };
}

/** その会議日の手入力（key 順） */
export async function getInputs(meetingDate: string): Promise<KeepInput[]> {
  const rows = await queryAll(
    'SELECT meeting_date, key, value, updated_at, updated_by FROM keep_report_inputs WHERE meeting_date = ? ORDER BY key',
    [meetingDate],
  );
  return rows.map(toInput);
}

/** 満足度は Kairos3 のアンケートの 4.0 満点。資料・Slack・画面はすべて「／4.0」で出すので 4 を超える値は受けない */
export const SATISFACTION_MAX = 4;

/** key ごとの値の検査（画面の入力欄と同じ上限。API から直接入る値も同じ門を通す） */
function assertInputShape(key: KeepInputKey, value: Record<string, unknown>): void {
  if (key === 'inview_satisfaction') {
    const score = value.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > SATISFACTION_MAX) {
      throw new AppError(400, 'VALIDATION_ERROR', `inview_satisfaction.score は 0〜${SATISFACTION_MAX} の数（4.0 満点）で指定してください`);
    }
  }
}

/** 1つの key を丸ごと置き換える（部分更新はしない — 値の形は key ごとに違う） */
export async function upsertInput(
  meetingDate: string, key: unknown, value: unknown, userId: string | null,
): Promise<KeepInput> {
  const date = assertMeetingDate(meetingDate);
  if (!isKeepInputKey(key)) {
    throw new AppError(400, 'VALIDATION_ERROR', `key は ${KEEP_INPUT_KEYS.join(' / ')} のいずれかを指定してください`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'value はオブジェクト（例: {"score": 3.9}）で指定してください');
  }
  assertInputShape(key, value as Record<string, unknown>);
  await execute(
    `INSERT INTO keep_report_inputs (meeting_date, key, value, updated_at, updated_by)
     VALUES (?, ?, ?::jsonb, NOW(), ?)
     ON CONFLICT (meeting_date, key) DO UPDATE SET
       value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [date, key, JSON.stringify(value), userId],
  );
  const row = await queryOne(
    'SELECT meeting_date, key, value, updated_at, updated_by FROM keep_report_inputs WHERE meeting_date = ? AND key = ?',
    [date, key],
  );
  return toInput(row!);
}
