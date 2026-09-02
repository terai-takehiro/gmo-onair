import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

/**
 * 呼び出し側が渡した episode_ids を検証して、重複を除いた一覧を返す。
 * invoice_group_episodes の FK は「回が存在する」ことしか見ないため、
 * **その案件の回であること**はアプリ側で必ず確認する（他案件の回が混ざると
 * 売上合算がその案件に化け、本来の案件の月末締めからも永久に外れる）。
 * 重複は PK 違反の生 500 になるので先に落とす。
 */
async function validateEpisodeIds(episodeIds: unknown[], projectId: string): Promise<string[]> {
  const ids = [...new Set(episodeIds)] as string[];
  if (ids.length === 0) return ids;
  const valid = await queryAll(
    'SELECT id FROM episodes WHERE id = ANY(?::text[]) AND project_id = ? AND deleted_at IS NULL',
    [ids, projectId]
  );
  if (valid.length !== ids.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'この案件に属さない回が含まれています');
  }
  return ids;
}

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
  // ⚠️ 契約一括（migration 265）は回に金額を持たせないため、この合算は常に0になる。
  // `COALESCE(ig.lump_sum_amount, 合算, 0)` で、lump_sum_amount がある行はそちらを優先する。
  // ⚠️ 合算は確定 (status='confirmed') の売上のみ。見積段階の行を足すと請求書HTMLと
  // 食い違う（migration 138 のバグクラス「revenues を読む箇所が status を見ていない」・全6箇所同じ形）。
  const rows = await queryAll(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      COALESCE(ig.lump_sum_amount, (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.status = 'confirmed' AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id), 0) as total_amount
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
  const projectId = req.params.projectId as string;
  const { title, invoice_date, episode_ids } = req.body;

  if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  // ⚠️ FK は「回が存在する」しか保証しない — 他案件の回を紐づけると、その案件の売上が
  // このグループの合算に混ざる上、本来の案件の月末締めから永久に外れる。必ず案件で検証する
  const episodeIds = episode_ids && Array.isArray(episode_ids)
    ? await validateEpisodeIds(episode_ids, projectId)
    : [];

  const id = uuidv4();
  await execute(
    `INSERT INTO invoice_groups (id, project_id, title, invoice_date, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, projectId, title, invoice_date || null, req.user!.id]
  );

  // Link episodes if provided
  for (const episodeId of episodeIds) {
    await execute(
      'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
      [id, episodeId]
    );
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      COALESCE(ig.lump_sum_amount, (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.status = 'confirmed' AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id), 0) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [id]
  );
  res.status(201).json({ success: true, data: row });
});

// Update invoice group
router.put('/:projectId/invoice-groups/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id, title, invoice_date, notes FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  ) as { id: string; title: string; invoice_date: string | null; notes: string | null } | undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  const { title, invoice_date, notes } = req.body;

  // **渡さなければ今の値を保つ**（部分更新の原則）。title は NOT NULL なので
  // 空文字で消す操作は受けず 400 を返す（POST の必須チェックと同じ文言）
  if (title !== undefined && !title) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');

  await execute(
    `UPDATE invoice_groups SET
      title = ?, invoice_date = ?, notes = ?,
      updated_at = NOW(), updated_by = ?
    WHERE id = ?`,
    [
      title !== undefined ? title : existing.title,
      invoice_date !== undefined ? (invoice_date || null) : existing.invoice_date,
      notes !== undefined ? (notes || null) : existing.notes,
      req.user!.id,
      req.params.id,
    ]
  );

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      COALESCE(ig.lump_sum_amount, (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.status = 'confirmed' AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id), 0) as total_amount
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

  // 検証は DELETE より前に行う — 失敗したリクエストが既存の紐付けを壊さないため
  const episodeIds = await validateEpisodeIds(episode_ids, req.params.projectId as string);

  // Delete existing links
  await execute('DELETE FROM invoice_group_episodes WHERE invoice_group_id = ?', [req.params.id]);

  // Insert new links
  for (const episodeId of episodeIds) {
    await execute(
      'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
      [req.params.id, episodeId]
    );
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      COALESCE(ig.lump_sum_amount, (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.status = 'confirmed' AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id), 0) as total_amount
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
  // ⚠️ 既にどこかの請求グループ（削除されていないもの）に紐づいた回は対象から外す
  // （auto-monthly-close と同じ不変条件）。外さないと、手動グループや月末締めで
  // 請求済みの回がもう一度日付グループに入り、二重請求になる。
  const dateGroups = await queryAll(
    `SELECT recording_date, string_agg(id, ',') as episode_ids, COUNT(*) as cnt
     FROM episodes
     WHERE project_id = ? AND deleted_at IS NULL AND recording_date IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM invoice_group_episodes ige
         JOIN invoice_groups ig ON ig.id = ige.invoice_group_id AND ig.deleted_at IS NULL
         WHERE ige.episode_id = episodes.id
       )
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
          -- completed_at は UTC の壁時計（new Date().toISOString()・TZ 未設定）で入る
          -- timestamp without time zone。month は JST の営業月なので、UTC として読んで
          -- JST に直してから月を取る（JST 00:00〜08:59 の完了が前月に入らないように）
          AND to_char(MAX(pt.completed_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM') = ?
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
      COALESCE(ig.lump_sum_amount, (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.status = 'confirmed' AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id), 0) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [result.groupId]
  );
  res.status(201).json({
    success: true,
    data: row,
    message: `${result.addedCount}件の回を請求グループに追加しました`,
  });
});

