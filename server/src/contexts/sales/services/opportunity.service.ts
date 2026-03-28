import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateSequenceNumber, generateGlsNumber, generateEpisodeCode } from '../../../shared/services/sequence.service';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface OpportunityFilter {
  search?: string;
  stage?: string;
  assignedTo?: string;
}

export interface ConfirmOrderInput {
  broadcastType?: string;
  mediaPlatform?: string;
  initialEpisodeCount?: number;
}

export interface ConfirmOrderResult {
  opportunity: Record<string, unknown>;
  project: Record<string, unknown> | null;
  episodes: Record<string, unknown>[];
  episodeOrder: Record<string, unknown> | null;
}

export class OpportunityService {
  list(filter: OpportunityFilter, page: number, limit: number, offset: number) {
    let where = 'WHERE o.deleted_at IS NULL';
    const params: unknown[] = [];
    if (filter.search) {
      where += ` AND (o.title LIKE ? OR o.opp_code LIKE ?)`;
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.stage) { where += ` AND o.stage = ?`; params.push(filter.stage); }
    if (filter.assignedTo) { where += ` AND o.assigned_to = ?`; params.push(filter.assignedTo); }

    const total = (queryOne(`SELECT COUNT(*) as c FROM opportunities o ${where}`, params) as any).c;
    const rows = queryAll(
      `SELECT o.*, c.name as customer_name, u.name as assigned_to_name
       FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.assigned_to
       ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total, page, limit };
  }

  getById(id: string) {
    const row = queryOne(
      `SELECT o.*, c.name as customer_name, u.name as assigned_to_name
       FROM opportunities o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN users u ON u.id = o.assigned_to
       WHERE o.id = ? AND o.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
    return row;
  }

  create(data: Record<string, unknown>, userId: string) {
    const { title, customer_id, stage, expected_amount, expected_date, assigned_to, notes, project_type, project_type_other } = data;
    if (!title || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件仮称と顧客は必須です');

    const id = uuidv4();
    const oppCode = generateSequenceNumber('opp_code', 'OPP');
    execute(
      `INSERT INTO opportunities (id, opp_code, title, customer_id, stage, expected_amount, expected_date, assigned_to, notes, project_type, project_type_other, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, oppCode, title, customer_id, stage || 'neta', expected_amount || 0, expected_date || null, assigned_to || userId, notes || null, project_type || null, project_type_other || null, userId]
    );
    return queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [id]);
  }

  update(id: string, data: Record<string, unknown>, userId: string) {
    const existing = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');

    const { title, customer_id, stage, expected_amount, expected_date, assigned_to, notes, project_type, project_type_other } = data;
    execute(
      `UPDATE opportunities SET title=?, customer_id=?, stage=?, expected_amount=?, expected_date=?, assigned_to=?, notes=?, project_type=?, project_type_other=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
      [title, customer_id, stage, expected_amount, expected_date || null, assigned_to, notes || null, project_type || null, project_type_other || null, userId, id]
    );
    return queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [id]);
  }

  /**
   * ステージ変更 + 受注確定時の案件自動作成
   * コンテキスト間連携: Sales → Production（案件作成）、Sales → Finance（売上自動作成）
   */
  changeStage(id: string, stage: string, input: ConfirmOrderInput, userId: string): ConfirmOrderResult {
    if (!stage) throw new AppError(400, 'VALIDATION_ERROR', 'stageは必須です');

    const opp = queryOne('SELECT * FROM opportunities WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');

    execute(`UPDATE opportunities SET stage=?, updated_at=datetime('now'), updated_by=? WHERE id=?`, [stage, userId, id]);

    let project = null;
    let episodes: Record<string, unknown>[] = [];
    let episodeOrder = null;

    // 受注確定: 案件 + エピソード + 売上を自動生成
    if (stage === 'b_verbal' && !opp.project_id) {
      const projId = uuidv4();
      const glsNumber = generateGlsNumber();
      const bType = input.broadcastType || 'recording';
      const mPlatform = input.mediaPlatform || 'other';

      // Production コンテキスト: 案件作成
      execute(
        `INSERT INTO projects (id, gls_number, name, customer_id, opportunity_id, status, broadcast_type, media_platform, created_by)
         VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
        [projId, glsNumber, opp.title, opp.customer_id, id, bType, mPlatform, userId]
      );
      execute(`UPDATE opportunities SET project_id=?, updated_at=datetime('now') WHERE id=?`, [projId, id]);

      // Production コンテキスト: エピソード一括作成
      const epCount = input.initialEpisodeCount || 0;
      if (epCount > 0) {
        for (let i = 1; i <= epCount; i++) {
          const epId = uuidv4();
          const epCode = generateEpisodeCode(glsNumber, i);
          execute(
            `INSERT INTO episodes (id, project_id, episode_number, episode_code, created_by) VALUES (?, ?, ?, ?, ?)`,
            [epId, projId, i, epCode, userId]
          );
        }
        // 発注バッチ記録
        const orderId = uuidv4();
        const today = new Date().toISOString().split('T')[0];
        execute(
          `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, projId, today, epCount, 1, epCount, '受注時初回発注', userId]
        );
        episodes = queryAll('SELECT * FROM episodes WHERE project_id = ? AND deleted_at IS NULL ORDER BY episode_number', [projId]);
        episodeOrder = queryOne('SELECT * FROM episode_orders WHERE id = ?', [orderId]) as Record<string, unknown> | null;
      }

      project = queryOne('SELECT * FROM projects WHERE id = ?', [projId]) as Record<string, unknown> | null;

      // Finance コンテキスト: 売上自動作成（エピソードなしの場合）
      if (opp.expected_amount && opp.expected_amount > 0 && epCount === 0) {
        const revId = uuidv4();
        execute(
          `INSERT INTO revenues (id, billing_key, project_id, customer_id, assigned_to, tax_category, amount, notes, created_by)
           VALUES (?, ?, ?, ?, ?, 'tax10', ?, ?, ?)`,
          [revId, `${glsNumber}-AUTO`, projId, opp.customer_id, userId, opp.expected_amount, 'ヨミからの自動連携', userId]
        );
      }
    }

    const updated = queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [id]);
    return { opportunity: updated as Record<string, unknown>, project, episodes, episodeOrder };
  }

  delete(id: string, userId: string) {
    execute(`UPDATE opportunities SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [userId, id]);
  }

  // --- ヨミ日程管理 ---

  getDates(opportunityId: string) {
    const opp = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [opportunityId]);
    if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
    return queryAll(
      `SELECT id, date_start, date_end, label, sort_order FROM opportunity_dates WHERE opportunity_id = ? ORDER BY sort_order, date_start`,
      [opportunityId]
    );
  }

  saveDates(opportunityId: string, dates: Array<{ date_start: string; date_end?: string; label?: string; sort_order?: number }>) {
    const opp = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [opportunityId]);
    if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
    if (!Array.isArray(dates)) throw new AppError(400, 'VALIDATION_ERROR', 'datesは配列で指定してください');

    execute(`DELETE FROM opportunity_dates WHERE opportunity_id = ?`, [opportunityId]);
    for (const d of dates) {
      const id = uuidv4();
      execute(
        `INSERT INTO opportunity_dates (id, opportunity_id, date_start, date_end, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, opportunityId, d.date_start, d.date_end || null, d.label || null, d.sort_order ?? 0]
      );
    }
    return queryAll(
      `SELECT id, date_start, date_end, label, sort_order FROM opportunity_dates WHERE opportunity_id = ? ORDER BY sort_order, date_start`,
      [opportunityId]
    );
  }
}

export const opportunityService = new OpportunityService();
