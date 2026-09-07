import { queryOne, queryAll } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { getStageProbabilityMap } from '../../sales/services/stage-probability.service';
import type { ProjectStage } from '../../../shared/constants/statuses';

// 月次損益サマリーの集計ロジック。finance/index.ts のインラインハンドラ本体を抽出したもので、
// HTTP ルート (財務ダッシュボード) と MCP サーバーの両方から同じコードパスで呼ばれる。

// 固定原価プロジェクトのコード (決算インポートが GLS 無しの売上原価を集約する Pj。kessan-import.service の FIXED_CODE と一致)
const FIXED_COGS_CODE = 'FIXED-COGS';

export type SummaryMode = 'total' | 'weighted';

export interface MonthlySummaryParams {
  month?: string;     // YYYY-MM (単月)
  from?: string;      // YYYY-MM-DD (期間指定)
  to?: string;        // YYYY-MM-DD
  projectId?: string;
  /**
   * 期間で絞らずに全期間を集計する。
   *
   * ⚠️ **呼び出し側が明示したときだけ効く。** 「日付が壊れていたら全期間にする」形には
   * **しない** — 画面が `-01` のような壊れた日付を送っていた不具合（財務ダッシュボードで
   * 月を空にすると 400 になっていた件）が、黙って「全社・全期間の集計」に化けてしまい、
   * 桁の違う数字が正しい値のように出るため。壊れた日付はこれまでどおり 400 で弾く。
   */
  allPeriods?: boolean;
  /**
   * 会社（`entity_code`）で絞る（2026年10月の事業再編・財務の2社タブ・P2 Round 1）。
   * **省略時は絞らない**＝今までどおり全社合算（後方互換）。
   */
  entityCode?: string;
  /**
   * 集計方法（2026-09 依頼「営業見通しの確度加味を画面全体に広げる」）。
   *
   * 'weighted' のときは、売上・仕入（変動原価）を、その行が計上されている
   * **案件のいまのフェーズの受注確度（%）**で重みづけて合算する。
   * ⚠️ **あくまでシミュレーション** — 実額（`revenues`/`purchases` の値そのもの）は
   * 変えない。固定原価・販管費は案件のフェーズを持たない（＝重みづけようがない）ので、
   * どちらのモードでも実額のまま。省略時は 'total'（従来どおり実額を100%で合算）。
   *
   * 旧 `pipeline-forecast.service.ts`（営業見通しカード専用の別集計）が持っていた
   * 「stage 別に SUM してから確度を掛ける」考え方をここへ合流させた
   * （カード自体は廃止・確度%の正本体は引き続き `stage-probability.service.ts`）。
   */
  mode?: SummaryMode;
}

export interface MonthlySummaryResult {
  month: string;
  project_id?: string;
  entity_code?: string;
  revenue_total: number;
  purchase_total: number;
  fixed_cost_total: number;
  variable_cost_total: number;
  marginal_profit: number;
  gross_profit: number;
  sga_total: number;
  operating_profit: number;
}

/**
 * `[{stage, total}]` を確度で重みづけて合算する。**stage が無い/知らない行は
 * 確度100%として数える**（案件に紐づかない・按分グループ経由などで案件個別の
 * フェーズが引けない行を、確度不明を理由に一律ゼロにしないため）。
 */
function weightedSum(
  rows: { stage: string | null; total: string | number }[],
  probabilityMap: Map<ProjectStage, number>,
): number {
  let sum = 0;
  for (const r of rows) {
    const prob = r.stage && probabilityMap.has(r.stage as ProjectStage)
      ? probabilityMap.get(r.stage as ProjectStage)!
      : 100;
    sum += Number(r.total) * (prob / 100);
  }
  return Math.round(sum);
}

