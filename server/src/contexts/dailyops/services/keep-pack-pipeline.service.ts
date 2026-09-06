/**
 * 定例報告パック — ①ヨミ表（keep-report.md §5.2）
 *
 * 行は `projects` のうち **終わっていない案件**（`stage NOT IN (r_delivered, s_completed, e_lost)`。
 * ネタ `neta` も載せる — ご判断）。固定原価Pj（`FIXED-COGS`）は営業案件ではないので外す。
 *
 *   見積金額・粗利 … 最新の見積（`ESTIMATE_AMOUNT_LATERAL` と、その仕入見込み `ESTIMATE_COST_LATERAL`）
 *   次のやること   … 未対応の次回アクションのうち期限がいちばん近いもの（**判定は `OPEN_NEXT_ACTION_SQL` の1本**）
 *   最後の動き     … 案件・営業活動・タスクの更新のいちばん新しいもの（案件一覧の「最後の動き」と同じ考え）
 *   新規／更新     … 前回の会議日と `created_at` / `updated_at` の比較（`pipelineSinceLast`）
 *   確度           … ステージ → A〜E。受注確度（%）は `project_stage_probabilities`
 *
 * 「サムライ関連」は主体ではなく**お客様**で分ける（`companies.samurai_group`）。
 * `external` には それ以外の全部（グループ内のお客様の案件も含む。`scope.customer_segment` で絞れる）。
 * `weighted_revenue` / `total_revenue` は両方の表を合わせた見積金額の 確度加味／総額。
 */
import { queryAll } from '../../../shared/db/connection';
import { OPEN_NEXT_ACTION_SQL } from '../../../shared/services/next-action-state';
import { ESTIMATE_AMOUNT_LATERAL } from '../../sales/services/project.service';
import { getStageProbabilityMap } from '../../sales/services/stage-probability.service';
import { deriveEntity, isBusinessEntity, type EntityScope } from '../../sales/services/project-entity';
import { confidenceOf, CONFIDENCE_ORDER, pipelineSinceLast } from './keep-pack-calc';
import { PAGE_SOURCE_COLUMNS, ESTIMATE_COST_LATERAL, type PageSource } from './keep-pack-pages.service';
import type { KeepReportPack, PipelineRow, SegmentScope } from './keep-pack.types';

const FIXED_COGS_CODE = 'FIXED-COGS';

interface PipelineSourceRow extends PageSource {
  keep_pick: unknown;
  samurai_group: unknown;
  created_at: unknown;
  updated_at: unknown;
  next_action: string | null;
  next_action_date: string | null;
  next_action_owner: string | null;
  last_activity_at: unknown;
}

export interface PipelineBuild {
  pipeline: KeepReportPack['pipeline'];
  /** ヨミ表で「資料」に印を付けた案件（案件ページの材料。並びはヨミ表と同じ） */
  picked: PageSource[];
}

