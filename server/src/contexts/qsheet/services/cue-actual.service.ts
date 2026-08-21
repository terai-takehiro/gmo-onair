// 本番の実尺 (qsheet_cue_actuals) の記録・読み出し。
//
// **書き手は進行 (OnAir) の1台だけ。** 二重送信は run_id / section_id (or row_id) / pass_no の
// 一意制約 (ON CONFLICT DO NOTHING) が無害化する。
//
// **記録は全部 best-effort。** 失敗しても本番を止めない (audit() や
// ai-output.service.ts の recordAiOutput と同じ作法): 例外を投げず warn に落とす。
//
// 設計: docs/design/v4/qsheet-v4-coding/impl/01-cue-actuals-impl.md §5-3
import { v4 as uuid } from 'uuid';
import { execute, queryAll } from '../../../shared/db/connection';
import type { CueActualInput, CueActualRow, RunSummary } from '../types/cueActuals';

const MAX_ID_LENGTH = 200;

function isFiniteInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

function isIsoDateString(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 40) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

/**
 * 進行が送ってくる値の検算。**投げずに null を返す**(本番中に 500 を作らない)。
 * 妥当なら正規化した CueActualInput を返す。
 */
export function sanitizeCueActual(raw: unknown): CueActualInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;

  if (typeof b.run_id !== 'string' || b.run_id.length === 0 || b.run_id.length > MAX_ID_LENGTH) return null;
  if (!isIsoDateString(b.run_started_at)) return null;
  if (typeof b.section_id !== 'string' || b.section_id.length === 0 || b.section_id.length > MAX_ID_LENGTH) return null;

  const rowId = b.row_id === null || b.row_id === undefined ? null : b.row_id;
  if (rowId !== null && (typeof rowId !== 'string' || rowId.length === 0 || rowId.length > MAX_ID_LENGTH)) return null;

  const passNo = b.pass_no;
  if (!isFiniteInt(passNo) || passNo < 1) return null;

  const cueIndex = b.cue_index === null || b.cue_index === undefined ? null : b.cue_index;
  if (cueIndex !== null && !isFiniteInt(cueIndex)) return null;

  const plannedSec = b.planned_sec === null || b.planned_sec === undefined ? null : b.planned_sec;
  if (plannedSec !== null && (!isFiniteInt(plannedSec) || plannedSec < 0)) return null;

  const actualSec = b.actual_sec;
  if (!isFiniteInt(actualSec) || actualSec < 0) return null;

  return {
    run_id: b.run_id,
    run_started_at: b.run_started_at,
    section_id: b.section_id,
    row_id: rowId,
    pass_no: passNo,
    cue_index: cueIndex,
    planned_sec: plannedSec,
    actual_sec: actualSec,
  };
}

/**
 * 実尺を1件記録する (best-effort)。
 *  - ON CONFLICT DO NOTHING: 同じ (run_id, row/section, pass_no) の二重送信を無害にする
 *    (一意制約が部分索引2本なので、推論に列を書くと片方で `no unique or exclusion constraint
 *    matching` になる。**列指定なしの DO NOTHING が正解**)
 *  - **例外を投げない**。呼び出し側 (ルート) は結果を見ずに 204 を返す
 */
export async function recordCueActual(
  documentId: string,
  input: CueActualInput,
  userId: string | null,
): Promise<void> {
  try {
    await execute(
      `INSERT INTO qsheet_cue_actuals
         (id, document_id, run_id, run_started_at, section_id, row_id,
          pass_no, cue_index, planned_sec, actual_sec, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING`,
      [
        uuid(), documentId, input.run_id, input.run_started_at, input.section_id, input.row_id,
        input.pass_no, input.cue_index, input.planned_sec, input.actual_sec, userId,
      ],
    );
  } catch (e) {
    // 記録の失敗で本番を止めない (ai-output.service.ts:8-13 と同じ作法)
    console.warn('[qsheet-cue-actual] 記録に失敗しました', e);
  }
}

/** 台本の run 一覧を新しい順に返す (本番中には呼ばれない。落ちてよい)。 */
export async function listRuns(documentId: string): Promise<RunSummary[]> {
  const rows = await queryAll(
    `SELECT run_id,
            MIN(run_started_at) AS run_started_at,
            COUNT(*)::int AS cue_count,
            SUM(actual_sec)::int AS total_actual_sec,
            SUM(planned_sec)::int AS total_planned_sec
       FROM qsheet_cue_actuals
      WHERE document_id = $1
      GROUP BY run_id
      ORDER BY MIN(run_started_at) DESC
      LIMIT 200`,
    [documentId],
  );
  return rows.map((r) => ({
    run_id: r.run_id as string,
    run_started_at: (r.run_started_at as Date).toISOString(),
    cue_count: r.cue_count as number,
    total_actual_sec: r.total_actual_sec as number,
    total_planned_sec: (r.total_planned_sec as number | null) ?? null,
  }));
}

/** ある run (省略時は台本全体) の実尺行を古い順に返す (本番中には呼ばれない。落ちてよい)。 */
export async function listCueActuals(documentId: string, runId?: string): Promise<CueActualRow[]> {
  const params: unknown[] = [documentId];
  let sql = `SELECT * FROM qsheet_cue_actuals WHERE document_id = $1`;
  if (runId) {
    params.push(runId);
    sql += ` AND run_id = $${params.length}`;
  }
  sql += ' ORDER BY recorded_at ASC LIMIT 2000';
  const rows = await queryAll(sql, params);
  return rows.map((r) => ({
    id: r.id as string,
    document_id: r.document_id as string,
    run_id: r.run_id as string,
    run_started_at: (r.run_started_at as Date).toISOString(),
    section_id: r.section_id as string,
    row_id: (r.row_id as string | null) ?? null,
    pass_no: r.pass_no as number,
    cue_index: (r.cue_index as number | null) ?? null,
    planned_sec: (r.planned_sec as number | null) ?? null,
    actual_sec: r.actual_sec as number,
    recorded_at: (r.recorded_at as Date).toISOString(),
    recorded_by: (r.recorded_by as string | null) ?? null,
  }));
}
