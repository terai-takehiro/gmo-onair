/**
 * 定例報告パックの凍結と読み出し（`keep_report_packs`・migration 291・keep-report.md §5.5）
 *
 * ── 決めごと ────────────────────────────────────────────────
 * - 「いまの数字」は保存しない（毎回計算）。**週報を確定した時点で凍結**し、資料・Slack・MCP は
 *   凍結した版を読む（週報の「自動集計は投稿時点の数字」と同じ約束）
 * - **凍結した版は書き換えない。** 数字を直したいときは元データを直して凍結し直す —
 *   新しい版を INSERT し、前の版は残す（`meeting_date` に UNIQUE は無い）。読むときは最新の版
 * - ただし**同じ会議日・同じ絞り込みを 60 秒以内に凍結し直しても版は増やさない**（直前の版を返す）。
 *   週報の確定ボタンの二度押し・確定と単独の凍結の同時押しで、同じ数字の版が2つ並ぶのを止める。
 *   同時に走った2本は `pg_advisory_xact_lock` で直列にする（片方が INSERT を終えてからもう片方が読む）
 * - 週報との結びは両側で持つ: `keep_report_packs.ops_report_id` と `ops_reports.payload.keep`。
 *   `ops_report_id` は存在する週報だけ（知らない id は 400。FK の 500 にしない）
 * - `scope_entity` は計上会社 `entity_code`（all / SCS / GSS / GMO・2026年10月の事業再編）
 * - **凍結は絞り込み 12 通り（計上会社 4 × お客様区分 3）を全部**（`freezeMeeting`）。全体／全区分だけ凍結すると、
 *   画面のチップ・Slack・MCP の絞り込み付きの読みが凍結版を外れて「いまの数字」に落ち、確定した週報と違う数字が出る
 *
 * HTTP（`keep.routes.ts`）と MCP（`keep.tools.ts`）は **`getPackForMeeting` の1本**を通る
 * （画面と AI が同じ答えを読む）。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { buildPack, resolveMeetingDateForWeek, resolveMeetings } from './keep-pack.service';
import { assertMeetingDate } from './keep-pack-inputs.service';
import { BUSINESS_ENTITIES, isEntityScope, type EntityScope, type KeepReportPack, type SegmentScope } from './keep-pack.types';
import { samePackContent } from './keep-pack-identity';

export { getInputs, upsertInput, assertMeetingDate } from './keep-pack-inputs.service';

export interface PackScope { entity: EntityScope; segment: SegmentScope }

/** 絞り込みの全組み合わせ（計上会社 4 × お客様区分 3 ＝ 12）。画面・Slack・MCP が選べる値と同じ。先頭は全体／全区分 */
export const ALL_PACK_SCOPES: readonly PackScope[] = (['all', ...BUSINESS_ENTITIES] as EntityScope[])
  .flatMap((entity) => (['all', 'internal', 'external'] as SegmentScope[]).map((segment) => ({ entity, segment })));

/** クエリ／引数の計上会社（`entity_code`）・区分を読む。無ければ `all`、知らない値は 400 */
export function parseScope(entityRaw: unknown, segmentRaw: unknown): PackScope {
  const entity = entityRaw == null || entityRaw === '' ? 'all' : entityRaw;
  if (!isEntityScope(entity)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'entity_code は all / SCS / GSS / GMO のいずれかを指定してください');
  }
  const segment = segmentRaw == null || segmentRaw === '' ? 'all' : segmentRaw;
  if (segment !== 'all' && segment !== 'internal' && segment !== 'external') {
    throw new AppError(400, 'VALIDATION_ERROR', 'segment は all / internal / external のいずれかを指定してください');
  }
  return { entity, segment };
}

export interface FrozenPack { id: string; pack: KeepReportPack; frozen_at: string }

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

/** 同じ会議日・同じ絞り込みの凍結を「凍結し直し」ではなく同じ版とみなす時間幅 */
const FREEZE_DEDUPE_SECONDS = 60;

/**
 * いまの数字で組んで凍結する。返り値の `pack.frozen_at` は保存した時刻。
 * 60 秒以内に同じ会議日・同じ絞り込みの版があればそれを返す（新しい版は作らない。
 * その版に週報が結ばれていなければ `ops_report_id` だけ足す — 結びが片側だけ欠けないように）。
 */
