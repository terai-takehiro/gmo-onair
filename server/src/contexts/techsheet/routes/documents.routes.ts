import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();

router.use(requireAuth, requirePermission('techsheet'));

const MAX_TITLE_LENGTH = 500;
const MAX_SEARCH_LENGTH = 100;
const VALID_STATUSES = ['draft', 'confirmed', 'archived'];

function sanitizeSearch(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  return input.slice(0, MAX_SEARCH_LENGTH).replace(/[%_\\]/g, '\\$&');
}

// Default data structure for new documents
// GMOグローバルスタジオ = 常設スタジオ前提
function defaultDocumentData() {
  return {
    header: {
      programName: '',
      broadcastType: '',       // 放送/配信先
      productionFormat: 'HD/ステレオ', // 制作方式
      studio: '',              // 使用スタジオ
      circuits: '',            // 回線概要
      vtr: '',                 // VTR概要
      performers: '',          // 出演者
    },
    staff: {
      td: '', sw: '', d: [], p: '', ve: '',
      cam: [], mix: '', aa: [], ca: [], vtrOp: '', aux: '',
      ld: '', cg: '',
    },
    sheets: [
      {
        id: 'camera',
        type: 'camera',
        label: 'カメラプラン',
        enabled: true,
        rows: [],
      },
      {
        id: 'audio',
        type: 'audio',
        label: '音声系統',
        enabled: true,
        sections: [
          { id: 'mic', label: 'マイク', rows: [] },
          { id: 'monitor', label: 'モニター', rows: [] },
          { id: 'intercom', label: 'インカム', rows: [] },
          { id: 'ifb', label: 'インヤモ(IFB)', rows: [] },
        ],
      },
      {
        id: 'video',
        type: 'video',
        label: '映像系統',
        enabled: true,
        sections: [
          { id: 'vtr', label: 'VTR・収録', rows: [] },
          { id: 'switcher', label: 'スイッチャー', rows: [] },
          { id: 'cg', label: 'CG・テロップ', rows: [] },
        ],
      },
      {
        id: 'comms',
        type: 'comms',
        label: '回線・通信',
        enabled: false,
        sections: [
          { id: 'lines', label: '回線', rows: [] },
          { id: 'distribution', label: '配信・伝送', rows: [] },
          { id: 'contacts', label: '連絡先', rows: [] },
        ],
      },
    ],
    notes: '',
  };
}

// ============================================================
// 一覧
// ============================================================
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const { status, project_id, search } = req.query;
    let sql = `
      SELECT d.*, u.name as creator_name,
             p.name as project_name, p.gls_number
      FROM techsheet_documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN projects p ON d.project_id = p.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status && typeof status === 'string' && VALID_STATUSES.includes(status)) {
      sql += ` AND d.status = $${paramIndex++}`;
      params.push(status);
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
    console.error('GET /techsheet/documents error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 取得
// ============================================================
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `SELECT d.*, u.name as creator_name,
              p.name as project_name, p.gls_number
       FROM techsheet_documents d
       LEFT JOIN users u ON d.created_by = u.id
       LEFT JOIN projects p ON d.project_id = p.id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '技術資料が見つかりません' } });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('GET /techsheet/documents/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 作成
// ============================================================
router.post('/documents', requirePermission('techsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const id = uuid();
    const { title, project_id, episode_id, production_date, venue, data } = req.body;

    const safeTitle = typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '無題の技術資料';
    const safeData = (data && typeof data === 'object') ? data : defaultDocumentData();

    await execute(
      `INSERT INTO techsheet_documents (id, title, project_id, episode_id, production_date, venue, data, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, safeTitle, project_id || null, episode_id || null, production_date || null, venue || null, JSON.stringify(safeData), req.user!.id]
    );

    const row = await queryOne('SELECT * FROM techsheet_documents WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('POST /techsheet/documents error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 更新
// ============================================================
router.put('/documents/:id', requirePermission('techsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM techsheet_documents WHERE id = $1', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '技術資料が見つかりません' } });
      return;
    }

    const { title, project_id, episode_id, production_date, venue, version, status, data } = req.body;

    const safeTitle = typeof title === 'string' ? title.slice(0, MAX_TITLE_LENGTH) : '無題の技術資料';
    const safeStatus = (typeof status === 'string' && VALID_STATUSES.includes(status)) ? status : 'draft';
    const safeData = (data && typeof data === 'object') ? data : {};

    await execute(
      `UPDATE techsheet_documents
       SET title = $1, project_id = $2, episode_id = $3, production_date = $4,
           venue = $5, version = $6, status = $7, data = $8, updated_at = NOW()
       WHERE id = $9`,
      [safeTitle, project_id || null, episode_id || null, production_date || null,
       venue || null, version || 'Ver.1.0', safeStatus, JSON.stringify(safeData), req.params.id]
    );

    const row = await queryOne('SELECT * FROM techsheet_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('PUT /techsheet/documents/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 削除
// ============================================================
router.delete('/documents/:id', requirePermission('techsheet', 'manager'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM techsheet_documents WHERE id = $1', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '技術資料が見つかりません' } });
      return;
    }

    await execute('DELETE FROM techsheet_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err: unknown) {
    console.error('DELETE /techsheet/documents/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