export async function getMonthlySummary(params: MonthlySummaryParams): Promise<MonthlySummaryResult> {
  const { month, from: qFrom, to: qTo, projectId, allPeriods, entityCode, mode = 'total' } = params;

  // 期間を [from, to] (YYYY-MM-DD) に正規化。全期間 > from/to > month の単月の順に見る。
  let from = '', to = '';
  if (!allPeriods) {
    if (qFrom && qTo && /^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo)) {
      from = qFrom; to = qTo;
    } else if (month && /^\d{4}-\d{2}$/.test(month)) {
      from = `${month}-01`; to = `${month}-31`; // recognition_date は TEXT(YYYY-MM-DD) なので文字列比較で月末を包含
    } else {
      throw new AppError(400, 'VALIDATION_ERROR', 'month (YYYY-MM) もしくは from/to (YYYY-MM-DD) が必要です');
    }
  }
  const periodLabel = allPeriods
    ? '全期間'
    : month && /^\d{4}-\d{2}$/.test(month) ? month : `${from}〜${to}`;

  /*
   * 全期間のときは**期間の条件そのものを付けない**。
   * `recognition_date >= '' AND <= ''` のような「常に真」の条件で代用しないのは、
   * `recognition_date` が空の行（計上月をまだ決めていない行）を落としてしまうため。
   * 台帳の一覧 (`list-query.ts`) も「期間を空にしたら条件を付けない」で揃えてある。
   *
   * ⚠️ **日付の条件は必ず各クエリの末尾**に置くこと。`?` は出現順に $1..$n へ
   * 置き換わるので、後ろに別の `?` を足すと引数がずれる。
   */
  const dateWhere = (col: string) => (allPeriods ? '' : ` AND ${col} >= ? AND ${col} <= ?`);
  const dateArgs: string[] = allPeriods ? [] : [from, to];
  // 会社で絞る条件も同じ理由で**必ずクエリの末尾**（日付条件のさらに後ろ）に置く
  const entityWhere = (col: string) => (entityCode ? ` AND ${col} = ?` : '');
  const entityArgs: string[] = entityCode ? [entityCode] : [];

  // 案件絞り込み時: 直接売上/仕入 + group_id による按分配分両方を集計
  // 販管費は案件紐付かないので project_id 指定時は除外 (0)
  if (projectId) {
    const [revDirectRow, revAllocRow, purDirectRow, purAllocRow, fixedRow, projectRow] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues
         WHERE deleted_at IS NULL AND status = 'confirmed' AND group_id IS NULL
         AND project_id = ?${dateWhere('recognition_date')}${entityWhere('entity_code')}`,
        [projectId, ...dateArgs, ...entityArgs]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(ra.allocated_amount), 0) AS total FROM revenue_allocations ra
         JOIN revenues r ON r.id = ra.revenue_id AND r.deleted_at IS NULL AND r.status = 'confirmed'
         WHERE ra.project_id = ?${dateWhere('r.recognition_date')}${entityWhere('r.entity_code')}`,
        [projectId, ...dateArgs, ...entityArgs]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases
         WHERE deleted_at IS NULL AND group_id IS NULL
         AND project_id = ?${dateWhere('recognition_date')}${entityWhere('entity_code')}`,
        [projectId, ...dateArgs, ...entityArgs]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(pa.allocated_amount), 0) AS total FROM purchase_allocations pa
         JOIN purchases p ON p.id = pa.purchase_id AND p.deleted_at IS NULL
         WHERE pa.project_id = ?${dateWhere('p.recognition_date')}${entityWhere('p.entity_code')}`,
        [projectId, ...dateArgs, ...entityArgs]
      ) as Promise<any>,
      // 固定原価 = この案件が固定原価Pj (code=FIXED-COGS) の場合の仕入
      queryOne(
        `SELECT COALESCE(SUM(pu.amount), 0) AS total FROM purchases pu
         JOIN projects p ON p.id = pu.project_id
         WHERE pu.deleted_at IS NULL AND pu.group_id IS NULL
         AND pu.project_id = ? AND p.code = ?${dateWhere('pu.recognition_date')}${entityWhere('pu.entity_code')}`,
        [projectId, FIXED_COGS_CODE, ...dateArgs, ...entityArgs]
      ) as Promise<any>,
      // 確度加味のときだけ要る（この案件いまのフェーズ）
      mode === 'weighted'
        ? (queryOne(`SELECT stage FROM projects WHERE id = ?`, [projectId]) as Promise<any>)
        : Promise.resolve(null),
    ]);
    let revenue_total = Number(revDirectRow?.total ?? 0) + Number(revAllocRow?.total ?? 0);
    const fixed_cost_total = Number(fixedRow?.total ?? 0);
    let variable_cost_total = (Number(purDirectRow?.total ?? 0) + Number(purAllocRow?.total ?? 0)) - fixed_cost_total;
    let purchase_total = variable_cost_total + fixed_cost_total;
    if (mode === 'weighted') {
      // **この案件1つぶんの確度**を売上・仕入（変動原価）に一律で掛ける。固定原価は対象外
      const probabilityMap = await getStageProbabilityMap();
      const stage = projectRow?.stage as ProjectStage | undefined;
      const prob = stage && probabilityMap.has(stage) ? probabilityMap.get(stage)! : 100;
      revenue_total = Math.round(revenue_total * (prob / 100));
      variable_cost_total = Math.round(variable_cost_total * (prob / 100));
      purchase_total = variable_cost_total + fixed_cost_total;
    }
    const sga_total = 0; // 販管費は案件紐付けないため案件絞り込み時はゼロ
    const marginal_profit = revenue_total - variable_cost_total; // 限界利益 = 売上 − 変動原価
    const gross_profit = marginal_profit - fixed_cost_total;      // 売上総利益 = 限界利益 − 固定原価
    const operating_profit = gross_profit - sga_total;            // 営業利益 = 売上総利益 − 販管費
    return { month: periodLabel, project_id: projectId, entity_code: entityCode, revenue_total, purchase_total, fixed_cost_total, variable_cost_total, marginal_profit, gross_profit, sga_total, operating_profit };
  }

  // 案件絞り込みなし: 全体集計
  // ⚠️ **按分（グループ請求）も1行なので `group_id` で絞らない。** `revenues`/`purchases` に
  // 子行はなく、内訳は別表（revenue_allocations / purchase_allocations）にある（migration 006・
  // billing.routes.ts 冒頭と同じ理由）。絞ると全社集計からグループ請求の金額が丸ごと消える。
  // 上の案件別ブランチは按分を allocation 側から足すので、あちらは `group_id IS NULL` のまま。

  if (mode === 'weighted') {
    /*
     * 確度加味: 売上・仕入（変動原価。固定原価Pjは除く）を**案件のフェーズ別に SUM**
     * してから確度を掛けて合算する（1行ずつ掛けるのと数学的に同じだが、行数分の
     * 掛け算をせずに済む）。固定原価・販管費は案件のフェーズを持たないため、
     * 総額モードと同じ実額のまま合流させる（旧 `pipeline-forecast.service.ts` と同じ判断）。
     */
    const [revRows, purRows, sgaRow, fixedRow, probabilityMap] = await Promise.all([
      queryAll(
        `SELECT p.stage AS stage, COALESCE(SUM(r.amount), 0) AS total
           FROM revenues r LEFT JOIN projects p ON p.id = r.project_id
          WHERE r.deleted_at IS NULL AND r.status = 'confirmed'${dateWhere('r.recognition_date')}${entityWhere('r.entity_code')}
          GROUP BY p.stage`,
        [...dateArgs, ...entityArgs],
      ) as Promise<{ stage: string | null; total: string | number }[]>,
      queryAll(
        `SELECT p.stage AS stage, COALESCE(SUM(pu.amount), 0) AS total
           FROM purchases pu LEFT JOIN projects p ON p.id = pu.project_id
          WHERE pu.deleted_at IS NULL AND (p.code IS DISTINCT FROM ? OR p.code IS NULL)
            ${dateWhere('pu.recognition_date')}${entityWhere('pu.entity_code')}
          GROUP BY p.stage`,
        [FIXED_COGS_CODE, ...dateArgs, ...entityArgs],
      ) as Promise<{ stage: string | null; total: string | number }[]>,
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM sga_expenses WHERE deleted_at IS NULL${dateWhere('recognition_date')}${entityWhere('entity_code')}`,
        [...dateArgs, ...entityArgs]
      ) as Promise<any>,
      // 固定原価 = 固定原価Pj (code=FIXED-COGS) に計上された仕入。確度は掛けない
      queryOne(
        `SELECT COALESCE(SUM(pu.amount), 0) AS total FROM purchases pu
         JOIN projects p ON p.id = pu.project_id
         WHERE pu.deleted_at IS NULL AND pu.group_id IS NULL AND p.code = ?${dateWhere('pu.recognition_date')}${entityWhere('pu.entity_code')}`,
        [FIXED_COGS_CODE, ...dateArgs, ...entityArgs]
      ) as Promise<any>,
      getStageProbabilityMap(),
    ]);
    const revenue_total = weightedSum(revRows, probabilityMap);
    const variable_cost_total = weightedSum(purRows, probabilityMap);
    const sga_total = Number((sgaRow as any)?.total ?? 0);
    const fixed_cost_total = Number((fixedRow as any)?.total ?? 0);
    const purchase_total = variable_cost_total + fixed_cost_total;
    const marginal_profit = revenue_total - variable_cost_total;
    const gross_profit = marginal_profit - fixed_cost_total;
    const operating_profit = gross_profit - sga_total;
    return { month: periodLabel, entity_code: entityCode, revenue_total, purchase_total, fixed_cost_total, variable_cost_total, marginal_profit, gross_profit, sga_total, operating_profit };
  }

  const [revRow, purRow, sgaRow, fixedRow] = await Promise.all([
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues WHERE deleted_at IS NULL AND status = 'confirmed'${dateWhere('recognition_date')}${entityWhere('entity_code')}`,
      [...dateArgs, ...entityArgs]
    ) as Promise<any>,
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases WHERE deleted_at IS NULL${dateWhere('recognition_date')}${entityWhere('entity_code')}`,
      [...dateArgs, ...entityArgs]
    ) as Promise<any>,
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM sga_expenses WHERE deleted_at IS NULL${dateWhere('recognition_date')}${entityWhere('entity_code')}`,
      [...dateArgs, ...entityArgs]
    ) as Promise<any>,
    // 固定原価 = 固定原価Pj (code=FIXED-COGS) に計上された仕入
    queryOne(
      `SELECT COALESCE(SUM(pu.amount), 0) AS total FROM purchases pu
       JOIN projects p ON p.id = pu.project_id
       WHERE pu.deleted_at IS NULL AND pu.group_id IS NULL AND p.code = ?${dateWhere('pu.recognition_date')}${entityWhere('pu.entity_code')}`,
      [FIXED_COGS_CODE, ...dateArgs, ...entityArgs]
    ) as Promise<any>,
  ]);
  const revenue_total = Number((revRow as any)?.total ?? 0);
  const purchase_total = Number((purRow as any)?.total ?? 0);
  const sga_total = Number((sgaRow as any)?.total ?? 0);
  const fixed_cost_total = Number((fixedRow as any)?.total ?? 0);
  const variable_cost_total = purchase_total - fixed_cost_total;
  const marginal_profit = revenue_total - variable_cost_total; // 限界利益 = 売上 − 変動原価
  const gross_profit = marginal_profit - fixed_cost_total;      // 売上総利益 = 限界利益 − 固定原価
  const operating_profit = gross_profit - sga_total;            // 営業利益 = 売上総利益 − 販管費
  return { month: periodLabel, entity_code: entityCode, revenue_total, purchase_total, fixed_cost_total, variable_cost_total, marginal_profit, gross_profit, sga_total, operating_profit };
}
