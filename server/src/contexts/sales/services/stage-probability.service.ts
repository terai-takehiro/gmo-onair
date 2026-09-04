/**
 * 案件フェーズごとの受注確度（%）— `project_stage_probabilities` の読み書き
 *
 * 財務ダッシュボードの「営業見通し」（総額 / 確度加味）が使う重み。
 * 初期値・設計の背景は migration 276 のコメント参照。
 *
 * ── 読むたびに DB を叩かない ────────────────────────────────
 *
 * `money-rules.service.ts` と同じ考え方——パイプライン集計のたびに8行の
 * SELECT を挟むのは無駄なので、保存したときだけ読み直すキャッシュにする
 * （プロセスが1つの構成なので、保存＝自分のキャッシュを捨てるで足りる）。
 */
import { queryAll, execute } from '../../../shared/db/connection';
import { PROJECT_STAGE, type ProjectStage } from '../../../shared/constants/statuses';

export interface StageProbabilityRow {
  stage: ProjectStage;
  probability: number;
}

/** ドメイン——`projects_stage_check`（migration 271）と揃えてある */
const STAGES: readonly ProjectStage[] = Object.values(PROJECT_STAGE);

/** DB が読めないとき・行が足りないときの既定値（ご依頼の初期値） */
const FALLBACK: Record<ProjectStage, number> = {
  neta: 10,
  d_hold: 25,
  c_proposal: 50,
  b_verbal: 80,
  a_won: 100,
  r_delivered: 100,
  s_completed: 100,
  e_lost: 0,
};

let cache: StageProbabilityRow[] | null = null;

/** 保存済みの8行を、DB に無い stage も既定値で埋めて必ず8行返す */
export async function getStageProbabilities(): Promise<StageProbabilityRow[]> {
  if (cache) return cache;
  let rows: { stage: string; probability: number }[] = [];
  try {
    rows = await queryAll(
      `SELECT stage, probability FROM project_stage_probabilities`,
    ) as { stage: string; probability: number }[];
  } catch {
    rows = [];
  }
  const byStage = new Map(rows.map((r) => [r.stage, Number(r.probability)]));
  cache = STAGES.map((stage) => ({
    stage,
    probability: byStage.has(stage) ? byStage.get(stage)! : FALLBACK[stage],
  }));
  return cache;
}

/** stage → probability(0-100) の Map。パイプライン集計側が使う形 */
export async function getStageProbabilityMap(): Promise<Map<ProjectStage, number>> {
  const rows = await getStageProbabilities();
  return new Map(rows.map((r) => [r.stage, r.probability]));
}

export function invalidateStageProbabilities(): void { cache = null; }

export async function saveStageProbability(
  stage: string,
  probability: number,
  userId: string,
): Promise<StageProbabilityRow[]> {
  await execute(
    `INSERT INTO project_stage_probabilities (stage, probability, updated_at, updated_by)
     VALUES (?, ?, NOW(), ?)
     ON CONFLICT (stage) DO UPDATE SET
       probability = EXCLUDED.probability, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [stage, probability, userId],
  );
  invalidateStageProbabilities();
  return getStageProbabilities();
}

export function isKnownStage(stage: unknown): stage is ProjectStage {
  return typeof stage === 'string' && (STAGES as readonly string[]).includes(stage);
}
