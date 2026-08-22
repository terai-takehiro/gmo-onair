/**
 * 番組（マニュアル・案件管理外）— `qsheet_programs` の CRUD。
 *
 * 制作技術支援トップの2つ目の選び方（案件管理に無い、この画面だけの番組）の受け皿。
 * 進行台本・スケジュール表・収録設定・配信設定は `program_id` でここへ紐づく
 * （migration 227・`device-settings-owner.ts` の `Owner` 型）。
 *
 * ⚠️ 行単位の権限は持たない（案件と同じ作法 — `qsheet` 区画の reader 以上なら全件見える。
 * `device-settings-owner.ts` 冒頭のコメント参照）。
 */
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

const MAX_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;

function sanitizeSearch(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  return input.slice(0, 100).replace(/[%_\\]/g, '\\$&');
}

function sanitizeDate(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

// ============================================================
// 一覧（検索つき）
// ============================================================
router.get('/programs', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT p.id, p.name, to_char(p.event_date, 'YYYY-MM-DD') AS event_date, p.notes,
             p.created_at, p.updated_at, u.name AS creator_name
      FROM qsheet_programs p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.deleted_at IS NULL
    `;
    const params: unknown[] = [];
    let i = 1;
    const safeSearch = sanitizeSearch(search);
    if (safeSearch) {
      sql += ` AND p.name ILIKE $${i++} ESCAPE '\\'`;
      params.push(`%${safeSearch}%`);
    }
    sql += ' ORDER BY p.event_date DESC NULLS LAST, p.created_at DESC LIMIT 100';

    const rows = await queryAll(sql, params);
    res.json({ success: true, data: rows });
  } catch (err: unknown) {
    console.error('GET /programs error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 1件取得
// ============================================================
router.get('/programs/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `SELECT p.id, p.name, to_char(p.event_date, 'YYYY-MM-DD') AS event_date, p.notes,
              p.created_at, p.updated_at, u.name AS creator_name
       FROM qsheet_programs p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '番組が見つかりません' } });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('GET /programs/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 作成
// ============================================================
router.post('/programs', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const { name, event_date, notes } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '番組名は必須です' } });
      return;
    }
    const safeDate = sanitizeDate(event_date);
    const id = uuid();
    await execute(
      `INSERT INTO qsheet_programs (id, name, event_date, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [id, name.trim().slice(0, MAX_NAME_LENGTH), safeDate, typeof notes === 'string' ? notes.slice(0, MAX_NOTES_LENGTH) : null, req.user!.id]
    );
    const row = await queryOne(
      `SELECT id, name, to_char(event_date, 'YYYY-MM-DD') AS event_date, notes, created_at, updated_at
       FROM qsheet_programs WHERE id = $1`,
      [id]
    );
    res.status(201).json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('POST /programs error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 更新
// ============================================================
router.put('/programs/:id', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM qsheet_programs WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '番組が見つかりません' } });
      return;
    }
    const { name, event_date, notes } = req.body as Record<string, unknown>;
    const sets: string[] = ['updated_by = $1', 'updated_at = NOW()'];
    const params: unknown[] = [req.user!.id];
    let i = 2;
    if (typeof name === 'string' && name.trim()) { sets.push(`name = $${i++}`); params.push(name.trim().slice(0, MAX_NAME_LENGTH)); }
    if ('event_date' in req.body) { sets.push(`event_date = $${i++}`); params.push(sanitizeDate(event_date)); }
    if ('notes' in req.body) { sets.push(`notes = $${i++}`); params.push(typeof notes === 'string' ? notes.slice(0, MAX_NOTES_LENGTH) : null); }

    await execute(`UPDATE qsheet_programs SET ${sets.join(', ')} WHERE id = $${i}`, [...params, req.params.id]);
    const row = await queryOne(
      `SELECT id, name, to_char(event_date, 'YYYY-MM-DD') AS event_date, notes, created_at, updated_at
       FROM qsheet_programs WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('PUT /programs/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
