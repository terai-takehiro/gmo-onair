import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';

export class SalesAnalyticsService {
  /** ファネル分析: 各ステージのコンバージョン率と滞留日数 */
  async getFunnelAnalysis(year?: number, month?: number) {
    let dateFilter = '';
    const params: unknown[] = [];
    if (year && month) {
      dateFilter = `AND TO_CHAR(p.created_at, 'YYYY') = ? AND TO_CHAR(p.created_at, 'MM') = ?`;
      params.push(String(year), String(month).padStart(2, '0'));
    } else if (year) {
      dateFilter = `AND TO_CHAR(p.created_at, 'YYYY') = ?`;
      params.push(String(year));
    }

    const stageCounts = await queryAll(
      `SELECT stage, COUNT(*) as count, COALESCE(SUM(expected_amount), 0) as total_amount
       FROM projects p
       WHERE p.deleted_at IS NULL ${dateFilter}
       GROUP BY stage`,
      params
    );

    const totalRow = await queryOne(
      `SELECT COUNT(*) as total FROM projects p WHERE p.deleted_at IS NULL ${dateFilter}`,
      params
    );
    const totalCount = (totalRow as any)?.total || 0;

    const wonRow = await queryOne(
      `SELECT COUNT(*) as won FROM projects p
       WHERE p.deleted_at IS NULL AND p.stage IN ('a_won', 's_completed', 'b_verbal') ${dateFilter}`,
      params
    );
    const wonCount = (wonRow as any)?.won || 0;

    const lostRow = await queryOne(
      `SELECT COUNT(*) as lost FROM projects p
       WHERE p.deleted_at IS NULL AND p.stage = 'e_lost' ${dateFilter}`,
      params
    );
    const lostCount = (lostRow as any)?.lost || 0;

    const avgDwellRow = await queryOne(
      `SELECT AVG(EXTRACT(EPOCH FROM (p.updated_at::timestamp - p.created_at::timestamp)) / 86400) as avg_days
       FROM projects p
       WHERE p.deleted_at IS NULL AND p.stage NOT IN ('neta') ${dateFilter}`,
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
  async getLostReasonAnalysis(year?: number) {
    let dateFilter = '';
    const params: unknown[] = [];
    if (year) {
      dateFilter = `AND TO_CHAR(p.created_at, 'YYYY') = ?`;
      params.push(String(year));
    }

    const reasons = await queryAll(
      `SELECT COALESCE(p.lost_reason, '未設定') as reason, COUNT(*) as count, COALESCE(SUM(p.expected_amount), 0) as total_amount
       FROM projects p
       WHERE p.deleted_at IS NULL AND p.stage = 'e_lost' ${dateFilter}
       GROUP BY p.lost_reason
       ORDER BY count DESC`,
      params
    );

    const totalLost = await queryOne(
      `SELECT COUNT(*) as c FROM projects p WHERE p.deleted_at IS NULL AND p.stage = 'e_lost' ${dateFilter}`,
      params
    );

    return {
      reasons,
      total_lost: (totalLost as any)?.c || 0,
    };
  }

  /** 営業目標の取得 */
  async getTargets(year: number, userId?: string) {
    let where = 'WHERE t.target_year = ?';
    const params: unknown[] = [year];
    if (userId) { where += ' AND t.user_id = ?'; params.push(userId); }

    return await queryAll(
      `SELECT t.*, u.name as user_name
       FROM sales_targets t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.target_month, u.name`,
      params
    );
  }

  /** 営業目標の設定（upsert） */
  async upsertTarget(userId: string, year: number, month: number, targetAmount: number) {
    const existing = await queryOne(
      'SELECT id FROM sales_targets WHERE user_id = ? AND target_year = ? AND target_month = ?',
      [userId, year, month]
    );

    if (existing) {
      await execute(
        `UPDATE sales_targets SET target_amount=?, updated_at=NOW() WHERE id=?`,
        [targetAmount, (existing as any).id]
      );
      return await queryOne('SELECT * FROM sales_targets WHERE id = ?', [(existing as any).id]);
    } else {
      const id = uuidv4();
      await execute(
        `INSERT INTO sales_targets (id, user_id, target_year, target_month, target_amount) VALUES (?, ?, ?, ?, ?)`,
        [id, userId, year, month, targetAmount]
      );
      return await queryOne('SELECT * FROM sales_targets WHERE id = ?', [id]);
    }
  }

  /** 営業評価: 担当者別の目標 vs 実績 */
  async getPerformanceReview(year: number, month?: number) {
    let wonFilter = `AND TO_CHAR(p.updated_at, 'YYYY') = ?`;
    const wonParams: unknown[] = [String(year)];
    if (month) {
      wonFilter += ` AND TO_CHAR(p.updated_at, 'MM') = ?`;
      wonParams.push(String(month).padStart(2, '0'));
    }

    const actuals = await queryAll(
      `SELECT p.assigned_to, u.name as user_name,
              COUNT(*) as won_count,
              COALESCE(SUM(p.expected_amount), 0) as won_amount
       FROM projects p
       LEFT JOIN users u ON u.id = p.assigned_to
       WHERE p.deleted_at IS NULL AND p.stage IN ('a_won', 'b_verbal', 's_completed') ${wonFilter}
       GROUP BY p.assigned_to`,
      wonParams
    );

    let allFilter = `AND TO_CHAR(p.created_at, 'YYYY') = ?`;
    const allParams: unknown[] = [String(year)];
    if (month) {
      allFilter += ` AND TO_CHAR(p.created_at, 'MM') = ?`;
      allParams.push(String(month).padStart(2, '0'));
    }

    const activities = await queryAll(
      `SELECT p.assigned_to,
              COUNT(*) as total_count,
              COUNT(CASE WHEN p.stage = 'e_lost' THEN 1 END) as lost_count,
              COALESCE(AVG(p.expected_amount), 0) as avg_deal_size
       FROM projects p
       WHERE p.deleted_at IS NULL ${allFilter}
       GROUP BY p.assigned_to`,
      allParams
    );

    let targetFilter = 'WHERE t.target_year = ?';
    const targetParams: unknown[] = [year];
    if (month) {
      targetFilter += ' AND t.target_month = ?';
      targetParams.push(month);
    }

    const targets = await queryAll(
      `SELECT t.user_id, u.name as user_name,
              SUM(t.target_amount) as target_amount
       FROM sales_targets t
       LEFT JOIN users u ON u.id = t.user_id
       ${targetFilter}
       GROUP BY t.user_id`,
      targetParams
    );

    const userMap = new Map<string, Record<string, unknown>>();
    for (const t of targets) {
      userMap.set(t.user_id as string, {
        user_id: t.user_id, user_name: t.user_name,
        target_amount: t.target_amount || 0, won_amount: 0, won_count: 0,
        total_count: 0, lost_count: 0, avg_deal_size: 0, achievement_rate: 0,
      });
    }
    for (const a of actuals) {
      const existing = userMap.get(a.assigned_to as string) || {
        user_id: a.assigned_to, user_name: a.user_name, target_amount: 0,
        total_count: 0, lost_count: 0, avg_deal_size: 0,
      };
      existing.won_amount = a.won_amount;
      existing.won_count = a.won_count;
      userMap.set(a.assigned_to as string, existing);
    }
    for (const act of activities) {
      const existing = userMap.get(act.assigned_to as string);
      if (existing) {
        existing.total_count = act.total_count;
        existing.lost_count = act.lost_count;
        existing.avg_deal_size = Math.round((act.avg_deal_size as number) || 0);
      }
    }

    return Array.from(userMap.values()).map(u => ({
      ...u,
      achievement_rate: (u.target_amount as number) > 0
        ? Math.round(((u.won_amount as number) / (u.target_amount as number)) * 1000) / 10 : 0,
      win_rate: (u.total_count as number) > 0
        ? Math.round(((u.won_count as number) / (u.total_count as number)) * 1000) / 10 : 0,
    })).sort((a, b) => (b.achievement_rate as number) - (a.achievement_rate as number));
  }
}

export const salesAnalyticsService = new SalesAnalyticsService();
