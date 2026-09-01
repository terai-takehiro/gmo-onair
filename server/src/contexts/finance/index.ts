import { Router } from 'express';
import { queryAll } from '../../shared/db/connection';
import revenuesRoutes from './routes/revenues.routes';
import purchasesRoutes from './routes/purchases.routes';
import sgaRoutes from './routes/sga.routes';
import vendorsRoutes from './routes/vendors.routes';
import partnersRoutes from './routes/partners.routes';
import xpointRoutes from './routes/xpoint.routes';
import moneyRulesRoutes from './routes/money-rules.routes';
import { createFinanceExcelRouter } from './routes/excel.routes';
import { getMonthlySummary } from './services/monthly-summary.service';
import { requireAuth, requirePermission } from '../../shared/middleware/auth';

export function createFinanceRoutes(): Router {
  const router = Router();

  // 月次損益サマリー (optional project_id 指定で案件別集計)。
  // 集計ロジックは monthly-summary.service.ts に集約 (MCP サーバーと共用)。
  router.get('/monthly-summary', requireAuth, requirePermission('sales'), async (req, res) => {
    const data = await getMonthlySummary({
      month: req.query.month as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      projectId: req.query.project_id as string | undefined,
      // 期間を絞らない集計。画面の「全期間」ボタンだけが `all=1` を付ける
      allPeriods: req.query.all === '1' || req.query.all === 'true',
    });
    res.json({ success: true, data });
  });

  /**
   * ダッシュボードの「案件で絞り込む」に出てこない案件があった問題への対応。
   *
   * `/projects?limit=500` は既定ソートの上位500件だけを返し、**ソフトデリート済みも
   * 除外する**。一方、ダッシュボードの「内訳」は `revenues`/`purchases` から
   * `LEFT JOIN projects` で読むだけなので、そちらの条件を一切持たない。
   * → 500件の外にある案件・削除済みだが実績が残る案件は、**内訳には出るのに
   * 絞り込みの選択肢には出ない**という食い違いが起きていた。
   *
   * ここは「実際にこの期間の売上・仕入を持っている案件」だけを、**件数の上限を
   * 付けずに**返す。内訳と同じ集合になるので、この一覧を足すと食い違いが消える。
   */
  router.get('/projects-with-activity', requireAuth, requirePermission('sales'), async (req, res) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const params: string[] = [];
    let dateFilter = '';
    if (from && to) {
      dateFilter = 'AND recognition_date BETWEEN $1 AND $2';
      params.push(from, to);
    }
    /*
     * ⚠️ **按分（`revenue_allocations`/`purchase_allocations`）も見る**（Codex の指摘 P1）。
     * `getMonthlySummary` と台帳の絞り込みは按分先の案件も見ているので、
     * 按分だけで参加している案件（`revenues.project_id` 自身は別の案件・グループの親行）は
     * ここに `revenues.project_id`/`purchases.project_id` だけを見ていると**また抜ける**。
     */
    const rows = await queryAll(
      `SELECT DISTINCT p.id, p.gls_number, p.name
         FROM projects p
        WHERE p.id IN (
          SELECT project_id FROM revenues WHERE project_id IS NOT NULL AND deleted_at IS NULL ${dateFilter}
          UNION
          SELECT project_id FROM purchases WHERE project_id IS NOT NULL AND deleted_at IS NULL ${dateFilter}
          UNION
          SELECT ra.project_id FROM revenue_allocations ra
            JOIN revenues r ON r.id = ra.revenue_id AND r.deleted_at IS NULL
            ${dateFilter ? 'AND r.recognition_date BETWEEN $1 AND $2' : ''}
          UNION
          SELECT pa.project_id FROM purchase_allocations pa
            JOIN purchases p2 ON p2.id = pa.purchase_id AND p2.deleted_at IS NULL
            ${dateFilter ? 'AND p2.recognition_date BETWEEN $1 AND $2' : ''}
        )
        ORDER BY p.gls_number DESC NULLS LAST, p.name`,
      params,
    );
    res.json({ success: true, data: rows });
  });

  router.use('/revenues', revenuesRoutes);
  router.use('/purchases', purchasesRoutes);
  router.use('/sga', sgaRoutes);
  router.use('/vendors', vendorsRoutes);
  router.use('/partners', partnersRoutes);
  router.use('/xpoint', xpointRoutes);
  router.use('/money-rules', moneyRulesRoutes);
  router.use(createFinanceExcelRouter()); // /revenues/excel/*, /purchases/excel/*, /sga-expenses/excel/*

  return router;
}
