import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// List invoice groups with episode count and total amount
router.get('/:projectId/invoice-groups', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const projectId = req.params.projectId;

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const where = 'WHERE ig.project_id = ? AND ig.deleted_at IS NULL';
  const params: unknown[] = [projectId];

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM invoice_groups ig ${where}`, params)) as any).c;

  // ⚠️ total_amount は revenues を invoice_group_episodes に JOIN してから SUM で1行に集約する。
  // 以前は「FROM invoice_group_episodes ige JOIN episodes e ...」を外側の相関サブクエリの
  // FROM に置いていたため、回が2件以上の請求グループで
  // 「more than one row returned by a subquery used as an expression」と落ちていた
  // （§7 の月末締めは複数の回を1枚にまとめるのが主眼のため、直さないと必ず踏む・全5箇所で同じ形）。
  const rows = await queryAll(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig
    ${where}
    ORDER BY ig.invoice_date DESC, ig.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, total, page, limit));
});

// Create invoice group
router.post('/:projectId/invoice-groups', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId;
  const { title, invoice_date, episode_ids } = req.body;

  if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const id = uuidv4();
  await execute(
    `INSERT INTO invoice_groups (id, project_id, title, invoice_date, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, projectId, title, invoice_date || null, req.user!.id]
  );

  // Link episodes if provided
  if (episode_ids && Array.isArray(episode_ids)) {
    for (const episodeId of episode_ids) {
      await execute(
        'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
        [id, episodeId]
      );
    }
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [id]
  );
  res.status(201).json({ success: true, data: row });
});

// Update invoice group
router.put('/:projectId/invoice-groups/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  const { title, invoice_date, notes } = req.body;

  await execute(
    `UPDATE invoice_groups SET
      title = ?, invoice_date = ?, notes = ?,
      updated_at = NOW(), updated_by = ?
    WHERE id = ?`,
    [title || null, invoice_date || null, notes || null, req.user!.id, req.params.id]
  );

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete invoice group
router.delete('/:projectId/invoice-groups/:id', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  await execute(
    `UPDATE invoice_groups SET deleted_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

// Update episode assignments for an invoice group
router.put('/:projectId/invoice-groups/:id/episodes', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  const { episode_ids } = req.body;
  if (!Array.isArray(episode_ids)) throw new AppError(400, 'VALIDATION_ERROR', 'episode_idsは配列で指定してください');

  // Delete existing links
  await execute('DELETE FROM invoice_group_episodes WHERE invoice_group_id = ?', [req.params.id]);

  // Insert new links
  for (const episodeId of episode_ids) {
    await execute(
      'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
      [req.params.id, episodeId]
    );
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Auto-create invoice groups by recording date
router.post('/:projectId/invoice-groups/auto-by-recording-date', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId;
  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  // Get episodes grouped by recording_date
  // ⚠️ 旧実装は SQLite の GROUP_CONCAT を使っており PostgreSQL では 500 になっていた
  // （regular-series.md §6）。string_agg(expr, delimiter) が正。
  const dateGroups = await queryAll(
    `SELECT recording_date, string_agg(id, ',') as episode_ids, COUNT(*) as cnt
     FROM episodes
     WHERE project_id = ? AND deleted_at IS NULL AND recording_date IS NOT NULL
     GROUP BY recording_date
     ORDER BY recording_date`,
    [projectId]
  );

  const created: unknown[] = [];
  for (const group of dateGroups) {
    const recDate = group.recording_date as string;
    const epIds = (group.episode_ids as string).split(',');

    // Check if a group for this date already exists
    const existing = await queryOne(
      `SELECT ig.id FROM invoice_groups ig
       WHERE ig.project_id = ? AND ig.title ILIKE ? AND ig.deleted_at IS NULL`,
      [projectId, `%${recDate}%`]
    );
    if (existing) continue; // Skip if already exists

    const id = uuidv4();
    const title = `${recDate} 収録分 (${group.cnt}話)`;
    await execute(
      `INSERT INTO invoice_groups (id, project_id, title, invoice_date, created_by) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, title, recDate, req.user!.id]
    );

    for (const epId of epIds) {
      await execute('INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)', [id, epId.trim()]);
    }

    const row = await queryOne(
      `SELECT ig.*, (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count
       FROM invoice_groups ig WHERE ig.id = ?`,
      [id]
    );
    created.push(row);
  }

  res.status(201).json({ success: true, data: created, message: `${created.length}件の請求グループを作成しました` });
});

