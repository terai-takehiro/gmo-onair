import { queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { NOT_SANDBOX, NOT_SANDBOX_VIA } from '../../../shared/db/sandbox-filter';

// 月次損益サマリーの集計ロジック。finance/index.ts のインラインハンドラ本体を抽出したもので、
// HTTP ルート (財務ダッシュボード) と MCP サーバーの両方から同じコードパスで呼ばれる。

// 固定原価プロジェクトのコード (決算インポートが GLS 無しの売上原価を集約する Pj。kessan-import.service の FIXED_CODE と一致)
const FIXED_COGS_CODE = 'FIXED-COGS';

export interface MonthlySummaryParams {
  month?: string;     // YYYY-MM (単月)
  from?: string;      // YYYY-MM-DD (期間指定)
  to?: string;        // YYYY-MM-DD
  projectId?: string;
}

export interface MonthlySummaryResult {
  month: string;
  project_id?: string;
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
  const { month, from: qFrom, to: qTo, projectId } = params;

  // 期間を [from, to] (YYYY-MM-DD) に正規化。from/to 優先、無ければ month の単月。
  let from = '', to = '';
  if (qFrom && qTo && /^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo)) {
    from = qFrom; to = qTo;
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    from = `${month}-01`; to = `${month}-31`; // recognition_date は TEXT(YYYY-MM-DD) なので文字列比較で月末を包含
  } else {
    throw new AppError(400, 'VALIDATION_ERROR', 'month (YYYY-MM) もしくは from/to (YYYY-MM-DD) が必要です');
  }
  const periodLabel = month && /^\d{4}-\d{2}$/.test(month) ? month : `${from}〜${to}`;

  // 案件絞り込み時: 直接売上/仕入 + group_id による按分配分両方を集計
  // 販管費は案件紐付かないので project_id 指定時は除外 (0)
  if (projectId) {
    const [revDirectRow, revAllocRow, purDirectRow, purAllocRow, fixedRow] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues
         WHERE deleted_at IS NULL AND status = 'confirmed' AND group_id IS NULL
         AND project_id = ? AND recognition_date >= ? AND recognition_date <= ?`,
        [projectId, from, to]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(ra.allocated_amount), 0) AS total FROM revenue_allocations ra
         JOIN revenues r ON r.id = ra.revenue_id AND r.deleted_at IS NULL AND r.status = 'confirmed'
         WHERE ra.project_id = ? AND r.recognition_date >= ? AND r.recognition_date <= ?`,
        [projectId, from, to]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases
         WHERE deleted_at IS NULL AND group_id IS NULL
         AND project_id = ? AND recognition_date >= ? AND recognition_date <= ?`,
        [projectId, from, to]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(pa.allocated_amount), 0) AS total FROM purchase_allocations pa
         JOIN purchases p ON p.id = pa.purchase_id AND p.deleted_at IS NULL
         WHERE pa.project_id = ? AND p.recognition_date >= ? AND p.recognition_date <= ?`,
        [projectId, from, to]
      ) as Promise<any>,
      // 固定原価 = この案件が固定原価Pj (code=FIXED-COGS) の場合の仕入
      queryOne(
        `SELECT COALESCE(SUM(pu.amount), 0) AS total FROM purchases pu
         JOIN projects p ON p.id = pu.project_id
         WHERE pu.deleted_at IS NULL AND pu.group_id IS NULL
         AND pu.project_id = ? AND pu.recognition_date >= ? AND pu.recognition_date <= ? AND p.code = ?`,
        [projectId, from, to, FIXED_COGS_CODE]
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
    return { month: periodLabel, project_id: projectId, revenue_total, purchase_total, fixed_cost_total, variable_cost_total, marginal_profit, gross_profit, sga_total, operating_profit };
  }

  // 案件絞り込みなし: 全体集計
  const [revRow, purRow, sgaRow, fixedRow] = await Promise.all([
    queryOne(
      // 25章: お試し (練習) の案件はここに入れない。案件を持たない行は落とさない
      `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues r
        WHERE r.deleted_at IS NULL AND r.status = 'confirmed' AND r.group_id IS NULL
          AND r.recognition_date >= ? AND r.recognition_date <= ?
          AND ${NOT_SANDBOX_VIA('r')}`,
      [from, to]
    ) as Promise<any>,
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases pu
        WHERE pu.deleted_at IS NULL AND pu.group_id IS NULL
          AND pu.recognition_date >= ? AND pu.recognition_date <= ?
          AND ${NOT_SANDBOX_VIA('pu')}`,
      [from, to]
    ) as Promise<any>,
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM sga_expenses WHERE deleted_at IS NULL AND recognition_date >= ? AND recognition_date <= ?`,
      [from, to]
    ) as Promise<any>,
    // 固定原価 = 固定原価Pj (code=FIXED-COGS) に計上された仕入
    queryOne(
      `SELECT COALESCE(SUM(pu.amount), 0) AS total FROM purchases pu
       JOIN projects p ON p.id = pu.project_id
       WHERE pu.deleted_at IS NULL AND pu.group_id IS NULL AND pu.recognition_date >= ? AND pu.recognition_date <= ?
         AND p.code = ? AND ${NOT_SANDBOX('p')}`,
      [from, to, FIXED_COGS_CODE]
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
  return { month: periodLabel, revenue_total, purchase_total, fixed_cost_total, variable_cost_total, marginal_profit, gross_profit, sga_total, operating_profit };
}
