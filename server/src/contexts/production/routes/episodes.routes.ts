import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { generateEpisodeCode, getNextEpisodeNumber } from '../../../shared/services/sequence.service';
import { generateBillingKey } from '../../../shared/services/billing-key.service';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// v4 フォーム（BroadcastSection.tsx）は複数選択をカンマ結合した文字列
// （例: "live,recording"）として projects.broadcast_type に保存するため、
// 完全一致ではなくカンマ区切りの中に対象値が含まれるかで判定する
// （旧実装は `=== 'live'` の完全一致で、複数選択の案件では黙って外れていた）。
function broadcastTypeIncludes(broadcastType: string | null | undefined, value: string): boolean {
  return (broadcastType ?? '').split(',').map((s) => s.trim()).includes(value);
}

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// List episodes for a project
router.get('/:projectId/episodes', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.params.projectId;

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  let where = 'WHERE e.project_id = ? AND e.deleted_at IS NULL';
  const params: unknown[] = [projectId];

  if (search) {
    where += ' AND (e.episode_code ILIKE ? OR e.title ILIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM episodes e ${where}`, params)) as any).c;

  // **タスクの進み具合を2本の数で持つ。** v4 のタスクタブに「回」の簡易一覧
  // （旧「エピソード」タブ）を移したときに追加。フラグではなく件数にするのは、
  // 完了かどうかの正が `is_completed`（migration 137）で、割合はここで
  // 出し直せば足りるため（別の判定を持つと `taskState()` とずれる）
  const rows = await queryAll(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost,
      (SELECT COUNT(*) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as revenue_count,
      (SELECT COUNT(*) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as purchase_count,
      (SELECT COUNT(*) FROM project_tasks WHERE episode_id = e.id AND deleted_at IS NULL AND parent_task_id IS NULL) as task_count,
      (SELECT COUNT(*) FROM project_tasks WHERE episode_id = e.id AND deleted_at IS NULL AND parent_task_id IS NULL AND is_completed = true) as task_done_count
    FROM episodes e
    ${where}
    ORDER BY e.episode_number ASC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, total, page, limit));
});

// Get single episode
router.get('/:projectId/episodes/:id', async (req, res) => {
  const row = await queryOne(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost
    FROM episodes e
    WHERE e.id = ? AND e.project_id = ? AND e.deleted_at IS NULL`,
    [req.params.id, req.params.projectId]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');
  res.json({ success: true, data: row });
});

// Batch create episodes
router.post('/:projectId/episodes/batch', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId as string;
  const { count, order_date, notes, revenue_budget_per_episode } = req.body;

  if (!count || count < 1) throw new AppError(400, 'VALIDATION_ERROR', '作成数は1以上を指定してください');
  if (count > 100) throw new AppError(400, 'VALIDATION_ERROR', '一度に作成できるのは100件までです');

  const project = await queryOne('SELECT gls_number, customer_id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const customerId = project.customer_id;
  const nextNum = await getNextEpisodeNumber(projectId);
  const createdEpisodes: unknown[] = [];

  const startEp = nextNum;
  const endEp = nextNum + count - 1;
  const revPerEp = revenue_budget_per_episode || 0;

  // Create episode_orders record
  const orderId = uuidv4();
  const today = order_date || new Date().toISOString().split('T')[0];
  await execute(
    `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, projectId, today, count, startEp, endEp, notes || null, req.user!.id]
  );

  for (let i = 0; i < count; i++) {
    const episodeNumber = nextNum + i;
    const episodeCode = generateEpisodeCode(project.gls_number, episodeNumber);
    const id = uuidv4();

    await execute(
      `INSERT INTO episodes (id, project_id, episode_code, episode_number, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, episodeCode, episodeNumber, req.user!.id]
    );

    // Create revenue record for this episode
    if (revPerEp > 0) {
      const revId = uuidv4();
      const billingKey = generateBillingKey(episodeCode, 'tax10');
      await execute(
        `INSERT INTO revenues (id, billing_key, project_id, episode_id, customer_id, assigned_to, tax_category, amount, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'tax10', ?, ?, ?)`,
        [revId, billingKey, projectId, id, customerId, req.user!.id, revPerEp, '発注時按分', req.user!.id]
      );
    }

    const row = await queryOne('SELECT * FROM episodes WHERE id = ?', [id]);
    createdEpisodes.push(row);
  }

  res.status(201).json({ success: true, data: createdEpisodes });
});

// 月次ユニットを1件作成 (ビジネス案件の月締め請求単位)。
// エピソードを「月」として流用し、コードは {GLS}-{YYMM} (例: GLS-B001-2607) にする。
// 通常案件の話数エピソードと同じ episodes テーブルを使うため、売上/請求書/見積書は
// 既存の episode_id 連携をそのまま利用できる (1 月 = 1 請求単位)。
router.post('/:projectId/episodes/month', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId as string;
  const yearMonth = String(req.body?.year_month || '').trim(); // 'YYYY-MM'
  const m = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new AppError(400, 'VALIDATION_ERROR', '対象月は YYYY-MM 形式で指定してください');
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new AppError(400, 'VALIDATION_ERROR', '月は 01〜12 で指定してください');

  const project = await queryOne('SELECT gls_number FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (!project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'GLS発番後に月次ユニットを作成できます');

  const yymm = `${m[1].slice(2)}${m[2]}`;            // 2026-07 → 2607
  const episodeCode = `${project.gls_number}-${yymm}`; // GLS-B001-2607
  const episodeNumber = Number(`${m[1].slice(2)}${m[2]}`); // 2607 (時系列で並ぶ)
  const title = `${year}年${month}月`;

  // 冪等: 同じ月が既にあればそれを返す (二重作成しない)
  const existing = await queryOne(
    'SELECT * FROM episodes WHERE project_id = ? AND episode_code = ? AND deleted_at IS NULL',
    [projectId, episodeCode],
  );
  if (existing) { res.json({ success: true, data: existing, existed: true }); return; }

  const id = uuidv4();
  await execute(
    `INSERT INTO episodes (id, project_id, episode_code, episode_number, title, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, projectId, episodeCode, episodeNumber, title, req.user!.id],
  );
  const row = await queryOne('SELECT * FROM episodes WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// Update episode
router.put('/:projectId/episodes/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT e.id FROM episodes e WHERE e.id = ? AND e.project_id = ? AND e.deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  const {
    title, recording_date, broadcast_date, status,
    notes
  } = req.body;

  // For live broadcasts, recording_date also sets broadcast_date
  let finalBroadcastDate = broadcast_date || null;
  if (recording_date) {
    const project = await queryOne(
      'SELECT broadcast_type FROM projects WHERE id = ? AND deleted_at IS NULL',
      [req.params.projectId]
    ) as any;
    if (project && broadcastTypeIncludes(project.broadcast_type, 'live')) {
      finalBroadcastDate = recording_date;
    }
  }

  await execute(
    `UPDATE episodes SET
      title = ?, recording_date = ?, broadcast_date = ?, status = ?,
      notes = ?,
      updated_at = NOW(), updated_by = ?
    WHERE id = ?`,
    [
      title || null, recording_date || null, finalBroadcastDate,
      status || null,
      notes || null, req.user!.id, req.params.id
    ]
  );

  const row = await queryOne(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost
    FROM episodes e WHERE e.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete episode
router.delete('/:projectId/episodes/:id', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM episodes WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  await execute(
    `UPDATE episodes SET deleted_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