// Auto-create/extend the monthly-close invoice group for a project
// （regular-series.md §6・§10-7: billing_cycle='monthly_close' 案件の請求まとめ）
//
// 「その月に完了に達した回」＝ その回の project_tasks（親タスクのみ）が1件以上あり
// 全部完了、かつ最後に完了したタスクの completed_at が対象月（§4の「完了」導出をそのまま
// 使う・episodes.status には書き戻さない）。
//
// ⚠️ 一度どこかの請求グループ（削除されていないもの）に紐づいた回は対象から外す。
// 請求書を発行した時点で回と請求書の対応を invoice_group_episodes に固定し、
// あとから回の状態が動いても対応を動かさないため（締めたあと completed が戻っても
// 請求対象から消えない・二重に別グループへ入ることもない）。
// 同じ月の下書き（status='draft'）グループが既にあればそこへ追加し、
// 発行済み（sent/paid）のグループには一切触れず新しいグループを作る。
router.post('/:projectId/invoice-groups/auto-monthly-close', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId;
  const { month } = req.body as { month?: string };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'month は YYYY-MM 形式で指定してください');
  }

  const project = await queryOne(
    'SELECT id, billing_cycle FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId]
  ) as { id: string; billing_cycle: string } | undefined;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (project.billing_cycle !== 'monthly_close') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `この案件の請求サイクルは「月末締め」ではありません（現在: ${project.billing_cycle}）`
    );
  }

  const result = await withTransaction(async (tx) => {
    const candidates = (await tx.queryAll(
      `SELECT e.id
       FROM episodes e
       JOIN project_tasks pt
         ON pt.episode_id = e.id AND pt.deleted_at IS NULL AND pt.parent_task_id IS NULL
       WHERE e.project_id = ? AND e.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM invoice_group_episodes ige
           JOIN invoice_groups ig ON ig.id = ige.invoice_group_id AND ig.deleted_at IS NULL
           WHERE ige.episode_id = e.id
         )
       GROUP BY e.id
       HAVING COUNT(*) = COUNT(*) FILTER (WHERE pt.is_completed = true)
          AND to_char(MAX(pt.completed_at), 'YYYY-MM') = ?
       ORDER BY e.id`,
      [projectId, month]
    )) as { id: string }[];

    if (candidates.length === 0) return { groupId: null as string | null, addedCount: 0 };

    const episodeIds = candidates.map((c) => c.id);

    // 対象の回をロックしてから、ロック後にもう一度「未割当のままか」を確認する
    // （episode-generate.routes.ts の採番と同じ select→lock→再確認の作法。
    // 同時に別のリクエストが同じ回を別グループへ入れる競合を防ぐ）
    await tx.queryAll('SELECT id FROM episodes WHERE id = ANY(?::text[]) FOR UPDATE', [episodeIds]);
    const stillUnassigned = (await tx.queryAll(
      `SELECT e.id FROM episodes e
       WHERE e.id = ANY(?::text[])
         AND NOT EXISTS (
           SELECT 1 FROM invoice_group_episodes ige
           JOIN invoice_groups ig ON ig.id = ige.invoice_group_id AND ig.deleted_at IS NULL
           WHERE ige.episode_id = e.id
         )`,
      [episodeIds]
    )) as { id: string }[];
    const finalIds = stillUnassigned.map((r) => r.id);
    if (finalIds.length === 0) return { groupId: null as string | null, addedCount: 0 };

    const title = `${month} 月末締め`;
    const existingGroup = await tx.queryOne(
      `SELECT id FROM invoice_groups
       WHERE project_id = ? AND deleted_at IS NULL AND status = 'draft' AND title = ?
       ORDER BY created_at DESC LIMIT 1`,
      [projectId, title]
    ) as { id: string } | undefined;

    let groupId = existingGroup?.id;
    if (!groupId) {
      groupId = uuidv4();
      await tx.execute(
        `INSERT INTO invoice_groups (id, project_id, title, invoice_date, created_by) VALUES (?, ?, ?, ?, ?)`,
        [groupId, projectId, title, `${month}-01`, req.user!.id]
      );
    }
    for (const epId of finalIds) {
      await tx.execute(
        'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
        [groupId, epId]
      );
    }
    return { groupId, addedCount: finalIds.length };
  });

  if (!result.groupId) {
    return res.json({
      success: true,
      data: null,
      message: '対象の回がありません（完了した回が無いか、既に他の請求グループへ割り当て済みです）',
    });
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [result.groupId]
  );
  res.status(201).json({
    success: true,
    data: row,
    message: `${result.addedCount}件の回を請求グループに追加しました`,
  });
});

export default router;
