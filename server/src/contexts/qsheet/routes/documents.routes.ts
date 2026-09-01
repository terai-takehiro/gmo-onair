import { Router, Request, Response } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { QSHEET_STATUS } from '../../../shared/constants/statuses';
import { isQsheetAdmin, canAccessDoc } from '../access';
import { createDocument } from '../services/document-create.service';

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

// `scope` クエリの許容値。`mine`/`shared` は役割に関わらず絞り込む。
// `all` および未指定は既定の挙動（管理者は無条件・それ以外は自分が作成/共有された分のみ）を保つ
// （03-app-structure-impl.md §7-2「既定の挙動は今のまま」）。
const VALID_SCOPES = ['mine', 'shared', 'all'] as const;
type DocScope = (typeof VALID_SCOPES)[number];

function sanitizeDate(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // broadcast_date は DATE 列。書式が違うと Postgres がエラーを返す (500) ので、
  // 形が合わないものはサイレントに無視する (sanitizeSearch と同じ作法)
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

// ============================================================
// ドキュメント一覧
// ============================================================
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const { status, episode_id, project_id, program_id, search, date, scope } = req.query;
    // ⚠️ `d.*` にしないこと。`data` JSONB は台本全体（sections/rows/cells）を抱えており、
    // LIMIT 200 の一覧で全文を返すと数十MBになりうる。一覧が使うのは meta だけなので
    // `jsonb_build_object('meta', ...)` で形（`doc.data?.meta`）を保ったまま meta だけ返す。
    // 全文が要る編集画面は GET /documents/:id が返す。
    let sql = `
      SELECT d.id, d.doc_no, d.title, d.episode_id, d.project_id, d.program_id,
             d.broadcast_date, d.episode_code, d.status,
             d.created_by, d.updated_by, d.created_at, d.updated_at,
             jsonb_build_object('meta', d.data->'meta') AS data,
             u.name as creator_name,
             p.name as project_name, p.gls_number,
             pr.name as program_name,
             (SELECT COUNT(*) FROM qsheet_document_shares s WHERE s.document_id = d.id)::int as share_count,
             CASE WHEN jsonb_typeof(d.data->'sections') = 'array'
                  THEN jsonb_array_length(d.data->'sections')
                  ELSE 0 END AS section_count
      FROM qsheet_documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN qsheet_programs pr ON d.program_id = pr.id
      WHERE d.deleted_at IS NULL
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    const safeScope: DocScope | null =
      typeof scope === 'string' && (VALID_SCOPES as readonly string[]).includes(scope) ? (scope as DocScope) : null;

    if (safeScope === 'mine') {
      // 自分が作った分だけ（役割に関わらず。管理者でもここは絞り込む）
      sql += ` AND d.created_by = $${paramIndex}`;
      params.push(req.user!.id);
      paramIndex++;
    } else if (safeScope === 'shared') {
      // 自分に共有された分だけ（自分が作ったものは含まない）
      sql += ` AND d.created_by <> $${paramIndex} AND EXISTS (
                 SELECT 1 FROM qsheet_document_shares s
                 WHERE s.document_id = d.id AND s.user_id = $${paramIndex})`;
      params.push(req.user!.id);
      paramIndex++;
    } else if (!isQsheetAdmin(req.user!)) {
      // `scope=all` または未指定。管理者以外は「自分が作成」または「自分に共有された」ドキュメントのみ
      // (既定の挙動。scope の有無に関わらず変えない)
      sql += ` AND (d.created_by = $${paramIndex} OR EXISTS (
                 SELECT 1 FROM qsheet_document_shares s
                 WHERE s.document_id = d.id AND s.user_id = $${paramIndex}))`;
      params.push(req.user!.id);
      paramIndex++;
    }
    // 管理者 + scope=all（または未指定）は無条件（既定の挙動のまま）

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
    if (program_id && typeof program_id === 'string') {
      sql += ` AND d.program_id = $${paramIndex++}`;
      params.push(program_id);
    }
    if (search) {
      const safe = sanitizeSearch(search);
      if (safe) {
        sql += ` AND d.title ILIKE $${paramIndex++} ESCAPE '\\'`;
        params.push(`%${safe}%`);
      }
    }
    if (date) {
      const safeDate = sanitizeDate(date);
      if (safeDate) {
        sql += ` AND d.broadcast_date = $${paramIndex++}`;
        params.push(safeDate);
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
    const { title, data, episode_id, project_id, program_id, broadcast_date, episode_code } = req.body;

    const row = await createDocument({
      title: typeof title === 'string' ? title : '',
      data,
      episodeId: episode_id,
      projectId: project_id,
      programId: program_id,
      broadcastDate: broadcast_date,
      episodeCode: episode_code,
      createdBy: req.user!.id,
    });
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

    const { title, data, episode_id, project_id, program_id, broadcast_date, episode_code, status } = req.body;

    const safeTitle = typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '';
    const safeStatus = (typeof status === 'string' && VALID_STATUSES.includes(status)) ? status : 'draft';
    const safeData = (data && typeof data === 'object') ? data : {};

    await execute(
      `UPDATE qsheet_documents
       SET title = $1, data = $2, episode_id = $3, project_id = $4,
           broadcast_date = $5, episode_code = $6, status = $7,
           updated_by = $8, updated_at = NOW(), program_id = $9
       WHERE id = $10`,
      [safeTitle, JSON.stringify(safeData), episode_id || null, project_id || null, broadcast_date || null, episode_code || null, safeStatus, req.user!.id, program_id || null, req.params.id]
    );

    const row = await queryOne('SELECT * FROM qsheet_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('PUT /documents/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// ドキュメントのメタ列だけを更新 (共同編集中の軽量な反映用)
//   - 共同編集 (Yjs) 有効時は台本本体 (`data` 列) が PUT を経由しないため、
//     タイトル・状態・放送日・エピソード紐付けだけが列に反映されなくなる
//     (一覧の検索・絞り込みが編集後の値に当たらない・段5 PR11)。
//   - このルートは `title` / `status` / `broadcast_date` / `episode_id` / `episode_code`
//     の 5 列だけを部分更新する。**`data` 列には一切触れない**
//     (`data` は Yjs の所有物。サーバーから丸ごと上書きするのは collab.ts の役目のみ)。
//   - 送られてきたフィールドだけを更新する (undefined のキーは既存値を保つ)。
// ============================================================
router.patch('/documents/:id/meta', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne(
      'SELECT id, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    if (!(await canAccessDoc(req.user!, existing.id as string, (existing.created_by as string) ?? null))) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }

    const { title, status, broadcast_date, episode_id, episode_code } = req.body as {
      title?: unknown;
      status?: unknown;
      broadcast_date?: unknown;
      episode_id?: unknown;
      episode_code?: unknown;
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '');
    }
    if (status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push((typeof status === 'string' && VALID_STATUSES.includes(status)) ? status : 'draft');
    }
    if (broadcast_date !== undefined) {
      setClauses.push(`broadcast_date = $${paramIndex++}`);
      params.push(typeof broadcast_date === 'string' && broadcast_date ? broadcast_date : null);
    }
    if (episode_id !== undefined) {
      setClauses.push(`episode_id = $${paramIndex++}`);
      params.push(typeof episode_id === 'string' && episode_id ? episode_id : null);
    }
    if (episode_code !== undefined) {
      setClauses.push(`episode_code = $${paramIndex++}`);
      params.push(typeof episode_code === 'string' && episode_code ? episode_code : null);
    }

    if (setClauses.length === 0) {
      const row = await queryOne('SELECT updated_at FROM qsheet_documents WHERE id = $1', [req.params.id]);
      res.json({ success: true, data: { updated_at: row?.updated_at } });
      return;
    }

    setClauses.push(`updated_by = $${paramIndex++}`);
    params.push(req.user!.id);
    setClauses.push('updated_at = NOW()');
    params.push(req.params.id);

    await execute(
      `UPDATE qsheet_documents SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    const row = await queryOne('SELECT updated_at FROM qsheet_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: { updated_at: row?.updated_at } });
  } catch (err: unknown) {
    console.error('PATCH /documents/:id/meta error:', err);
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
        // ESCAPE は個々の ILIKE 式に付く句。括弧で囲んだ OR の後ろに置くと Postgres が構文エラーを返す
        sql += ` AND (e.title ILIKE $${paramIndex} ESCAPE '\\' OR e.episode_code ILIKE $${paramIndex} ESCAPE '\\')`;
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