export async function freezePack(opts: {
  meetingDate: string; entity?: EntityScope; segment?: SegmentScope;
  opsReportId?: string | null; userId?: string | null;
}): Promise<FrozenPack> {
  const meetingDate = assertMeetingDate(opts.meetingDate);
  const entity = opts.entity ?? 'all';
  const segment = opts.segment ?? 'all';
  const opsReportId = opts.opsReportId ?? null;
  if (opsReportId) {
    const report = await queryOne('SELECT id FROM ops_reports WHERE id = ? AND deleted_at IS NULL', [opsReportId]);
    if (!report) throw new AppError(400, 'VALIDATION_ERROR', 'ops_report_id の週報が見つかりません');
  }
  // パックは取引の外で組む（数十本の SELECT。ロックを持ったまま長く走らせない）
  const built = await buildPack({ meetingDate, entity, segment });
  const frozenAt = new Date().toISOString();
  const pack: KeepReportPack = { ...built, frozen_at: frozenAt };
  const id = uuidv4();
  return await withTransaction(async (tx) => {
    // 同じ会議日・同じ絞り込みの凍結を直列にする（advisory lock はこの取引の終わりで外れる）
    await tx.execute(`SELECT pg_advisory_xact_lock(hashtext(? || '|' || ? || '|' || ?))`, [meetingDate, entity, segment]);
    const recent = await tx.queryOne(
      `SELECT id, pack, frozen_at, ops_report_id FROM keep_report_packs
        WHERE meeting_date = ? AND scope_entity = ? AND scope_segment = ?
          AND frozen_at IS NOT NULL AND frozen_at > NOW() - (? || ' seconds')::interval
        ORDER BY frozen_at DESC LIMIT 1`,
      [meetingDate, entity, segment, FREEZE_DEDUPE_SECONDS],
    );
    // 直近の凍結と**中身が同じとき**だけ 1 行にまとめる（時刻だけで束ねると、数字を直してすぐ
    // 確定し直した版が捨てられ、読む人・出力・Slack の文面が古い数字のまま残る）
    if (recent && samePackContent(recent.pack, pack)) {
      if (opsReportId && recent.ops_report_id == null) {
        await tx.execute('UPDATE keep_report_packs SET ops_report_id = ? WHERE id = ?', [opsReportId, recent.id]);
      }
      return { id: String(recent.id), pack: recent.pack as KeepReportPack, frozen_at: toIso(recent.frozen_at) };
    }
    await tx.execute(
      `INSERT INTO keep_report_packs
         (id, meeting_date, scope_entity, scope_segment, pack, generated_at, frozen_at, frozen_by, ops_report_id)
       VALUES (?, ?, ?, ?, ?::jsonb, ?::timestamptz, ?::timestamptz, ?, ?)`,
      [id, meetingDate, entity, segment, JSON.stringify(pack), pack.generated_at, frozenAt, opts.userId ?? null, opsReportId],
    );
    return { id, pack, frozen_at: frozenAt };
  });
}

/**
 * 会議日の**全部の絞り込み**（`ALL_PACK_SCOPES`・12 通り）を凍結する。週報の確定と `POST /keep/pack/freeze` の両方がここを通る。
 * 全体／全区分を先に凍結して返し（週報が結ぶのはこの版）、残りは 1 つ失敗しても他を続ける（全体の凍結を失敗にしない・
 * 失敗は warn に残す）。12 通り × 数十本の SELECT でも合計 0.3 秒ほど（検証DBの実測）。
 * `scopes_frozen` は凍結できた絞り込みの数（12 なら全部）。
 */
export async function freezeMeeting(opts: {
  meetingDate: string; opsReportId?: string | null; userId?: string | null;
}): Promise<FrozenPack & { scopes_frozen: number }> {
  const primary = await freezePack({ ...opts, entity: 'all', segment: 'all' });
  let scopesFrozen = 1;
  for (const scope of ALL_PACK_SCOPES) {
    if (scope.entity === 'all' && scope.segment === 'all') continue;
    try {
      await freezePack({ ...opts, entity: scope.entity, segment: scope.segment });
      scopesFrozen++;
    } catch (err) {
      console.warn(`[keep-pack] 絞り込み ${scope.entity}/${scope.segment} の凍結に失敗（全体／全区分は凍結済み）:`, opts.meetingDate, (err as Error).message);
    }
  }
  return { ...primary, scopes_frozen: scopesFrozen };
}

