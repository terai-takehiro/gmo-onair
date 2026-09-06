/**
 * GMO コストセンター（旧 GLS-B）の予算対実績・月次コスト集計
 * — 2026年10月の事業再編・P3（`docs/reorg-2026-10-plan.md` §4.7）
 *
 * ── 決めごと（§4.7） ──────────────────────────────────────────
 *
 * - **予算** ＝ その案件の受理済み（`status='accepted'`）の最新版の見積合計
 *   （GPM の「個別見積」を予算案として流用。表は増やさない）
 * - **実績** ＝ 確定した（`is_provisional` でない）仕入の合計
 * - **残** ＝ 予算 − 実績
 * - 月次は仕入の `recognition_date` で切る
 *
 * ── 「受理済みの最新版」の数え方 ─────────────────────────────
 *
 * 見積は版ごとに1行、同じ見積の版どうしは `group_id` で束ねる
 * （`project.service.ts` の `ESTIMATE_AMOUNT_LATERAL` と同じ考え方——
 * ただし予算はそちらと違い **`status='accepted'` の版だけ**を数える。
 * `ESTIMATE_AMOUNT_LATERAL` は draft/sent/accepted を全部含む「いま出ている
 * 見積金額」で、目的が違うため式を分ける——束ねて最新版を1本採る仕組みだけ流用する）。
 * 束の最新版が accepted でなければ（sent のまま・rejected 等）、その束は
 * 予算に含めない——「受理された」という事実が無いため。
 *
 * ── 対象は cost_center の会社だけ（原則） ───────────────────
 *
 * ここの関数は entity_code を見ずに「渡された project_id」で素直に集計する
 * （汎用の集計関数として書く——他の集計関数と同じ「読む側が対象を決める」流儀）。
 * 「GMO の案件だけを対象にする」判断は呼び出し側（ルート）が
 * `legal_entities.kind = 'cost_center'` を見て行う。
 */
import { queryOne, queryAll } from '../../../shared/db/connection';

export interface ProjectBudgetActual {
  project_id: string;
  /** 予算（受理済みの最新版の見積合計）。見積が無ければ 0 */
  budget: number;
  /** 予算の元になった見積の束の数（0件なら見積なし） */
  budget_estimate_groups: number;
  /** 実績（確定した仕入の合計） */
  actual: number;
  /** 残 = 予算 − 実績 */
  remaining: number;
}

/** BIGINT は pg から string で返るため数値化 */
function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