// Create/extend the single contract-lump-sum invoice group for a project
// （regular-series.md §3・§6・§10-3: billing_cycle='contract_lump_sum' 案件の請求まとめ）
//
// 契約一括は「案件に1枚。回には金額を持たせない」（§6）ので、他の2サイクルと違い
// episode_ids は一切紐付けず、金額は請求グループ自身の lump_sum_amount（migration 265）
// にそのまま持たせる。
//
// ⚠️ **冪等にする**: 既に `lump_sum_amount` を持つ draft の請求グループがあれば
// それを更新する（同じ案件で二度押しても2枚できない）。判定に title を使わないのは、
// title は呼び出し側が毎回変えられる値で、変わった瞬間に「別のグループ」と誤認して
// 二重に作ってしまうため——`lump_sum_amount IS NOT NULL` が「これは契約一括の
// 請求グループである」という専用の目印になる（他の2サイクルはこの列を触らないので
// 衝突しない）。発行済み（sent/paid）は一切触れない——月末締めの同時実行対策
// （§10-7・上のエンドポイント）と同じ考え方で、請求書を発行したあとは金額を動かさない。
router.post('/:projectId/invoice-groups/lump-sum', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId;
  const { title, invoice_date, amount } = req.body as { title?: string; invoice_date?: string; amount?: number };

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'amount は0以上の数値で指定してください');
  }

  const project = await queryOne(
    'SELECT id, billing_cycle FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId]
  ) as { id: string; billing_cycle: string } | undefined;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (project.billing_cycle !== 'contract_lump_sum') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `この案件の請求サイクルは「契約一括」ではありません（現在: ${project.billing_cycle}）`
    );
  }

  const existing = await queryOne(
    `SELECT id FROM invoice_groups
     WHERE project_id = ? AND deleted_at IS NULL AND status = 'draft' AND lump_sum_amount IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [projectId]
  ) as { id: string } | undefined;

  let groupId = existing?.id;
  if (groupId) {
    // **渡さなければ今の値を保つ**（title・invoice_date は部分更新の原則どおり）。amount は必須なので常に更新する
    await execute(
      `UPDATE invoice_groups SET
        lump_sum_amount = ?, title = COALESCE(?, title), invoice_date = COALESCE(?, invoice_date),
        updated_at = NOW(), updated_by = ?
      WHERE id = ?`,
      [amount, title || null, invoice_date || null, req.user!.id, groupId]
    );
  } else {
    groupId = uuidv4();
    await execute(
      `INSERT INTO invoice_groups (id, project_id, title, invoice_date, lump_sum_amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [groupId, projectId, title || '契約一括', invoice_date || null, amount, req.user!.id]
    );
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      COALESCE(ig.lump_sum_amount, (SELECT COALESCE(SUM(r.amount),0) FROM invoice_group_episodes ige
       JOIN revenues r ON r.episode_id = ige.episode_id AND r.status = 'confirmed' AND r.deleted_at IS NULL
       WHERE ige.invoice_group_id = ig.id), 0) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [groupId]
  );
  res.status(existing ? 200 : 201).json({
    success: true,
    data: row,
    message: existing ? '契約一括の金額を更新しました' : '契約一括の請求グループを作成しました',
  });
});

export default router;