/** その会議日・その絞り込みの凍結済みの版があるか（中身は読まない） */
async function hasFrozenPack(meetingDate: string, entity: EntityScope, segment: SegmentScope): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1 AS one FROM keep_report_packs
      WHERE meeting_date = ? AND scope_entity = ? AND scope_segment = ? AND frozen_at IS NOT NULL LIMIT 1`,
    [meetingDate, entity, segment],
  );
  return !!row;
}

/** その会議日・その絞り込みの凍結済みの最新の版。無ければ null */
export async function getFrozenPack(meetingDate: string, entity: EntityScope, segment: SegmentScope): Promise<FrozenPack | null> {
  const row = await queryOne(
    `SELECT id, pack, frozen_at FROM keep_report_packs
      WHERE meeting_date = ? AND scope_entity = ? AND scope_segment = ? AND frozen_at IS NOT NULL
      ORDER BY frozen_at DESC LIMIT 1`,
    [meetingDate, entity, segment],
  ) as { id: string; pack: KeepReportPack; frozen_at: unknown } | undefined;
  if (!row) return null;
  return { id: row.id, pack: row.pack, frozen_at: toIso(row.frozen_at) };
}

export interface PackListRow {
  id: string;
  meeting_date: string;
  scope_entity: string;
  scope_segment: string;
  generated_at: string;
  frozen_at: string | null;
  frozen_by: string | null;
  ops_report_id: string | null;
}

/**
 * 凍結した版の一覧（新しい会議日・新しい凍結が先）。中身（pack）は運ばない。
 * 週報の確定は 12 通りの絞り込みを全部凍結する（`freezeMeeting`）ので、会議日ごとに 1 行ずつ見たいときは
 * `entity: 'all', segment: 'all'` で絞る。`limit` は 1〜500（既定 100）
 */
export async function listPacks(opts: { limit?: number; entity?: EntityScope | null; segment?: SegmentScope | null } = {}): Promise<PackListRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.entity) { where.push('scope_entity = ?'); params.push(opts.entity); }
  if (opts.segment) { where.push('scope_segment = ?'); params.push(opts.segment); }
  params.push(Math.min(500, Math.max(1, opts.limit ?? 100)));
  const rows = await queryAll(
    `SELECT id, meeting_date, scope_entity, scope_segment, generated_at, frozen_at, frozen_by, ops_report_id
       FROM keep_report_packs
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY meeting_date DESC, frozen_at DESC NULLS LAST, created_at DESC
      LIMIT ?`,
    params,
  );
  return rows.map((r) => ({
    id: String(r.id),
    meeting_date: String(r.meeting_date),
    scope_entity: String(r.scope_entity),
    scope_segment: String(r.scope_segment),
    generated_at: toIso(r.generated_at),
    frozen_at: r.frozen_at == null ? null : toIso(r.frozen_at),
    frozen_by: (r.frozen_by as string | null) ?? null,
    ops_report_id: (r.ops_report_id as string | null) ?? null,
  }));
}

export interface PackResponse {
  pack: KeepReportPack;
  /** 凍結した版を返したか。false は「いまの数字」（`pack.frozen_at` も null） */
  frozen: boolean;
  pack_id: string | null;
  /**
   * この会議日に**全体／全区分**の凍結版があるか。`frozen: false` なのに true なら、その絞り込みの版だけが無い
   * （`freezeMeeting` より前に凍結した会議日か、その絞り込みの凍結だけ失敗した）＝ いまの数字を返している。
   * 画面はこれを見て「凍結済みだがこの絞り込みの版は無い」と書く（黙って凍結版のふりをしない）
   */
  meeting_frozen: boolean;
}

/**
 * 会議日のパック。凍結した版があればそれ、無ければ（または `live`）いまの数字。
 * `meetingDate` を省くと次回の開催日（`resolveMeetings`）。HTTP と MCP の共通の入口。
 */
export async function getPackForMeeting(opts: {
  meetingDate?: string | null; entity?: unknown; segment?: unknown; live?: boolean;
}): Promise<PackResponse> {
  const { entity, segment } = parseScope(opts.entity, opts.segment);
  const meetingDate = opts.meetingDate
    ? assertMeetingDate(opts.meetingDate, 'meeting')
    : (await resolveMeetings()).next_meeting_date;
  const meetingFrozen = await hasFrozenPack(meetingDate, 'all', 'all');
  if (!opts.live) {
    const frozen = await getFrozenPack(meetingDate, entity, segment);
    if (frozen) return { pack: frozen.pack, frozen: true, pack_id: frozen.id, meeting_frozen: meetingFrozen };
  }
  const pack = await buildPack({ meetingDate, entity, segment });
  return { pack, frozen: false, pack_id: null, meeting_frozen: meetingFrozen };
}

/**
 * 週報（`weekly_activity`）を確定したときに呼ぶ。その週にある会議日（無ければ次の開催日）の
 * パックを **12 通りの絞り込み全部**で凍結し（`freezeMeeting`。週報が結ぶのは全体／全区分の版）、
 * `ops_reports.payload.keep = { pack_id, meeting_date }` を
 * **他の鍵を残したまま**足す（`||` は上の階層の鍵だけ差し替える。`stats` は消えない）。
 *
 * ⚠️ **ここで失敗しても週報の確定は成功させる**（記録の失敗で業務を止めない）。
 * 週報を確定し直すたびに新しい版ができ、payload は最新の版を指す（前の版は残る）。
 */
export async function freezeKeepPackForWeeklyReport(reportId: string, periodKey: string, userId: string | null): Promise<void> {
  try {
    const meetingDate = await resolveMeetingDateForWeek(periodKey);
    const { id } = await freezeMeeting({ meetingDate, opsReportId: reportId, userId });
    await execute(
      `UPDATE ops_reports
          SET payload = COALESCE(payload, '{}'::jsonb) || ?::jsonb, updated_at = NOW()
        WHERE id = ?`,
      [JSON.stringify({ keep: { pack_id: id, meeting_date: meetingDate } }), reportId],
    );
  } catch (err) {
    console.warn('[keep-pack] 週報の確定に伴うパックの凍結に失敗（確定は続行）:', reportId, (err as Error).message);
  }
}