/** 案件1件ぶんの予算対実績 */
export async function getProjectBudgetActual(projectId: string): Promise<ProjectBudgetActual> {
  const [budgetRow, actualRow] = await Promise.all([
    queryOne(
      // ⚠️ **「束ごとの最新版」を先に決めてから status を見ること。**
      // WHERE で先に `status = 'accepted'` を絞ると、その束の本当の最新版が
      // sent/draft のときに「1つ前の accepted 版」を誤って最新版として拾ってしまう
      // （実際に踏んだ——束の最新版が受理されていない案件は、その束ぜんぶを
      // 予算に含めない、が正しい）。DISTINCT ON は project_id・deleted_at・
      // version だけで最新版を決め、accepted かどうかは**外側**で見る
      `SELECT COALESCE(SUM(latest.amount), 0) AS total, COUNT(*) AS groups FROM (
         SELECT DISTINCT ON (e.group_id) e.status, (e.subtotal - e.discount) AS amount
           FROM estimates e
          WHERE e.project_id = ? AND e.deleted_at IS NULL
          ORDER BY e.group_id, e.version DESC
       ) latest
       WHERE latest.status = 'accepted'`,
      [projectId],
    ) as Promise<{ total: string; groups: string }>,
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases
        WHERE project_id = ? AND deleted_at IS NULL AND is_provisional IS NOT TRUE`,
      [projectId],
    ) as Promise<{ total: string }>,
  ]);
  const budget = num(budgetRow?.total);
  const actual = num(actualRow?.total);
  return {
    project_id: projectId,
    budget,
    budget_estimate_groups: num(budgetRow?.groups),
    actual,
    remaining: budget - actual,
  };
}

/** 案件1件ぶんの月次コスト（確定した仕入だけを `recognition_date` の月で束ねる） */
export async function getProjectMonthlyCost(projectId: string): Promise<{ month: string; total: number }[]> {
  const rows = await queryAll(
    `SELECT LEFT(recognition_date, 7) AS month, COALESCE(SUM(amount), 0) AS total
       FROM purchases
      WHERE project_id = ? AND deleted_at IS NULL AND is_provisional IS NOT TRUE
        AND recognition_date IS NOT NULL AND recognition_date != ''
      GROUP BY LEFT(recognition_date, 7)
      ORDER BY month`,
    [projectId],
  ) as { month: string; total: string }[];
  return rows.map((r) => ({ month: r.month, total: num(r.total) }));
}

export interface CostCenterProjectSummary {
  id: string;
  gls_number: string | null;
  name: string;
  stage: string;
  budget: number;
  actual: number;
  remaining: number;
}

/**
 * コストセンター（`legal_entities.kind='cost_center'`）の全案件の予算対実績。
 * コスト側ダッシュボードの「案件別内訳」が使う。**行ごとに引かない**
 * （`getSummaries` と同じ理由——3クエリで何件でも済ませる）。
 */
export async function listCostCenterProjectSummaries(): Promise<CostCenterProjectSummary[]> {
  const projects = await queryAll(
    `SELECT p.id, p.gls_number, p.name, p.stage
       FROM projects p
       JOIN legal_entities le ON le.code = p.entity_code
      WHERE le.kind = 'cost_center' AND p.deleted_at IS NULL
      ORDER BY p.gls_number DESC NULLS LAST, p.created_at DESC`,
  ) as { id: string; gls_number: string | null; name: string; stage: string }[];
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);

  const [budgetRows, actualRows] = await Promise.all([
    queryAll(
      // `getProjectBudgetActual` と同じ注意（束の最新版を先に決めてから status を見る）。
      // ここは複数案件をまとめて集計するため `DISTINCT ON` を
      // `(project_id, group_id)` にする——`group_id` だけだと、万一別案件間で
      // 値が重なったときに束を取り違える
      `SELECT project_id, SUM(amount) AS total FROM (
         SELECT DISTINCT ON (e.project_id, e.group_id) e.project_id, e.status, (e.subtotal - e.discount) AS amount
           FROM estimates e
          WHERE e.project_id = ANY(?) AND e.deleted_at IS NULL
          ORDER BY e.project_id, e.group_id, e.version DESC
       ) latest
       WHERE latest.status = 'accepted'
       GROUP BY project_id`,
      [ids],
    ) as Promise<{ project_id: string; total: string }[]>,
    queryAll(
      `SELECT project_id, SUM(amount) AS total FROM purchases
        WHERE project_id = ANY(?) AND deleted_at IS NULL AND is_provisional IS NOT TRUE
        GROUP BY project_id`,
      [ids],
    ) as Promise<{ project_id: string; total: string }[]>,
  ]);
  const budgetByProject = new Map(budgetRows.map((r) => [r.project_id, num(r.total)]));
  const actualByProject = new Map(actualRows.map((r) => [r.project_id, num(r.total)]));

  return projects.map((p) => {
    const budget = budgetByProject.get(p.id) ?? 0;
    const actual = actualByProject.get(p.id) ?? 0;
    return { ...p, budget, actual, remaining: budget - actual };
  });
}

/**
 * コストセンター全体の月次コスト推移（確定した仕入を `recognition_date` の月で束ねる）。
 * コスト側ダッシュボードの「月次推移」が使う。
 */
export async function getCostCenterMonthlyTrend(): Promise<{ month: string; total: number }[]> {
  const rows = await queryAll(
    `SELECT LEFT(pu.recognition_date, 7) AS month, COALESCE(SUM(pu.amount), 0) AS total
       FROM purchases pu
       JOIN projects p ON p.id = pu.project_id
       JOIN legal_entities le ON le.code = p.entity_code
      WHERE le.kind = 'cost_center' AND pu.deleted_at IS NULL AND pu.is_provisional IS NOT TRUE
        AND pu.recognition_date IS NOT NULL AND pu.recognition_date != ''
      GROUP BY LEFT(pu.recognition_date, 7)
      ORDER BY month`,
  ) as { month: string; total: string }[];
  return rows.map((r) => ({ month: r.month, total: num(r.total) }));
}
