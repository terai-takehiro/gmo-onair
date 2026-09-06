import { queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// 月次損益サマリーの集計ロジック。finance/index.ts のインラインハンドラ本体を抽出したもので、
// HTTP ルート (財務ダッシュボード) と MCP サーバーの両方から同じコードパスで呼ばれる。

// 固定原価プロジェクトのコード (決算インポートが GLS 無しの売上原価を集約する Pj。kessan-import.service の FIXED_CODE と一致)
const FIXED_COGS_CODE = 'FIXED-COGS';

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

export async function getMonthlySummary(params: MonthlySummaryParams): Promise<MonthlySummaryResult> {
  const { month, from: qFrom, to: qTo, projectId, allPeriods, entityCode } = params;

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
    const [revDirectRow, revAllocRow, purDirectRow, purAllocRow, fixedRow] = await Promise.all([
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
    ]);
    const revenue_total = Number(revDirectRow?.total ?? 0) + Number(revAllocRow?.total ?? 0);
    const purchase_total = Number(purDirectRow?.total ?? 0) + Number(purAllocRow?.total ?? 0);
    const fixed_cost_total = Number(fixedRow?.total ?? 0);
    const variable_cost_total = purchase_total - fixed_cost_total;
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