/** 絞り込みの WHERE（主体・お客様の区分）。`customer_type` が無い行は外部とみなす（`deriveEntity` と同じ側） */
export function scopeWhere(entity: EntityScope, segment: SegmentScope): { sql: string; params: unknown[] } {
  let sql = '';
  const params: unknown[] = [];
  if (entity !== 'all') { sql += ' AND p.entity = ?'; params.push(entity); }
  if (segment !== 'all') { sql += " AND COALESCE(p.customer_type, 'external') = ?"; params.push(segment); }
  return { sql, params };
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function compareRows(a: PipelineRow, b: PipelineRow): number {
  const ca = CONFIDENCE_ORDER.indexOf(a.confidence);
  const cb = CONFIDENCE_ORDER.indexOf(b.confidence);
  if (ca !== cb) return ca - cb;
  const ea = a.event_start ?? '9999-12-31';
  const eb = b.event_start ?? '9999-12-31';
  if (ea !== eb) return ea < eb ? -1 : 1;
  return a.name.localeCompare(b.name, 'ja');
}

export async function buildPipeline(opts: {
  previousMeetingDate: string | null; entity: EntityScope; segment: SegmentScope;
}): Promise<PipelineBuild> {
  const scope = scopeWhere(opts.entity, opts.segment);
  const [rows, probability] = await Promise.all([
    queryAll(
      `SELECT ${PAGE_SOURCE_COLUMNS},
              p.keep_pick, p.created_at, p.updated_at,
              COALESCE(c.samurai_group, FALSE) AS samurai_group,
              na.next_action, na.next_action_date, na.owner_name AS next_action_owner,
              GREATEST(p.updated_at, COALESCE(mv.last_at, p.updated_at)) AS last_activity_at
         FROM projects p
         LEFT JOIN companies c ON c.id = p.customer_id
         ${ESTIMATE_AMOUNT_LATERAL}
         ${ESTIMATE_COST_LATERAL}
         LEFT JOIN LATERAL (
           SELECT a.next_action, a.next_action_date, u.name AS owner_name
             FROM activity_logs a
             LEFT JOIN users u ON u.id = a.user_id
            WHERE a.project_id = p.id AND ${OPEN_NEXT_ACTION_SQL}
            ORDER BY a.next_action_date ASC, a.created_at ASC
            LIMIT 1
         ) na ON TRUE
         LEFT JOIN LATERAL (
           SELECT MAX(x.at) AS last_at FROM (
             SELECT MAX(t.updated_at) AS at FROM project_tasks t
               WHERE t.project_id = p.id AND t.deleted_at IS NULL
             UNION ALL
             SELECT MAX(a.updated_at) AS at FROM activity_logs a
               WHERE a.project_id = p.id AND a.deleted_at IS NULL
           ) x
         ) mv ON TRUE
        WHERE p.deleted_at IS NULL
          AND p.stage NOT IN ('r_delivered', 's_completed', 'e_lost')
          AND COALESCE(p.code, '') <> ?${scope.sql}
        ORDER BY p.event_start NULLS LAST, p.created_at`,
      [FIXED_COGS_CODE, ...scope.params],
    ) as unknown as Promise<PipelineSourceRow[]>,
    getStageProbabilityMap(),
  ]);

  const pairs = rows.map((r) => {
    const estimateAmount = r.estimate_amount == null ? null : Number(r.estimate_amount);
    const estimateCost = r.estimate_cost == null ? 0 : Number(r.estimate_cost);
    const segment = r.customer_type === 'internal' ? 'internal' as const : 'external' as const;
    const row: PipelineRow = {
      project_id: r.id,
      code: r.gls_number || r.code || '',
      name: r.name,
      customer_name: r.customer_name ?? '',
      customer_segment: segment,
      entity: isBusinessEntity(r.entity) ? r.entity : deriveEntity(segment),
      samurai_related: r.samurai_group === true,
      stage: r.stage,
      confidence: confidenceOf(r.stage),
      probability: probability.get(r.stage as never) ?? 0,
      event_start: r.event_start || null,
      event_end: r.event_end || null,
      estimate_amount: estimateAmount,
      estimate_gross_profit: estimateAmount == null ? null : estimateAmount - estimateCost,
      next_action: r.next_action ?? null,
      next_action_date: r.next_action_date ?? null,
      next_action_owner: r.next_action_owner ?? null,
      last_activity_at: toIso(r.last_activity_at),
      since_last: pipelineSinceLast(r.created_at as Date | string | null, r.updated_at as Date | string | null, opts.previousMeetingDate),
    };
    return { row, source: r };
  }).sort((a, b) => compareRows(a.row, b.row));

  const external: PipelineRow[] = [];
  const samurai: PipelineRow[] = [];
  let weighted = 0;
  let total = 0;
  for (const { row } of pairs) {
    (row.samurai_related ? samurai : external).push(row);
    if (row.estimate_amount != null) {
      total += row.estimate_amount;
      weighted += Math.round(row.estimate_amount * (row.probability / 100));
    }
  }
  return {
    pipeline: { external, samurai, weighted_revenue: weighted, total_revenue: total },
    picked: pairs.filter((p) => p.source.keep_pick === true).map((p) => p.source),
  };
}
