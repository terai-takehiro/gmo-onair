import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateSequenceNumber, generateGlsNumber } from '../../../shared/services/sequence.service';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  createProjectFolderTree,
  renameProjectFolderPair,
  type CustomerType,
} from './box-folder.service';
import { extractFolderId } from '../../../shared/services/box';

/**
 * BOX フォルダ名のフォーマット: `{idCode}_{案件名}`
 * idCode は GLS 発番済みなら gls_number、未発番なら code (OPP コード)
 */
function buildProjectFolderName(project: { gls_number?: string | null; code: string; name: string }): string {
  const idCode = project.gls_number || project.code;
  return `${idCode}_${project.name}`;
}

/**
 * customer_type を 'internal' | 'external' に正規化 (不正値は 'external' フォールバック)
 */
function normalizeCustomerType(value: unknown): CustomerType {
  return value === 'internal' ? 'internal' : 'external';
}

export interface ProjectFilter {
  search?: string;
  stage?: string;
  assignedTo?: string;
  tab?: 'all' | 'yomi' | 'active' | 'completed' | 'lost';
  tag?: string;
  glsCategory?: 'A' | 'B';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

const SORT_COLUMN_MAP: Record<string, string> = {
  code: 'p.gls_number',
  name: 'p.name',
  customer: 'c.name',
  stage: 'p.stage',
  project_type: 'p.project_type',
  expected_amount: 'p.expected_amount',
  event_start: 'p.event_start',
  assigned_to: 'u.name',
  created_at: 'p.created_at',
};

/**
 * v2.8.1+ デフォルトソート式
 * - 案件終了 (s_completed) と失注 (e_lost) を最後に押し下げ
 * - 残りはイベント開始日が近い順 (ASC、NULL は最後)
 * - 同点はステージ進行度 → 作成日新しい順 でタイブレーク
 */
const DEFAULT_SORT_SQL = `
  CASE
    WHEN p.stage = 'e_lost' THEN 2
    WHEN p.stage = 's_completed' THEN 1
    ELSE 0
  END ASC,
  p.event_start ASC NULLS LAST,
  p.created_at DESC
`;

export class ProjectService {
  /**
   * 統合一覧: タブ（ヨミ/進行中/完了/失注）+ フィルタ
   */
  async list(filter: ProjectFilter, page: number, limit: number, offset: number) {
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
      where += ` AND (p.name ILIKE ? OR p.code ILIKE ? OR p.gls_number ILIKE ? OR c.name ILIKE ? OR c.short_name ILIKE ?)`;
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
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
    if (filter.glsCategory === 'A') {
      where += ` AND p.gls_number IS NOT NULL AND p.gls_number LIKE 'GLS-A%'`;
    } else if (filter.glsCategory === 'B') {
      where += ` AND p.gls_number IS NOT NULL AND p.gls_number LIKE 'GLS-B%'`;
    }

    // v2.8.1+: sortBy='default' (または未指定) のときは「完了/失注は最後 + イベント日近い順」
    let orderBy: string;
    if (!filter.sortBy || filter.sortBy === 'default') {
      orderBy = DEFAULT_SORT_SQL;
    } else {
      const sortCol = SORT_COLUMN_MAP[filter.sortBy] || 'p.created_at';
      const sortDir = filter.sortDir === 'asc' ? 'ASC' : 'DESC';
      // event_start を選んだときは NULL を最後に置く
      const nullsClause = filter.sortBy === 'event_start' ? ` NULLS ${sortDir === 'ASC' ? 'LAST' : 'FIRST'}` : '';
      orderBy = `${sortCol} ${sortDir}${nullsClause}`;
    }

    const total = ((await queryOne(`SELECT COUNT(*) as c FROM projects p LEFT JOIN customers c ON c.id = p.customer_id ${where}`, params)) as any).c;
    const rows = await queryAll(
      `SELECT p.*, c.name as customer_name, c.short_name as customer_short_name, u.name as assigned_to_name,
       COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.project_id = p.id AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.group_id IS NULL), 0) as total_revenue,
       COALESCE((SELECT SUM(pu.amount) FROM purchases pu WHERE pu.project_id = p.id AND pu.deleted_at IS NULL AND pu.group_id IS NULL), 0) as total_purchase
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = p.assigned_to
       ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total, page, limit };
  }

  async getById(id: string) {
    const row = await queryOne(
      `SELECT p.*, c.name as customer_name, c.short_name as customer_short_name, u.name as assigned_to_name,
       COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.project_id = p.id AND r.status = 'confirmed' AND r.deleted_at IS NULL AND r.group_id IS NULL), 0) as total_revenue,
       COALESCE((SELECT SUM(pu.amount) FROM purchases pu WHERE pu.project_id = p.id AND pu.deleted_at IS NULL AND pu.group_id IS NULL), 0) as total_purchase
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
  async create(data: Record<string, unknown>, userId: string) {
    const { name, customer_id, expected_amount, assigned_to, project_type, notes, customer_type,
            box_url_internal, box_url_external, application_form, logo_permission } = data;
    if (!name || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件名と顧客は必須です');

    const id = uuidv4();
    const code = await generateSequenceNumber('opp_code', 'OPP');
    const cType = normalizeCustomerType(customer_type);
    await execute(
      `INSERT INTO projects (id, code, name, customer_id, stage, project_type, expected_amount, assigned_to,
                             notes, customer_type, box_url_internal, box_url_external,
                             application_form, logo_permission, created_by)
       VALUES (?, ?, ?, ?, 'neta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, customer_id, project_type || 'other', expected_amount || 0, assigned_to || userId,
       notes || null, cType, box_url_internal || null, box_url_external || null,
       application_form ? 1 : 0, logo_permission ? 1 : 0, userId]
    );

    // BOX フォルダ自動作成 (両親フォルダに並行作成。OPP コード命名で、GLS 発番時にリネームされる)
    // 既に box_url_internal / box_url_external が手動入力されている場合は、未入力側だけ補填
    try {
      const folders = await createProjectFolderTree(code, String(name));
      const updates: string[] = [];
      const params: unknown[] = [];
      if (!box_url_internal && folders.internal) {
        updates.push('box_url_internal = ?');
        params.push(folders.internal.folderUrl);
      }
      if (!box_url_external && folders.external) {
        updates.push('box_url_external = ?');
        params.push(folders.external.folderUrl);
      }
      if (updates.length > 0) {
        params.push(id);
        await execute(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, params);
      }
    } catch (err) {
      console.warn('[create] BOX folder creation failed (non-blocking):', (err as Error).message);
    }

    return this.getById(id);
  }

  /**
   * 更新（ヨミ段階でも案件段階でも同じAPI）
   */
  async update(id: string, data: Record<string, unknown>, userId: string) {
    const existing = await queryOne(
      'SELECT id, name, code, gls_number, customer_type, box_url_internal, box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
      [id],
    ) as Record<string, unknown> | null;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const { name, customer_id, expected_amount, assigned_to, project_type, project_type_other,
            event_start, event_end, broadcast_type, media_platform, tags,
            application_form, logo_permission, notes, customer_type, box_url_internal, box_url_external } = data;
    const cType = normalizeCustomerType(customer_type);
    await execute(
      `UPDATE projects SET name=?, customer_id=?, expected_amount=?, assigned_to=?,
       project_type=?, project_type_other=?, event_start=?, event_end=?,
       broadcast_type=?, media_platform=?, tags=?,
       application_form=?, logo_permission=?, notes=?, customer_type=?,
       box_url_internal=?, box_url_external=?,
       updated_at=NOW(), updated_by=? WHERE id=?`,
      [name, customer_id, expected_amount || 0, assigned_to,
       project_type || 'other', project_type_other || null,
       event_start || null, event_end || null,
       broadcast_type || null, media_platform || null, tags || '',
       application_form ? 1 : 0, logo_permission ? 1 : 0, notes || null, cType,
       box_url_internal || null, box_url_external || null,
       userId, id]
    );

    // 想定金額が変わった場合、確定売上の代表レコードにも反映
    if (expected_amount !== undefined && Number(expected_amount) > 0) {
      await execute(
        `UPDATE revenues SET amount = ?, updated_at = NOW()
         WHERE id = (
           SELECT id FROM revenues
           WHERE project_id = ? AND status = 'confirmed' AND group_id IS NULL AND deleted_at IS NULL
           ORDER BY created_at ASC LIMIT 1
         )`,
        [expected_amount, id]
      );
    }

    // 案件名変更を BOX 両フォルダ (社内限り / 社外共有可) に並行反映 (非ブロッキング)
    if (typeof name === 'string' && name && name !== existing.name) {
      try {
        const internalFolderId = extractFolderId(existing.box_url_internal as string | null);
        const externalFolderId = extractFolderId(existing.box_url_external as string | null);
        if (internalFolderId || externalFolderId) {
          const newFolderName = buildProjectFolderName({
            gls_number: existing.gls_number as string | null,
            code: existing.code as string,
            name,
          });
          await renameProjectFolderPair(internalFolderId, externalFolderId, newFolderName);
        }
      } catch (err) {
        console.warn('[update] BOX folder rename failed (non-blocking):', (err as Error).message);
      }
    }

    return this.getById(id);
  }

  /**
   * ステージ変更（ステージだけ変える。他の処理は含めない）
   */
  async changeStage(id: string, stage: string, data: Record<string, unknown>, userId: string) {
    if (!stage) throw new AppError(400, 'VALIDATION_ERROR', 'stageは必須です');

    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    if (stage === 'e_lost') {
      await execute(
        `UPDATE projects SET stage=?, lost_reason=?, lost_reason_note=?, lessons_learned=?, lost_at=NOW(), updated_at=NOW(), updated_by=? WHERE id=?`,
        [stage, data.lost_reason || null, data.lost_reason_note || null, data.lessons_learned || null, userId, id]
      );
    } else {
      await execute(
        `UPDATE projects SET stage=?, updated_at=NOW(), updated_by=? WHERE id=?`,
        [stage, userId, id]
      );
    }

    // d_hold 遷移時、案件に日程が入っていれば仮押さえ予約を自動生成
    if (stage === 'd_hold' && project.event_start) {
      const existing = await queryOne(
        `SELECT id FROM studio_bookings WHERE project_id = ? AND booking_type = 'hold' AND deleted_at IS NULL`,
        [id]
      );
      if (!existing) {
        const bookingId = uuidv4();
        const eventEnd = project.event_end || project.event_start;
        await execute(
          `INSERT INTO studio_bookings (id, title, booking_type, project_id, all_day, start_time, end_time, status, notes, created_by)
           VALUES (?, ?, 'hold', ?, 1, ?, ?, 'tentative', '案件ステージ移行で自動生成', ?)`,
          [bookingId, `${project.name} 仮押さえ`, id, project.event_start, eventEnd, userId]
        );
      }
    }

    return this.getById(id);
  }

  /**
   * GLS発番（口頭決定以降で呼ぶ。案件に GLS番号を付与する）
   */
  async issueGls(id: string, data: Record<string, unknown>, userId: string) {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', '既にGLS番号が発番済みです');

    const glsNumber = await generateGlsNumber(project.project_type as string);
    const { broadcast_type, media_platform } = data;

    await execute(
      `UPDATE projects SET gls_number=?, broadcast_type=?, media_platform=?,
       stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
       updated_at=NOW(), updated_by=? WHERE id=?`,
      [glsNumber, broadcast_type || null, media_platform || null, userId, id]
    );

    // 概算見積を確定売上に変換
    await this.migrateEstimates(id, glsNumber);

    // BOX 両フォルダ (社内限り / 社外共有可) の ID 部分を OPP コード → GLS 番号 にリネーム。
    // 片方が未作成の場合 (初回作成失敗 / BOX 後付け有効化) は新規作成でフォールバック。
    // いずれも失敗しても GLS 発番自体はブロックしない。
    try {
      const internalFolderId = extractFolderId(project.box_url_internal as string | null);
      const externalFolderId = extractFolderId(project.box_url_external as string | null);
      const newFolderName = buildProjectFolderName({
        gls_number: glsNumber,
        code: project.code as string,
        name: project.name as string,
      });

      if (internalFolderId || externalFolderId) {
        await renameProjectFolderPair(internalFolderId, externalFolderId, newFolderName);
      }

      // 未作成の側を補填 (両方未作成のケースも含む)
      if (!internalFolderId || !externalFolderId) {
        const folders = await createProjectFolderTree(glsNumber, project.name as string);
        const updates: string[] = [];
        const params: unknown[] = [];
        if (!internalFolderId && folders.internal) {
          updates.push('box_url_internal = ?');
          params.push(folders.internal.folderUrl);
        }
        if (!externalFolderId && folders.external) {
          updates.push('box_url_external = ?');
          params.push(folders.external.folderUrl);
        }
        if (updates.length > 0) {
          params.push(id);
          await execute(`UPDATE projects SET ${updates.join(', ')}, updated_at=NOW() WHERE id=?`, params);
        }
      }
    } catch (err) {
      console.warn('[issueGls] BOX folder sync failed:', (err as Error).message);
    }

    return this.getById(id);
  }

  /**
   * 既存案件向けの BOX フォルダ手動作成 (両親フォルダ対応)。
   * - BOX 未設定 → 503
   * - 両 URL すでに揃っている → { already: true } (idempotent)
   * - 片方だけある場合は無い側のみ補填
   * - GLS 未発番なら OPP コード、発番済みなら GLS 番号で命名
   */
  async createBoxFolder(
    id: string,
  ): Promise<{ urlInternal: string | null; urlExternal: string | null; already: boolean }> {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const existingInternal = project.box_url_internal as string | null;
    const existingExternal = project.box_url_external as string | null;

    if (existingInternal && existingExternal) {
      return { urlInternal: existingInternal, urlExternal: existingExternal, already: true };
    }

    // BOX 設定状況をチェック (createProjectFolderTree も同じチェックをするが、
    // 早めに 503 を返したいため明示的に)
    const { isBoxConfigured } = await import('../../../shared/services/box');
    if (!isBoxConfigured()) {
      throw new AppError(503, 'BOX_NOT_CONFIGURED', 'BOX 連携が未設定です');
    }

    const idCode = (project.gls_number as string | null) || (project.code as string);
    const folders = await createProjectFolderTree(idCode, project.name as string);

    const newInternal = existingInternal || (folders.internal?.folderUrl ?? null);
    const newExternal = existingExternal || (folders.external?.folderUrl ?? null);

    if (!newInternal && !newExternal) {
      throw new AppError(502, 'BOX_FOLDER_CREATE_FAILED', 'BOX フォルダ作成に失敗しました (親フォルダ ID 未設定の可能性)');
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (!existingInternal && folders.internal) {
      updates.push('box_url_internal = ?');
      params.push(folders.internal.folderUrl);
    }
    if (!existingExternal && folders.external) {
      updates.push('box_url_external = ?');
      params.push(folders.external.folderUrl);
    }
    if (updates.length > 0) {
      params.push(id);
      await execute(`UPDATE projects SET ${updates.join(', ')}, updated_at=NOW() WHERE id=?`, params);
    }

    return { urlInternal: newInternal, urlExternal: newExternal, already: false };
  }

  /**
   * 既存GLS案件へのリンク（エピソード追加）
   */
  async linkToExistingGls(id: string, targetProjectId: string, userId: string) {
    const project = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [id]) as any;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', '既にGLS番号が発番済みです');

    const target = await queryOne('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [targetProjectId]) as any;
    if (!target || !target.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'リンク先にGLS番号がありません');

    await execute(
      `UPDATE projects SET gls_number=?, broadcast_type=?, media_platform=?,
       stage=CASE WHEN stage IN ('neta','d_hold','c_proposal') THEN 'b_verbal' ELSE stage END,
       updated_at=NOW(), updated_by=? WHERE id=?`,
      [target.gls_number, target.broadcast_type || null, target.media_platform || null, userId, id]
    );

    // 概算見積を確定売上に変換
    await this.migrateEstimates(id, target.gls_number);

    return this.getById(id);
  }

  /**
   * GLS番号付き案件一覧（リンク先選択用）
   */
  async getGlsProjects() {
    return await queryAll(
      `SELECT p.id, p.gls_number, p.name, c.name as customer_name
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.gls_number IS NOT NULL AND p.deleted_at IS NULL
       ORDER BY p.gls_number DESC`
    );
  }

  /**
   * 概算見積→確定売上に変換（billing_key再生成＋ステータス変更）
   */
  private async migrateEstimates(projectId: string, glsNumber: string) {
    const estimates = await queryAll(
      `SELECT id, tax_category FROM revenues
       WHERE project_id = ? AND status = 'estimate' AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [projectId]
    ) as any[];
    if (estimates.length === 0) return;

    // 既存の確定売上数をカウント（同一GLS番号の全プロジェクト横断）
    const existingConfirmed = ((await queryOne(
      `SELECT COUNT(*) as c FROM revenues r
       JOIN projects p ON p.id = r.project_id
       WHERE p.gls_number = ? AND r.status = 'confirmed' AND r.deleted_at IS NULL`,
      [glsNumber]
    )) as any).c;

    for (let i = 0; i < estimates.length; i++) {
      const est = estimates[i];
      const seq = existingConfirmed + i + 1;
      const seqNum = String(seq).padStart(3, '0');
      const taxSuffix = est.tax_category === 'tax8' ? '2' : (est.tax_category === 'exempt' ? '0' : '1');
      const newBillingKey = `${glsNumber}-${seqNum}-${taxSuffix}`;
      await execute(
        `UPDATE revenues SET status = 'confirmed', billing_key = ?, updated_at = NOW() WHERE id = ?`,
        [newBillingKey, est.id]
      );
    }
  }

  /**
   * 案件サマリー（売上/仕入/粗利）
   */
  async getSummary(id: string) {
    const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    // 直接売上（group_id なし）+ グループ按分された売上
    const directRev = await queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM revenues WHERE project_id = ? AND group_id IS NULL AND deleted_at IS NULL', [id]);
    const allocatedRev = await queryOne('SELECT COALESCE(SUM(ra.allocated_amount), 0) as total FROM revenue_allocations ra JOIN revenues r ON r.id = ra.revenue_id AND r.deleted_at IS NULL WHERE ra.project_id = ?', [id]);
    // 直接仕入（group_id なし）+ グループ按分された金額
    const directPur = await queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE project_id = ? AND group_id IS NULL AND deleted_at IS NULL', [id]);
    const allocatedPur = await queryOne('SELECT COALESCE(SUM(pa.allocated_amount), 0) as total FROM purchase_allocations pa JOIN purchases pu ON pu.id = pa.purchase_id AND pu.deleted_at IS NULL WHERE pa.project_id = ?', [id]);
    const totalRevenue = ((directRev?.total as number) || 0) + ((allocatedRev?.total as number) || 0);
    const totalPurchase = ((directPur?.total as number) || 0) + ((allocatedPur?.total as number) || 0);
    const grossProfit = totalRevenue - totalPurchase;
    const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;
    return { total_revenue: totalRevenue, total_purchase: totalPurchase, gross_profit: grossProfit, gross_margin: grossMargin };
  }

  /**
   * タグ一覧（全案件から使用中のタグを抽出）
   */
  async getTags() {
    const rows = await queryAll("SELECT tags FROM projects WHERE deleted_at IS NULL AND tags != '' AND tags IS NOT NULL");
    const tagSet = new Set<string>();
    for (const row of rows) {
      const tags = (row.tags as string).split(',').map(t => t.trim()).filter(Boolean);
      tags.forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet).sort();
  }

  async delete(id: string, userId: string) {
    await execute(`UPDATE projects SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [userId, id]);
  }
}

export const projectService = new ProjectService();
