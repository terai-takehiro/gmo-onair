import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export class SalesAnalyticsService {
  /** ファネル分析: 各ステージのコンバージョン率と滞留日数 */
  getFunnelAnalysis(year?: number, month?: number) {
    let dateFilter = '';
    const params: unknown[] = [];
    if (year && month) {
      dateFilter = `AND strftime('%Y', o.created_at) = ? AND strftime('%m', o.created_at) = ?`;
      params.push(String(year), String(month).padStart(2, '0'));
    } else if (year) {
      dateFilter = `AND strftime('%Y', o.created_at) = ?`;
      params.push(String(year));
    }

    // 各ステージの件数
    const stageCounts = queryAll(
      `SELECT stage, COUNT(*) as count, COALESCE(SUM(expected_amount), 0) as total_amount
       FROM opportunities o
       WHERE o.deleted_at IS NULL ${dateFilter}
       GROUP BY stage`,
      params
    );

    // 全ヨミ数
    const totalRow = queryOne(
      `SELECT COUNT(*) as total FROM opportunities o WHERE o.deleted_at IS NULL ${dateFilter}`,
      params
    );
    const totalCount = (totalRow as any)?.total || 0;

    // 受注率 (a_won + s_completed) / 全体
    const wonRow = queryOne(
      `SELECT COUNT(*) as won FROM opportunities o
       WHERE o.deleted_at IS NULL AND o.stage IN ('a_won', 's_completed', 'b_verbal') ${dateFilter}`,
      params
    );
    const wonCount = (wonRow as any)?.won || 0;

    // 失注率
    const lostRow = queryOne(
      `SELECT COUNT(*) as lost FROM opportunities o
       WHERE o.deleted_at IS NULL AND o.stage = 'e_lost' ${dateFilter}`,
      params
    );
    const lostCount = (lostRow as any)?.lost || 0;

    // 平均滞留日数（作成から最終更新まで）
    const avgDwellRow = queryOne(
      `SELECT AVG(julianday(o.updated_at) - julianday(o.created_at)) as avg_days
       FROM opportunities o
       WHERE o.deleted_at IS NULL AND o.stage NOT IN ('neta') ${dateFilter}`,
      params
    );

    return {
      stage_counts: stageCounts,
      total_count: totalCount,
      won_count: wonCount,
      lost_count: lostCount,
      win_rate: totalCount > 0 ? Math.round((wonCount / totalCount) * 1000) / 10 : 0,
      loss_rate: totalCount > 0 ? Math.round((lostCount / totalCount) * 1000) / 10 : 0,
      avg_dwell_days: Math.round(((avgDwellRow as any)?.avg_days || 0) * 10) / 10,
    };
  }

  /** 失注理由の集計 */
  getLostReasonAnalysis(year?: number, month?: number) {
    let dateFilter = '';
    const params: unknown[] = [];
    if (year) {
      dateFilter = `AND strftime('%Y', o.created_at) = ?`;
      params.push(String(year));
    }

    const reasons = queryAll(
      `SELECT lr.name as reason, COUNT(*) as count, COALESCE(SUM(o.expected_amount), 0) as total_amount
       FROM opportunities o
       LEFT JOIN lost_reasons lr ON lr.id = o.lost_reason_id
       WHERE o.deleted_at IS NULL AND o.stage = 'e_lost' ${dateFilter}
       GROUP BY o.lost_reason_id
       ORDER BY count DESC`,
      params
    );

    const totalLost = queryOne(
      `SELECT COUNT(*) as c FROM opportunities o WHERE o.deleted_at IS NULL AND o.stage = 'e_lost' ${dateFilter}`,
      params
    );

    return {
      reasons,
      total_lost: (totalLost as any)?.c || 0,
    };
  }

  /** 営業目標の取得 */
  getTargets(year: number, userId?: string) {
    let where = 'WHERE t.deleted_at IS NULL AND t.fiscal_year = ?';
    const params: unknown[] = [year];
    if (userId) { where += ' AND t.user_id = ?'; params.push(userId); }

    return queryAll(
      `SELECT t.*, u.name as user_name
       FROM sales_targets t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.fiscal_month, u.name`,
      params
    );
  }

  /** 営業目標の設定（upsert） */
  upsertTarget(userId: string, year: number, month: number, targetAmount: number, targetCount?: number) {
    const existing = queryOne(
      'SELECT id FROM sales_targets WHERE user_id = ? AND fiscal_year = ? AND fiscal_month = ? AND deleted_at IS NULL',
      [userId, year, month]
    );

    if (existing) {
      execute(
        `UPDATE sales_targets SET target_amount=?, target_count=?, updated_at=datetime('now') WHERE id=?`,
        [targetAmount, targetCount || null, (existing as any).id]
      );
      return queryOne('SELECT * FROM sales_targets WHERE id = ?', [(existing as any).id]);
    } else {
      const id = uuidv4();
      execute(
        `INSERT INTO sales_targets (id, user_id, fiscal_year, fiscal_month, target_amount, target_count) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, year, month, targetAmount, targetCount || null]
      );
      return queryOne('SELECT * FROM sales_targets WHERE id = ?', [id]);
    }
  }

  /** 営業評価: 担当者別の目標 vs 実績 */
  getPerformanceReview(year: number, month?: number) {
    // 担当者別の受注実績
    let wonFilter = `AND strftime('%Y', o.updated_at) = ?`;
    const wonParams: unknown[] = [String(year)];
    if (month) {
      wonFilter += ` AND strftime('%m', o.updated_at) = ?`;
      wonParams.push(String(month).padStart(2, '0'));
    }

    const actuals = queryAll(
      `SELECT o.assigned_to, u.name as user_name,
              COUNT(*) as won_count,
              COALESCE(SUM(o.expected_amount), 0) as won_amount
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.assigned_to
       WHERE o.deleted_at IS NULL AND o.stage IN ('a_won', 'b_verbal', 's_completed') ${wonFilter}
       GROUP BY o.assigned_to`,
      wonParams
    );

    // 担当者別の全ヨミ数（活動量）
    let allFilter = `AND strftime('%Y', o.created_at) = ?`;
    const allParams: unknown[] = [String(year)];
    if (month) {
      allFilter += ` AND strftime('%m', o.created_at) = ?`;
      allParams.push(String(month).padStart(2, '0'));
    }

    const activities = queryAll(
      `SELECT o.assigned_to,
              COUNT(*) as total_opportunities,
              COUNT(CASE WHEN o.stage = 'e_lost' THEN 1 END) as lost_count,
              COALESCE(AVG(o.expected_amount), 0) as avg_deal_size
       FROM opportunities o
       WHERE o.deleted_at IS NULL ${allFilter}
       GROUP BY o.assigned_to`,
      allParams
    );

    // 目標データ
    let targetFilter = 'WHERE t.deleted_at IS NULL AND t.fiscal_year = ?';
    const targetParams: unknown[] = [year];
    if (month) {
      targetFilter += ' AND t.fiscal_month = ?';
      targetParams.push(month);
    }

    const targets = queryAll(
      `SELECT t.user_id, u.name as user_name,
              SUM(t.target_amount) as target_amount,
              SUM(t.target_count) as target_count
       FROM sales_targets t
       LEFT JOIN users u ON u.id = t.user_id
       ${targetFilter}
       GROUP BY t.user_id`,
      targetParams
    );

    // マージ
    const userMap = new Map<string, Record<string, unknown>>();
    for (const t of targets) {
      userMap.set(t.user_id as string, {
        user_id: t.user_id,
        user_name: t.user_name,
        target_amount: t.target_amount || 0,
        target_count: t.target_count || 0,
        won_amount: 0,
        won_count: 0,
        total_opportunities: 0,
        lost_count: 0,
        avg_deal_size: 0,
        achievement_rate: 0,
      });
    }
    for (const a of actuals) {
      const existing = userMap.get(a.assigned_to as string) || {
        user_id: a.assigned_to,
        user_name: a.user_name,
        target_amount: 0,
        target_count: 0,
        total_opportunities: 0,
        lost_count: 0,
        avg_deal_size: 0,
      };
      existing.won_amount = a.won_amount;
      existing.won_count = a.won_count;
      userMap.set(a.assigned_to as string, existing);
    }
    for (const act of activities) {
      const existing = userMap.get(act.assigned_to as string);
      if (existing) {
        existing.total_opportunities = act.total_opportunities;
        existing.lost_count = act.lost_count;
        existing.avg_deal_size = Math.round((act.avg_deal_size as number) || 0);
      }
    }

    // 達成率を計算
    const result = Array.from(userMap.values()).map(u => ({
      ...u,
      achievement_rate: (u.target_amount as number) > 0
        ? Math.round(((u.won_amount as number) / (u.target_amount as number)) * 1000) / 10
        : 0,
      win_rate: (u.total_opportunities as number) > 0
        ? Math.round(((u.won_count as number) / (u.total_opportunities as number)) * 1000) / 10
        : 0,
    }));

    return result.sort((a, b) => (b.achievement_rate as number) - (a.achievement_rate as number));
  }

  /** 失注理由マスタ一覧 */
  getLostReasons() {
    return queryAll('SELECT * FROM lost_reasons WHERE deleted_at IS NULL ORDER BY sort_order');
  }
}

export const salesAnalyticsService = new SalesAnalyticsService();
