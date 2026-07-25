import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { QSHEET_STATUS } from '../../../shared/constants/statuses';
import { isQsheetAdmin, canAccessDoc } from '../access';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('qsheet'));

// Input validation helpers
const MAX_TITLE_LENGTH = 500;
const MAX_SEARCH_LENGTH = 100;
// 値は migration 012_qsheet_schema.sql の CHECK 制約と完全一致 (constants から派生)
const VALID_STATUSES: string[] = Object.values(QSHEET_STATUS);

function sanitizeSearch(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // Escape LIKE special characters to prevent pattern injection
  return input.slice(0, MAX_SEARCH_LENGTH).replace(/[%_\\]/g, '\\$&');
}

// ============================================================
// ドキュメント一覧
// ============================================================
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const { status, episode_id, project_id, search } = req.query;
    let sql = `
      SELECT d.*, u.name as creator_name,
             p.name as project_name, p.gls_number,
             (SELECT COUNT(*) FROM qsheet_document_shares s WHERE s.document_id = d.id)::int as share_count
      FROM qsheet_documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN projects p ON d.project_id = p.id
      WHERE d.deleted_at IS NULL
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    // 管理者以外は 自分が作成 / 自分に共有された / **案件メンバーである案件のもの**。
    // 一覧と canAccessDoc は同じ条件でなければならない
    // (一覧に出ないのに開ける、逆に出るのに開けない が起きる)。
    if (!isQsheetAdmin(req.user!)) {
      sql += ` AND (
                 d.created_by = $${paramIndex}
                 OR EXISTS (
                   SELECT 1 FROM qsheet_document_shares s
                   WHERE s.document_id = d.id AND s.user_id = $${paramIndex}
                 )
                 OR (d.project_id IS NOT NULL AND p.deleted_at IS NULL AND (
                   p.assigned_to = $${paramIndex}
                   OR EXISTS (
                     SELECT 1 FROM project_members pm
                     WHERE pm.project_id = d.project_id AND pm.user_id = $${paramIndex}
                       AND pm.deleted_at IS NULL
                   )
                 ))
               )`;
      params.push(req.user!.id);
      paramIndex++;
    }

    if (status && typeof status === 'string' && VALID_STATUSES.includes(status)) {
      sql += ` AND d.status = $${paramIndex++}`;
      params.push(status);
    }
    if (episode_id && typeof episode_id === 'string') {
      sql += ` AND d.episode_id = $${paramIndex++}`;
      params.push(episode_id);
    }
    if (project_id && typeof project_id === 'string') {
      sql += ` AND d.project_id = $${paramIndex++}`;
      params.push(project_id);
    }
    if (search) {
      const safe = sanitizeSearch(search);
      if (safe) {
        sql += ` AND d.title ILIKE $${paramIndex++} ESCAPE '\\'`;
        params.push(`%${safe}%`);
      }
    }

    sql += ' ORDER BY d.updated_at DESC LIMIT 200';

    const rows = await queryAll(sql, params);
    res.json({ success: true, data: rows });
  } catch (err: unknown) {
    console.error('GET /documents error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// ドキュメント取得
// ============================================================
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `SELECT d.*, u.name as creator_name
       FROM qsheet_documents d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    // アクセス権チェック (作成者 / 共有先 / 管理者のみ)。存在を秘匿するため 404 を返す
    if (!(await canAccessDoc(req.user!, row.id as string, (row.created_by as string) ?? null))) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('GET /documents/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// ドキュメント作成
// ============================================================
router.post('/documents', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const id = uuid();
    const { title, data, episode_id, project_id, broadcast_date, episode_code } = req.body;

    // Validate title length
    const safeTitle = typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '';

    // Validate data is an object
    const safeData = (data && typeof data === 'object') ? data : {};

    await execute(
      `INSERT INTO qsheet_documents (id, title, data, episode_id, project_id, broadcast_date, episode_code, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $8)`,
      [id, safeTitle, JSON.stringify(safeData), episode_id || null, project_id || null, broadcast_date || null, episode_code || null, req.user!.id]
    );

    const row = await queryOne('SELECT * FROM qsheet_documents WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('POST /documents error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// ドキュメント更新
// ============================================================
router.put('/documents/:id', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne(
      `SELECT d.id, d.created_by, d.updated_at, d.updated_by, u.name as updater_name
       FROM qsheet_documents d LEFT JOIN users u ON d.updated_by = u.id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    // アクセス権チェック (作成者 / 共有先 / 管理者のみ編集可)
    if (!(await canAccessDoc(req.user!, existing.id as string, (existing.created_by as string) ?? null))) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }

    // 楽観ロック: クライアントが読み込んだ時点の updated_at を送ってきた場合、
    // DB の updated_at と異なれば「他のユーザーが先に保存した」として 409 を返す
    // (同時編集での黙った上書き合戦を防止。expected_updated_at 未送信の旧クライアントは従来どおり)
    const { expected_updated_at } = req.body as { expected_updated_at?: unknown };
    if (typeof expected_updated_at === 'string' && expected_updated_at) {
      const expectedMs = new Date(expected_updated_at).getTime();
      const currentMs = new Date(existing.updated_at as string).getTime();
      if (Number.isFinite(expectedMs) && Number.isFinite(currentMs) && expectedMs !== currentMs) {
        const isSelf = (existing.updated_by as string) === req.user!.id;
        res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: isSelf
              ? 'このシートは別のタブ/端末で更新されています。最新の内容を読み込み直してください。'
              : `このシートは ${existing.updater_name || '他のユーザー'} さんが先に更新しました。上書きを防ぐため保存を中止しました。`,
            current_updated_at: existing.updated_at,
            updated_by_name: existing.updater_name || null,
          },
        });
        return;
      }
    }

    const { title, data, episode_id, project_id, broadcast_date, episode_code, status } = req.body;

    const safeTitle = typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '';
    const safeStatus = (typeof status === 'string' && VALID_STATUSES.includes(status)) ? status : 'draft';
    const safeData = (data && typeof data === 'object') ? data : {};

    await execute(
      `UPDATE qsheet_documents
       SET title = $1, data = $2, episode_id = $3, project_id = $4,
           broadcast_date = $5, episode_code = $6, status = $7,
           updated_by = $8, updated_at = NOW()
       WHERE id = $9`,
      [safeTitle, JSON.stringify(safeData), episode_id || null, project_id || null, broadcast_date || null, episode_code || null, safeStatus, req.user!.id, req.params.id]
    );

    const row = await queryOne('SELECT * FROM qsheet_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('PUT /documents/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// ドキュメント削除 (ソフトデリート)
// ============================================================
router.delete('/documents/:id', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    // 削除できるのは作成者本人または管理者のみ (共有先は削除不可)
    if (!isQsheetAdmin(req.user!) && (existing.created_by as string) !== req.user!.id) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'このドキュメントを削除する権限がありません' } });
      return;
    }

    await execute(
      'UPDATE qsheet_documents SET deleted_at = NOW(), updated_by = $1 WHERE id = $2',
      [req.user!.id, req.params.id]
    );

    res.json({ success: true, data: { id: req.params.id } });
  } catch (err: unknown) {
    console.error('DELETE /documents/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 共有ユーザー候補一覧 (共有ピッカー用 / 本番でも利用可)
//   - qsheet 権限を持つ認証ユーザーなら誰でも候補一覧を取得できる
// ============================================================
router.get('/share-users', async (req: Request, res: Response) => {
  try {
    const rows = await queryAll(
      `SELECT id, name, email FROM users
       WHERE deleted_at IS NULL AND id <> $1
       ORDER BY name`,
      [req.user!.id]
    );
    res.json({ success: true, data: rows });
  } catch (err: unknown) {
    console.error('GET /share-users error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// ドキュメントの共有先一覧 (作成者 / 管理者のみ)
// ============================================================
router.get('/documents/:id/shares', async (req: Request, res: Response) => {
  try {
    const doc = await queryOne('SELECT id, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!doc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    // 共有設定を見られるのは作成者または管理者のみ
    if (!isQsheetAdmin(req.user!) && (doc.created_by as string) !== req.user!.id) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '共有設定を閲覧する権限がありません' } });
      return;
    }
    const rows = await queryAll(
      `SELECT s.user_id, u.name, u.email
       FROM qsheet_document_shares s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.document_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err: unknown) {
    console.error('GET /documents/:id/shares error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// ドキュメントの共有先を設定 (作成者 / 管理者のみ)
//   body: { user_ids: string[] } — 渡された一覧で完全置き換え
// ============================================================
router.put('/documents/:id/shares', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const doc = await queryOne('SELECT id, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!doc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    // 共有設定を変更できるのは作成者または管理者のみ
    if (!isQsheetAdmin(req.user!) && (doc.created_by as string) !== req.user!.id) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '共有設定を変更する権限がありません' } });
      return;
    }

    const { user_ids } = req.body as { user_ids?: unknown };
    const ownerId = (doc.created_by as string) ?? null;
    // 入力を正規化: 文字列のみ / 重複排除 / 作成者本人は除外 (自分には共有不要)
    const requested = Array.isArray(user_ids)
      ? Array.from(new Set(user_ids.filter((u): u is string => typeof u === 'string' && u.length > 0)))
          .filter((u) => u !== ownerId)
      : [];

    // 実在する (削除されていない) ユーザーのみに絞り込む
    let validIds: string[] = [];
    if (requested.length > 0) {
      const placeholders = requested.map((_, i) => `$${i + 1}`).join(', ');
      const found = await queryAll(
        `SELECT id FROM users WHERE deleted_at IS NULL AND id IN (${placeholders})`,
        requested
      );
      validIds = found.map((r) => r.id as string);
    }

    // 完全置き換え: 既存を削除 → 新規を挿入
    await execute('DELETE FROM qsheet_document_shares WHERE document_id = $1', [req.params.id]);
    for (const uid of validIds) {
      await execute(
        `INSERT INTO qsheet_document_shares (document_id, user_id, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (document_id, user_id) DO NOTHING`,
        [req.params.id, uid, req.user!.id]
      );
    }

    const rows = await queryAll(
      `SELECT s.user_id, u.name, u.email
       FROM qsheet_document_shares s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.document_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err: unknown) {
    console.error('PUT /documents/:id/shares error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// エピソード検索 (ドキュメント紐付け用)
// ============================================================
router.get('/episodes', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT e.id, e.episode_code, e.title, e.broadcast_date, p.name as project_name
      FROM episodes e
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      const safe = sanitizeSearch(search);
      if (safe) {
        sql += ` AND (e.title ILIKE $${paramIndex} OR e.episode_code ILIKE $${paramIndex}) ESCAPE '\\'`;
        params.push(`%${safe}%`);
        paramIndex++;
      }
    }

    sql += ' ORDER BY e.broadcast_date DESC LIMIT 50';

    const rows = await queryAll(sql, params);
    res.json({ success: true, data: rows });
  } catch (err: unknown) {
    console.error('GET /episodes error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
