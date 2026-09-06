/**
 * 締め（`settle`）の DB 読み書き（段7 §5）。**AI を呼ばない。**
 * LLM プロバイダの SDK・呼び出しラッパーは1つも import しない（試験16が見張る）。
 */
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { recordCorrections } from '../../../shared/services/ai-output.service';
import { docTotalSec } from '../../../shared/schedule/time';
import { jstDate } from '../../../shared/utils/jst';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { computeEarlyDueAt, computeFinalDueInfo, computeSettleCorrections } from './settle.core';
import { getProposalRow } from './apply.service';
import { AI_SETTLE_BATCH_LIMIT } from './kinds';
import type { AppliedIds, AppliedPayload, ProposalRow, SettledReason } from './types';

interface AfterData { rows?: unknown[]; items?: unknown[]; scenarioBlockId: string | null }

/** その提案の対象（台本 / 枠）から、現在の rows・items・scenario の blockId を読む */
async function fetchAfter(row: ProposalRow): Promise<AfterData> {
  if (row.document_id) {
    const doc = await queryOne(
      'SELECT data FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [row.document_id],
    );
    const data = (doc?.data as Record<string, unknown>) ?? {};
    const sections = Array.isArray(data.sections) ? (data.sections as Record<string, unknown>[]) : [];
    const rows = sections.flatMap((s) => (Array.isArray(s.rows) ? (s.rows as unknown[]) : []));
    const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : [];
    const scenarioBlockId = (blocks.find((b) => b.type === 'scenario')?.id as string | undefined) ?? null;
    return { rows, scenarioBlockId };
  }
  if (row.schedule_id) {
    const items = await queryAll(
      'SELECT * FROM qsheet_schedule_items WHERE schedule_id = ? AND deleted_at IS NULL', [row.schedule_id],
    );
    return { items, scenarioBlockId: null };
  }
  return { scenarioBlockId: null };
}

/** `broadcast_date` / `service_date`・実尺の初回記録日を読む（`final` の期限を決めるため） */
async function fetchScheduleContext(row: ProposalRow): Promise<{ broadcastDate: string | null; firstCueActualDate: string | null }> {
  if (row.document_id) {
    const doc = await queryOne(
      'SELECT broadcast_date FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [row.document_id],
    );
    // `qsheet_cue_actuals` は段1で先に入っている（本実装時点で存在確認済み）。
    // その台本で本番トランスポートが最初に動いた日 (JST) を実尺から読む。
    const actual = await queryOne(
      `SELECT MIN(recorded_at) AS first_at FROM qsheet_cue_actuals WHERE document_id = ?`, [row.document_id],
    ) as { first_at?: string } | undefined;
    const firstCueActualDate = actual?.first_at ? jstDate(new Date(actual.first_at)) : null;
    return { broadcastDate: (doc?.broadcast_date as string | null) ?? null, firstCueActualDate };
  }
  if (row.schedule_id) {
    const sch = await queryOne(
      'SELECT service_date FROM qsheet_schedules WHERE id = ? AND deleted_at IS NULL', [row.schedule_id],
    );
    const serviceDate = sch?.service_date ? String(sch.service_date).slice(0, 10) : null;
    return { broadcastDate: serviceDate, firstCueActualDate: null };
  }
  return { broadcastDate: null, firstCueActualDate: null };
}

/**
 * `settled_at` / `source_updated_at` を更新して索引を作り直す（`final` 締め時のみ・§5-4 手順7）。
 * ⚠️ **ここで作るのは最小限**（section_count / row_count / total_sec / block_types /
 * section_labels / is_reference の既定値まで）。`customer_id` / `project_type` /
 * `person_names` 等の充実は段8（`doc-index.service.ts`）が持つ — 類似検索・few-shot は
 * まだこの段で使わないため、器と「締めたら作り直す」導線だけをここで先に作る（§3-2 の理由）。
 */
