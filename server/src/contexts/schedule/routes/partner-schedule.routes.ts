import { Router, Request } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { isReversedTimeRange } from '../../../shared/utils/timeRange';

// パートナー (従業員) スケジュール — 代休/有給/出張/社外活動 等をパートナー間で共有する。
// 権限モジュール 'sales'（旧 'partner_schedule'。権限モデル単純化で統合済み）の
// 保持者のみアクセス可能:
//   reader  = 閲覧のみ
//   editor  = 自分の予定を記入・編集・削除
//   manager = 他人の予定も記入・編集・削除 (総務等の代理入力を想定)
// system_admin は requirePermission を bypass するため常にアクセス可能 (manager 相当)。

const SCHEDULE_TYPES = ['daikyu', 'paid_leave', 'business_trip', 'external', 'remote', 'other'];

const router = Router();
const canRead = [requireAuth, requirePermission('sales', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('sales', 'editor')] as const;

/** 他人の予定を操作できるか (manager 以上 or system_admin) */
function isManager(req: Request): boolean {
  if (req.user?.role === 'system_admin') return true;
  const level = req.user?.permissions?.['sales'];
  return level === 'manager' || level === 'owner';
}

// 一覧 (?from=&to=&user_id= すべて任意。from/to は YYYY-MM-DD の重なり判定・TEXT 文字列比較)
router.get('/partner', ...canRead, async (req, res) => {
  let where = 'WHERE ps.deleted_at IS NULL';
  const params: unknown[] = [];
  if (req.query.from) { where += ' AND substr(ps.end_time, 1, 10) >= ?'; params.push(String(req.query.from).slice(0, 10)); }
  if (req.query.to) { where += ' AND substr(ps.start_time, 1, 10) <= ?'; params.push(String(req.query.to).slice(0, 10)); }
  if (req.query.user_id) { where += ' AND ps.user_id = ?'; params.push(String(req.query.user_id)); }
  const rows = await queryAll(
    `SELECT ps.*, u.name AS user_name
     FROM partner_schedules ps
     JOIN users u ON u.id = ps.user_id
     ${where}
     ORDER BY ps.start_time`,
    params
  );
  res.json({ success: true, data: rows });
});

// 作成 (editor は自分の予定のみ。user_id で他人を指定できるのは manager)
router.post('/partner', ...canEdit, async (req, res) => {
  const { schedule_type, title, all_day, start_time, end_time, notes } = req.body ?? {};
  const targetUserId = req.body?.user_id ? String(req.body.user_id) : req.user!.id;
  if (targetUserId !== req.user!.id && !isManager(req)) {
    throw new AppError(403, 'FORBIDDEN', '他のパートナーの予定を登録できるのは管理権限のみです');
  }
  if (!title || !start_time || !end_time) throw new AppError(400, 'VALIDATION_ERROR', 'タイトル・開始・終了は必須です');
  if (isReversedTimeRange(start_time, end_time)) throw new AppError(400, 'VALIDATION_ERROR', '終了は開始より後にしてください');
  const type = SCHEDULE_TYPES.includes(schedule_type) ? schedule_type : 'other';
  const target = await queryOne(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL`, [targetUserId]);
  if (!target) throw new AppError(400, 'VALIDATION_ERROR', '対象ユーザーが見つかりません');

  const id = randomUUID();
  await execute(
    `INSERT INTO partner_schedules (id, user_id, schedule_type, title, all_day, start_time, end_time, notes, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, targetUserId, type, String(title).slice(0, 300), all_day === false ? 0 : 1,
     String(start_time), String(end_time), notes ? String(notes).slice(0, 1000) : null,
     req.user!.id, req.user!.id]
  );
  const row = await queryOne(
    `SELECT ps.*, u.name AS user_name FROM partner_schedules ps JOIN users u ON u.id = ps.user_id WHERE ps.id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
});

// 更新 (editor は自分の行のみ / manager は全行。user_id の付け替えも manager のみ)
router.put('/partner/:id', ...canEdit, async (req, res) => {
  const existing = await queryOne(
    `SELECT * FROM partner_schedules WHERE id = ? AND deleted_at IS NULL`, [String(req.params.id)]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');
  if (existing.user_id !== req.user!.id && !isManager(req)) {
    throw new AppError(403, 'FORBIDDEN', '他のパートナーの予定を編集できるのは管理権限のみです');
  }
  const b = req.body ?? {};
  const targetUserId = b.user_id ? String(b.user_id) : existing.user_id;
  if (targetUserId !== existing.user_id && !isManager(req)) {
    throw new AppError(403, 'FORBIDDEN', '予定の対象者を変更できるのは管理権限のみです');
  }
  const type = SCHEDULE_TYPES.includes(b.schedule_type) ? b.schedule_type : existing.schedule_type;
  // **渡さなかった側は今の値のまま**で比べる（終了だけ延ばす部分更新が既存の
  // 開始と比べずに通らないように）
  const effectiveStart = b.start_time != null ? String(b.start_time) : String(existing.start_time);
  const effectiveEnd = b.end_time != null ? String(b.end_time) : String(existing.end_time);
  if (isReversedTimeRange(effectiveStart, effectiveEnd)) {
    throw new AppError(400, 'VALIDATION_ERROR', '終了は開始より後にしてください');
  }
  await execute(
    `UPDATE partner_schedules SET user_id=?, schedule_type=?, title=?, all_day=?, start_time=?, end_time=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [targetUserId, type,
     b.title != null ? String(b.title).slice(0, 300) : existing.title,
     b.all_day != null ? (b.all_day ? 1 : 0) : existing.all_day,
     effectiveStart,
     effectiveEnd,
     b.notes !== undefined ? (b.notes ? String(b.notes).slice(0, 1000) : null) : existing.notes,
     req.user!.id, existing.id]
  );
  const row = await queryOne(
    `SELECT ps.*, u.name AS user_name FROM partner_schedules ps JOIN users u ON u.id = ps.user_id WHERE ps.id = ?`, [existing.id]);
  res.json({ success: true, data: row });
});

// 削除 (論理削除。editor は自分の行のみ / manager は全行)
router.delete('/partner/:id', ...canEdit, async (req, res) => {
  const existing = await queryOne(
    `SELECT id, user_id FROM partner_schedules WHERE id = ? AND deleted_at IS NULL`, [String(req.params.id)]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');
  if (existing.user_id !== req.user!.id && !isManager(req)) {
    throw new AppError(403, 'FORBIDDEN', '他のパートナーの予定を削除できるのは管理権限のみです');
  }
  await execute(`UPDATE partner_schedules SET deleted_at=NOW(), updated_by=? WHERE id=?`, [req.user!.id, existing.id]);
  res.json({ success: true, data: { deleted: true } });
});

export default router;
