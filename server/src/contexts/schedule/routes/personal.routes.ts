import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { encrypt, decrypt, mask } from '../../liveops/crypto';
import { syncFeedById } from '../services/ics-sync.service';

// マイカレンダー (個人予定 + ICS 購読フィード) — 完全プライベート。
// 全エンドポイントは常に user_id = req.user.id でスコープするため、
// system_admin であっても他人の個人予定・フィードには一切アクセスできない
// (requirePermission の bypass は権限チェックのみで、データのスコープには効かない)。
// 権限: partner_schedule / editor (マイカレンダーの利用 = 記入を伴うため editor 基準)。

const router = Router();
const canUse = [requireAuth, requirePermission('partner_schedule', 'editor')] as const;

// ─── 個人予定 ────────────────────────────────────────────────────────────────

// 一覧 (?from=&to= 任意。TEXT 文字列比較の重なり判定)
router.get('/personal', ...canUse, async (req, res) => {
  let where = 'WHERE pe.user_id = ? AND pe.deleted_at IS NULL';
  const params: unknown[] = [req.user!.id];
  if (req.query.from) { where += ' AND substr(pe.end_time, 1, 10) >= ?'; params.push(String(req.query.from).slice(0, 10)); }
  if (req.query.to) { where += ' AND substr(pe.start_time, 1, 10) <= ?'; params.push(String(req.query.to).slice(0, 10)); }
  const rows = await queryAll(
    `SELECT pe.*, f.label AS feed_label
     FROM personal_events pe
     LEFT JOIN personal_ics_feeds f ON f.id = pe.feed_id
     ${where}
     ORDER BY pe.start_time`,
    params
  );
  res.json({ success: true, data: rows });
});

// 作成 (手入力のみ)
router.post('/personal', ...canUse, async (req, res) => {
  const { title, all_day, start_time, end_time, location, notes } = req.body ?? {};
  if (!title || !start_time || !end_time) throw new AppError(400, 'VALIDATION_ERROR', 'タイトル・開始・終了は必須です');
  const id = randomUUID();
  await execute(
    `INSERT INTO personal_events (id, user_id, title, all_day, start_time, end_time, location, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
    [id, req.user!.id, String(title).slice(0, 300), all_day ? 1 : 0, String(start_time), String(end_time),
     location ? String(location).slice(0, 300) : null, notes ? String(notes).slice(0, 1000) : null]
  );
  res.status(201).json({ success: true, data: await queryOne(`SELECT * FROM personal_events WHERE id = ?`, [id]) });
});

// 更新 (手入力のみ。ICS 同期分は Outlook/Google 側で編集してもらう)
router.put('/personal/:id', ...canUse, async (req, res) => {
  const existing = await queryOne(
    `SELECT * FROM personal_events WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [String(req.params.id), req.user!.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');
  if (existing.source === 'ics') throw new AppError(400, 'VALIDATION_ERROR', '同期された予定は編集できません (Outlook/Google 側で編集してください)');
  const b = req.body ?? {};
  await execute(
    `UPDATE personal_events SET title=?, all_day=?, start_time=?, end_time=?, location=?, notes=?, updated_at=NOW() WHERE id=?`,
    [b.title != null ? String(b.title).slice(0, 300) : existing.title,
     b.all_day != null ? (b.all_day ? 1 : 0) : existing.all_day,
     b.start_time != null ? String(b.start_time) : existing.start_time,
     b.end_time != null ? String(b.end_time) : existing.end_time,
     b.location !== undefined ? (b.location ? String(b.location).slice(0, 300) : null) : existing.location,
     b.notes !== undefined ? (b.notes ? String(b.notes).slice(0, 1000) : null) : existing.notes,
     existing.id]
  );
  res.json({ success: true, data: await queryOne(`SELECT * FROM personal_events WHERE id = ?`, [existing.id]) });
});

// 削除 (論理削除。ICS 同期分も削除可 — ただし次回同期で復活するためフィード側の削除を案内)
router.delete('/personal/:id', ...canUse, async (req, res) => {
  const existing = await queryOne(
    `SELECT id FROM personal_events WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [String(req.params.id), req.user!.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');
  await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE id=?`, [existing.id]);
  res.json({ success: true, data: { deleted: true } });
});

// ─── ICS 購読フィード ─────────────────────────────────────────────────────────

function feedForClient(row: any) {
  // URL は秘密情報のため復号したうえで末尾 4 文字だけマスク表示
  const url = decrypt(row.url_enc);
  return {
    id: row.id, label: row.label, enabled: !!row.enabled,
    url_masked: mask(url), last_synced_at: row.last_synced_at,
    last_error: row.last_error, event_count: row.event_count, created_at: row.created_at,
  };
}

// フィード一覧
router.get('/feeds', ...canUse, async (req, res) => {
  const rows = await queryAll(
    `SELECT * FROM personal_ics_feeds WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    [req.user!.id]) as any[];
  res.json({ success: true, data: rows.map(feedForClient) });
});

// フィード追加 (body: { label, url }) — 追加後すぐに初回同期を試みる
router.post('/feeds', ...canUse, async (req, res) => {
  const { label, url } = req.body ?? {};
  if (!label || !url) throw new AppError(400, 'VALIDATION_ERROR', 'ラベルと ICS URL は必須です');
  const normalized = String(url).trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https:\/\//i.test(normalized)) throw new AppError(400, 'VALIDATION_ERROR', 'https:// (または webcal://) で始まる公開 ICS URL を入力してください');

  let urlEnc: string;
  try {
    urlEnc = encrypt(normalized);
  } catch {
    throw new AppError(500, 'ENCRYPTION_UNAVAILABLE', 'サーバーの暗号化設定 (ENCRYPTION_KEY) が未構成のため保存できません。管理者に連絡してください');
  }

  const id = randomUUID();
  await execute(
    `INSERT INTO personal_ics_feeds (id, user_id, label, url_enc) VALUES (?, ?, ?, ?)`,
    [id, req.user!.id, String(label).slice(0, 100), urlEnc]
  );

  // 初回同期 (失敗しても登録自体は成立。エラーは last_error に記録されて一覧に出る)
  let sync: unknown = null;
  try { sync = await syncFeedById(id); } catch { /* last_error に記録済み */ }

  const row = await queryOne(`SELECT * FROM personal_ics_feeds WHERE id = ?`, [id]) as any;
  res.status(201).json({ success: true, data: { ...feedForClient(row), sync } });
});

// 手動即時同期
router.post('/feeds/:id/sync', ...canUse, async (req, res) => {
  const feed = await queryOne(
    `SELECT id FROM personal_ics_feeds WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [String(req.params.id), req.user!.id]) as any;
  if (!feed) throw new AppError(404, 'NOT_FOUND', 'フィードが見つかりません');
  try {
    const result = await syncFeedById(feed.id);
    res.json({ success: true, data: result });
  } catch (err) {
    throw new AppError(400, 'SYNC_FAILED', `同期に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// フィード削除 (同期済みの予定も一括 soft-delete)
router.delete('/feeds/:id', ...canUse, async (req, res) => {
  const feed = await queryOne(
    `SELECT id FROM personal_ics_feeds WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [String(req.params.id), req.user!.id]) as any;
  if (!feed) throw new AppError(404, 'NOT_FOUND', 'フィードが見つかりません');
  await execute(`UPDATE personal_ics_feeds SET deleted_at=NOW(), updated_at=NOW() WHERE id=?`, [feed.id]);
  await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE feed_id=? AND deleted_at IS NULL`, [feed.id]);
  res.json({ success: true, data: { deleted: true } });
});

export default router;