async function rebuildDocIndex(row: ProposalRow): Promise<void> {
  if (!row.document_id) return; // ①枠（schedule 由来）は索引の対象外
  const doc = await queryOne(
    'SELECT project_id, broadcast_date, data, updated_at FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL',
    [row.document_id],
  );
  if (!doc) return;
  const data = (doc.data as Record<string, unknown>) ?? {};
  const sections = Array.isArray(data.sections) ? (data.sections as Record<string, unknown>[]) : [];
  const rows = sections.flatMap((s) => (Array.isArray(s.rows) ? (s.rows as Record<string, unknown>[]) : []));
  const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : [];
  const scenarioBlockId = (blocks.find((b) => b.type === 'scenario')?.id as string | undefined) ?? null;
  const scenarioRows = scenarioBlockId
    ? rows.filter((r) => {
        const cell = (r.cells as Record<string, unknown> | undefined)?.[scenarioBlockId] as Record<string, unknown> | undefined;
        const entry = (cell?.entries as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
        return !!(entry?.html || entry?.name);
      }).length
    : 0;
  // 合計尺: preferRoleDuration=true（編集画面と同じ優先順位。00-datamodel-fixes §3）
  const totalSec = docTotalSec(
    sections.map((s) => ({ duration: s.duration as string | number | null, rows: (s.rows as Record<string, unknown>[] | undefined)?.map((r) => ({ duration: r.duration as string | number | null })) })),
    { preferRoleDuration: true },
  );
  await execute(
    `INSERT INTO qsheet_doc_index
       (document_id, project_id, service_date, section_count, row_count, total_sec,
        scenario_rows, block_types, section_labels, is_reference, settled_at, indexed_at, source_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW(), ?)
     ON CONFLICT (document_id) DO UPDATE SET
       project_id = EXCLUDED.project_id, service_date = EXCLUDED.service_date,
       section_count = EXCLUDED.section_count, row_count = EXCLUDED.row_count,
       total_sec = EXCLUDED.total_sec, scenario_rows = EXCLUDED.scenario_rows,
       block_types = EXCLUDED.block_types, section_labels = EXCLUDED.section_labels,
       settled_at = NOW(), indexed_at = NOW(), source_updated_at = EXCLUDED.source_updated_at`,
    [
      row.document_id, doc.project_id ?? null, doc.broadcast_date ? String(doc.broadcast_date).slice(0, 10) : null,
      sections.length, rows.length, totalSec, scenarioRows,
      JSON.stringify(blocks.map((b) => String(b.type ?? ''))),
      JSON.stringify(sections.map((s) => String(s.label ?? ''))),
      doc.updated_at ?? null,
    ],
  );
}

/** 1段ぶんを締める。条件付き UPDATE で二重計上を防ぐ（`hasCorrections` は使わない。§5-4 手順6） */
async function settleOneStage(
  row: ProposalRow, stage: 'early' | 'final', reason: SettledReason | null, actorId: string | null,
): Promise<'settled' | 'already'> {
  const column = stage === 'early' ? 'settled_at' : 'settled_final_at';
  const claimed = await queryOne(
    `UPDATE qsheet_ai_proposals
        SET ${column} = NOW(), settle_stage = ?, settled_reason = COALESCE(?, settled_reason), updated_at = NOW()
      WHERE id = ? AND ${column} IS NULL AND state = 'applied'
      RETURNING id`,
    [stage, reason, row.id],
  );
  if (!claimed) return 'already';

  const after = await fetchAfter(row);
  const corrections = computeSettleCorrections({
    kind: row.kind,
    appliedPayload: (row.applied_payload ?? {}) as AppliedPayload,
    appliedIds: (row.applied_ids ?? { sections: [], rows: [], items: [], columns: [] }) as AppliedIds,
    after: { rows: after.rows, items: after.items },
    stage,
    scenarioBlockId: after.scenarioBlockId,
  });
  if (row.ai_output_id) await recordCorrections(row.ai_output_id, corrections, actorId);
  if (stage === 'final') await rebuildDocIndex(row);
  return 'settled';
}

/** 「今すぐ締める」（`manual`）。未締めの段を古い順に締める（早い方を先に済ませてから遅い方へ） */
export async function settleProposalManual(proposalId: string, actorId: string | null): Promise<void> {
  const row = await getProposalRow(proposalId);
  if (!row) throw new NotFoundError('提案が見つかりません');
  if (row.state !== 'applied') throw new ValidationError('取り込み済みの提案だけ締められます');
  if (row.settled_at === null) await settleOneStage(row, 'early', 'manual', actorId);
  const refreshed = (await getProposalRow(proposalId)) ?? row;
  if (refreshed.settled_final_at === null) await settleOneStage(refreshed, 'final', 'manual', actorId);
}

/**
 * 表を「確定」にした瞬間に呼ぶ、AI 由来項目（①枠）の**1段目（early）だけ**の締め。
 * 14-schedule-v2-plan.md §3 B10・§5「穴: 取り込んだ後にグリッド上で直した分が差分に残らない」。
 *
 * ⚠️ **`final` は締めない。** `settleProposalManual` と違い、ここで最後まで締めてしまうと
 * この機能が埋めたい穴——「当日の押し・巻き」——を二度と拾えなくなる
 * （`settleDueProposals`／将来の手動締めは `settled_final_at IS NULL` の行しか見ないため）。
 * final は今までどおり、本番日翌日の夜間バッチ（`settleDueProposals`）か
 * `settleProposalManual` に任せる——確定は本番より何日も前に押されるのが普通なので、
 * ここで先取りしない。
 *
 * 対象はこの表に紐づく、取り込み済み（`state='applied'`）の①枠提案**全部**
 * （1つの表に複数回 AI 生成していれば複数件ありうる）。二重計上は `settleOneStage` の
 * 条件付き UPDATE（`WHERE settled_at IS NULL`）が防ぐので、確定の保存を何度繰り返しても
 * 安全（呼び出し側は「確定で保存するたび呼ぶ」でよい）。AI を呼ばない・失敗しても
 * 表の保存自体は止めない（呼び出し側で catch する）。
 */
export async function settleScheduleEarlyOnConfirm(scheduleId: string, actorId: string | null): Promise<void> {
  const rows = await queryAll(
    `SELECT * FROM qsheet_ai_proposals WHERE schedule_id = ? AND state = 'applied' AND settled_at IS NULL`,
    [scheduleId],
  ) as unknown as ProposalRow[];
  for (const row of rows) {
    try {
      await settleOneStage(row, 'early', 'manual', actorId);
    } catch (e) {
      console.error('[qsheet-ai] settleScheduleEarlyOnConfirm failed:', row.id, (e as Error).message);
    }
  }
}

/**
 * 夜間バッチ本体。**通知は出さない**（呼び出し側の `scheduler.service.ts` が `[]` を返す）。
 * 同じ回で early・final 両方の期限に達していたら、**必ず early → final の順**に締める（§5-2）。
 */
export async function settleDueProposals(): Promise<{ early: number; final: number; failed: number }> {
  const earlyCandidates = await queryAll(
    `SELECT * FROM qsheet_ai_proposals WHERE state = 'applied' AND settled_at IS NULL
      ORDER BY applied_at ASC LIMIT ?`, [AI_SETTLE_BATCH_LIMIT],
  ) as unknown as ProposalRow[];
  const finalCandidates = await queryAll(
    `SELECT * FROM qsheet_ai_proposals WHERE state = 'applied' AND settled_final_at IS NULL
      ORDER BY applied_at ASC LIMIT ?`, [AI_SETTLE_BATCH_LIMIT],
  ) as unknown as ProposalRow[];
  const byId = new Map<string, ProposalRow>();
  for (const r of [...earlyCandidates, ...finalCandidates]) byId.set(r.id, r);

  let early = 0, final = 0, failed = 0;
  for (const row of byId.values()) {
    try {
      const now = new Date();
      const ctx = await fetchScheduleContext(row);
      const finalInfo = computeFinalDueInfo({
        appliedAt: new Date(row.applied_at as string), broadcastDate: ctx.broadcastDate, firstCueActualDate: ctx.firstCueActualDate,
      });
      const earlyDueAt = computeEarlyDueAt(new Date(row.applied_at as string), finalInfo.dueAt);

      if (row.settled_at === null && now >= earlyDueAt) {
        const r = await settleOneStage(row, 'early', null, null);
        if (r === 'settled') early += 1;
      }
      if (row.settled_final_at === null && now >= finalInfo.dueAt) {
        // early 側の再取得は不要 (settleOneStage は applied_payload を書き換えない)
        const r = await settleOneStage(row, 'final', finalInfo.reason, null);
        if (r === 'settled') final += 1;
      }
    } catch (e) {
      failed += 1;
      console.error('[qsheet-ai] settleDueProposals failed:', row.id, (e as Error).message);
    }
  }
  return { early, final, failed };
}

/** 放置された `open` 提案を期限切れにする。§5-5 */
export async function expireOpenProposals(): Promise<number> {
  const rows = await queryAll(
    `UPDATE qsheet_ai_proposals SET state = 'discarded', discard_reason = 'expired', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM qsheet_ai_proposals WHERE state = 'open' AND expires_at < NOW()
        LIMIT ?
      )
     RETURNING ai_output_id`,
    [AI_SETTLE_BATCH_LIMIT],
  ) as { ai_output_id: string | null }[];
  let count = 0;
  for (const r of rows) {
    count += 1;
    if (!r.ai_output_id) continue;
    await recordCorrections(r.ai_output_id, [
      { fieldPath: '(全体)', before: null, after: null, type: 'reject', note: '未使用のまま期限切れ' },
    ]);
  }
  return count;
}
