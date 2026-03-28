import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateSequenceNumber, generateGlsNumber } from '../../../shared/services/sequence.service';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface ProjectFilter {
  search?: string;
  stage?: string;
  assignedTo?: string;
  tab?: 'all' | 'yomi' | 'active' | 'completed' | 'lost';
  tag?: string;
}

export class ProjectService {
  /**
   * 統合一覧: タブ（ヨミ/進行中/完了/失注）+ フィルタ
   */
  list(filter: ProjectFilter, page: number, limit: number, offset: number) {
    let where = 'WHERE p.deleted_at IS NULL';
    const params: unknown[] = [];

    // タブフィルタ
    if (filter.tab === 'yomi') {
      where += ` AND p.gls_number IS NULL AND p.stage NOT IN ('e_lost')`;
    } else if (filter.tab === 'active') {
      where += ` AND p.gls_number IS NOT NULL AND p.stage NOT IN ('s_completed', 'e_lost')`;
    } else if (filter.tab === 'completed') {
      where += ` AND p.stage = 's_completed'`;
    } else if (filter.tab === 'lost') {
      where += ` AND p.stage = 'e_lost'`;
    }

    // 個別フィルタ
    if (filter.search) {
      where += ` AND (p.name LIKE ? OR p.code LIKE ? OR p.gls_number LIKE ?)`;
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.stage) {
      where += ` AND p.stage = ?`;
      params.push(filter.stage);
    }
    if (filter.assignedTo) {
      where += ` AND p.assigned_to = ?`;
      params.push(filter.assignedTo);
    }
    if (filter.tag) {
      where += ` AND (',' || p.tags || ',') LIKE ?`;
      params.push(`%,${filter.tag},%`);
    }

    const total = (queryOne(`SELECT COUNT(*) as c FROM projects p ${where}`, params) as any).c;
    const rows = queryAll(
      `SELECT p.*, c.name as customer_name, c.short_name as customer_short_name, u.name as assigned_to_name
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.assigned_to
       ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total, page, limit };
  }

  getById(id: string) {
    const row = queryOne(
      `SELECT p.*, c.name as customer_name, c.short_name as customer_short_name, u.name as assigned_to_name
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.assigned_to
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    return row;
  }

  /**
   * 新規作成（ヨミ段階: 最低限の入力でOK）
   */
  create(data: Record<string, unknown>, userId: string) {
    const { name, customer_id, expected_amount, assigned_to, project_type, notes } = data;
    if (!name || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件名と顧客は必須です');

    const id = uuidv4();
    const code = generateSequenceNumber('opp_code', 'OPP');
    execute(
      `INSERT INTO projects (id, code, name, customer_id, stage, project_type, expected_amount, assigned_to, notes, created_by)
       VALUES (?, ?, ?, ?, 'neta', ?, ?, ?, ?, ?)`,
      [id, code, name, customer_id, project_type || 'other', expected_amount || 0, assigned_to || userId, notes || null, userId]
    );
    return this.getById(id);
  }

  /**
   * 更新（ヨミ段階でも案件段階でも同じAPI）
   */
  update(id: string, data: Record<string, unknown>, userId: string) {
    const existing = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const { name, customer_id, expected_amount, assigned_to, project_type, project_type_other,
            event_start, event_end, broadcast_type, media_platform, tags,
            application_form, logo_permission, notes } = data;
    execute(
      `UPDATE projects SET name=?, customer_id=?, expected_amount=?, assigned_to=?,
       project_type=?, project_type_other=?, event_start=?, event_end=?,
       broadcast_type=?, media_platform=?, tags=?,
       application_form=?, logo_permission=?, notes=?,
       updated_at=datetime('now'), updated_by=? WHERE id=?`,
      [name, customer_id, expected_amount || 0, assigned_to,
       project_type || 'other', project_type_other || null,
       event_start || null, event_end || null,
       broadcast_type || null, media_platform || null, tags || '',
       application_form ? 1 : 0, logo_permission ? 1 : 0, notes || null,
       userId, id]
    );
    return this.getById(id);
  }

  /**
   * ステージ変更（ステージだけ変える。他の処理は含めない）
   */
  changeStage(id: string, stage: string, data: Record<string, unknown>, userId: string) {
    if (!stage) throw new AppError(400, 'VALIDATION_ERROR', 'stageは必須です');

    const project = queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    if (stage === 'e_lost') {
      execute(
        `UPDATE projects SET stage=?, lost_reason=?, lost_reason_note=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
        [stage, data.lost_reason || null, data.lost_reason_note || null, userId, id]
      );
    } else {
      execute(
        `UPDATE projects SET stage=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
        [stage, userId, id]
      );
    }
    return this.getById(id);
  }

  /**
   * GLS発番（口頭決定以降で呼ぶ。案件に GLS番号を付与する）
   */
  issueGls(id: string, data: Record<string, unknown>, userId: string) {
    const project = queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', '既にGLS番号が発番済みです');

    const glsNumber = generateGlsNumber(project.project_type as string);
    const { broadcast_type, media_platform } = data;

    execute(
      `UPDATE projects SET gls_number=?, broadcast_type=?, media_platform=?,
       stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
       updated_at=datetime('now'), updated_by=? WHERE id=?`,
      [glsNumber, broadcast_type || null, media_platform || null, userId, id]
    );

    return this.getById(id);
  }

  /**
   * 案件サマリー（売上/仕入/粗利）
   */
  getSummary(id: string) {
    const project = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const rev = queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM revenues WHERE project_id = ? AND deleted_at IS NULL', [id]);
    const pur = queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE project_id = ? AND deleted_at IS NULL', [id]);
    const totalRevenue = (rev?.total as number) || 0;
    const totalPurchase = (pur?.total as number) || 0;
    const grossProfit = totalRevenue - totalPurchase;
    const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;
    return { total_revenue: totalRevenue, total_purchase: totalPurchase, gross_profit: grossProfit, gross_margin: grossMargin };
  }

  /**
   * タグ一覧（全案件から使用中のタグを抽出）
   */
  getTags() {
    const rows = queryAll("SELECT tags FROM projects WHERE deleted_at IS NULL AND tags != '' AND tags IS NOT NULL");
    const tagSet = new Set<string>();
    for (const row of rows) {
      const tags = (row.tags as string).split(',').map(t => t.trim()).filter(Boolean);
      tags.forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet).sort();
  }

  delete(id: string, userId: string) {
    execute(`UPDATE projects SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [userId, id]);
  }
}

export const projectService = new ProjectService();
