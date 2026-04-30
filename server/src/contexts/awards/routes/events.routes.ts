import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execute, queryAll, queryOne, getDb } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { importAwardsExcel } from '../services/excel-import.service';

const UPLOAD_DIR = path.join(__dirname, '../../../../../uploads/awards');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAGIC: Record<string, number[]> = {
  '.jpg':  [0xFF, 0xD8, 0xFF],
  '.png':  [0x89, 0x50, 0x4E, 0x47],
  '.webp': [0x52, 0x49, 0x46, 0x46],
};
function detectExt(buf: Buffer): string | null {
  for (const [ext, sig] of Object.entries(MAGIC)) {
    if (sig.every((b, i) => buf[i] === b)) return ext;
  }
  return null;
}

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 公開: CG出力用（認証不要・ブラウザソース用）──────────────
router.get('/events/:id/output', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id, name, subtitle FROM awards_events WHERE id = ?`, [id]);
  if (!event) { res.status(404).json({ success: false }); return; }

  const categories = await queryAll(
    `SELECT * FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`, [id]
  );
  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE event_id = ? ORDER BY category_id, rank NULLS LAST, id`, [id]
  );

  const catMap = new Map<number, Record<string, unknown> & { entries: unknown[] }>();
  for (const c of categories) catMap.set(c.id as number, { ...c, entries: [] });
  for (const e of entries) catMap.get(e.category_id as number)?.entries.push(e);

  res.json({ success: true, data: { ...event, categories: [...catMap.values()] } });
}));

router.use(requireAuth, requirePermission('awards'));

// ── 一覧 ────────────────────────────────────────────────────
router.get('/events', wrap(async (_req, res) => {
  const rows = await queryAll(
    `SELECT id, name, subtitle, description, scheduled_at, status, created_at, updated_at
     FROM awards_events ORDER BY scheduled_at DESC NULLS LAST, id DESC`
  );
  res.json({ success: true, data: rows });
}));

// ── 作成 ────────────────────────────────────────────────────
router.post('/events', wrap(async (req, res) => {
  const { name, subtitle, description, scheduled_at } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const row = await queryOne(
    `INSERT INTO awards_events (name, subtitle, description, scheduled_at)
     VALUES (?, ?, ?, ?) RETURNING *`,
    [name.trim(), subtitle ?? null, description ?? null, scheduled_at ?? null]
  );
  res.status(201).json({ success: true, data: row });
}));

// ── 詳細（カテゴリ＋エントリ込み）───────────────────────────
router.get('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT * FROM awards_events WHERE id = ?`, [id]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const categories = await queryAll(
    `SELECT * FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`, [id]
  );
  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE event_id = ? ORDER BY category_id, rank NULLS LAST, id`, [id]
  );

  const catMap = new Map<number, Record<string, unknown> & { entries: unknown[] }>();
  for (const c of categories) {
    catMap.set(c.id as number, { ...c, entries: [] });
  }
  for (const e of entries) {
    catMap.get(e.category_id as number)?.entries.push(e);
  }

  res.json({ success: true, data: { ...event, categories: [...catMap.values()] } });
}));

// ── 更新 ────────────────────────────────────────────────────
router.put('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, subtitle, description, scheduled_at } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const row = await queryOne(
    `UPDATE awards_events SET name=?, subtitle=?, description=?, scheduled_at=?, updated_at=NOW()
     WHERE id=? RETURNING *`,
    [name.trim(), subtitle ?? null, description ?? null, scheduled_at ?? null, id]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  res.json({ success: true, data: row });
}));

// ── ステータス変更 ───────────────────────────────────────────
router.post('/events/:id/status', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { status } = req.body;
  if (!['draft', 'live', 'closed'].includes(status)) {
    throw new AppError(400, 'BAD_REQUEST', 'status は draft/live/closed のいずれか');
  }
  const row = await queryOne(
    `UPDATE awards_events SET status=?, updated_at=NOW() WHERE id=? RETURNING *`,
    [status, id]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  res.json({ success: true, data: row });
}));

// ── 削除 ────────────────────────────────────────────────────
router.delete('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const row = await queryOne(`DELETE FROM awards_events WHERE id=? RETURNING id`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  res.json({ success: true });
}));

// ── Excel インポート ────────────────────────────────────────
router.post('/events/:id/import-excel', upload.single('file'), wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'Excel ファイルを添付してください');

  const result = await importAwardsExcel(req.file.buffer, eventId);
  res.json({ success: true, data: result });
}));

// ── 画像フォルダ一括インポート ──────────────────────────────
// マッチングは「画像ID 完全一致 → 画像ID 正規化一致 → 氏名/プロジェクト名 一致」の順に試行。
// ・フォルダアップロード (webkitdirectory) で path 付きファイル名が来ても basename を使用
// ・隠しファイル (._*, .DS_Store, Thumbs.db) と __MACOSX 配下は無視
// ・画像IDの leading zero / 全角半角 / 大文字小文字 / 空白の差異を吸収
router.post(
  '/events/:id/import-images',
  requireAuth, requirePermission('awards'),
  upload.array('images', 500),
  wrap(async (req, res) => {
    const eventId = parseInt(req.params.id as string);
    const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
    if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new AppError(400, 'BAD_REQUEST', '画像ファイルを添付してください');

    // 1) エントリ一覧を取得して照合用インデックスを作成
    const entries = await queryAll(
      `SELECT id, image_id, name, name_en FROM awards_entries WHERE event_id=?`,
      [eventId]
    ) as { id: number; image_id: string | null; name: string; name_en: string | null }[];

    // 全角→半角、空白除去、小文字化、leading zero 削除（数字のみ）
    const norm = (raw: string | null | undefined): string => {
      if (!raw) return '';
      let s = String(raw).trim();
      s = s
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[\s　_\-‐－]+/g, '')
        .toLowerCase();
      // 数字のみなら leading zero を除去（例: 001 == 1）
      if (/^\d+$/.test(s)) s = String(parseInt(s, 10));
      return s;
    };

    const byImageId = new Map<string, number>(); // 画像ID 正規化 → entry.id
    const byName    = new Map<string, number>(); // 氏名 / 英語名 正規化 → entry.id
    for (const e of entries) {
      if (e.image_id) {
        const k = norm(e.image_id);
        if (k && !byImageId.has(k)) byImageId.set(k, e.id);
      }
      if (e.name) {
        const k = norm(e.name);
        if (k && !byName.has(k)) byName.set(k, e.id);
      }
      if (e.name_en) {
        const k = norm(e.name_en);
        if (k && !byName.has(k)) byName.set(k, e.id);
      }
    }

    let matched = 0;
    const unmatched: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      // webkitdirectory で送られた場合 originalname にパスが含まれることがあるので basename 化
      const baseName = path.basename(file.originalname);

      // 隠しファイル・OS メタデータを除外
      if (
        baseName.startsWith('.') ||
        baseName.toLowerCase() === 'thumbs.db' ||
        file.originalname.includes('__MACOSX/')
      ) {
        skipped.push(baseName);
        continue;
      }

      const stem = baseName.replace(/\.[^.]+$/, ''); // 拡張子なし
      const key = norm(stem);

      const ext = detectExt(file.buffer);
      if (!ext) { unmatched.push(baseName); continue; }

      // 画像ID → 名前 の順にマッチング
      const entryId = byImageId.get(key) ?? byName.get(key);
      if (!entryId) { unmatched.push(baseName); continue; }

      const filename = `${crypto.randomUUID()}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
      const photoUrl = `/api/v1/internal/awards/images/${filename}`;

      await execute(
        `UPDATE awards_entries SET photo_url=?, updated_at=NOW() WHERE id=?`,
        [photoUrl, entryId]
      );
      matched++;
    }

    res.json({ success: true, data: { matched, unmatched, skipped } });
  })
);

// ── カテゴリ並び替え ────────────────────────────────────────
router.put('/events/:id/categories/reorder', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const { order } = req.body as { order: { id: number; displayOrder: number }[] };
  if (!Array.isArray(order) || order.length === 0) {
    throw new AppError(400, 'BAD_REQUEST', 'order は配列が必要です');
  }

  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of order) {
      await client.query(
        `UPDATE awards_categories SET display_order=$1 WHERE id=$2 AND event_id=$3`,
        [item.displayOrder, item.id, eventId]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── ダミーデータ挿入（Excel なしでテスト用）────────────────
router.post('/events/:id/seed-dummy', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const categoryName: string = (req.body.categoryName as string)?.trim() || 'ベストパフォーマンス賞';
  const entryCount = Math.min(parseInt(req.body.entryCount as string) || 5, 10);

  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const maxOrderRes = await client.query(
      `SELECT COALESCE(MAX(display_order),0) AS max FROM awards_categories WHERE event_id = $1`,
      [eventId]
    );
    const catRes = await client.query(
      `INSERT INTO awards_categories (event_id, name, display_order)
       VALUES ($1,$2,$3) RETURNING id`,
      [eventId, categoryName, (maxOrderRes.rows[0].max as number) + 1]
    );
    const categoryId: number = catRes.rows[0].id as number;

    const dummyNames = [
      ['山田 太郎', 'デジタル推進部'],
      ['鈴木 花子', 'マーケティング部'],
      ['田中 一郎', '営業第一部'],
      ['佐藤 美咲', 'エンジニアリング部'],
      ['高橋 健二', 'クリエイティブ部'],
      ['渡辺 由美', '商品開発部'],
      ['伊藤 賢', 'カスタマーサクセス部'],
      ['中村 真由子', 'ファイナンス部'],
      ['小林 裕樹', '人事部'],
      ['加藤 奈緒', '経営企画部'],
    ];
    const basePoints = [4800, 4200, 3600, 3100, 2700, 2300, 2000, 1800, 1500, 1200];

    for (let i = 0; i < entryCount; i++) {
      const rank = i + 1;
      const [name, org] = dummyNames[i % dummyNames.length];
      const points = basePoints[i] + Math.floor(Math.random() * 200) - 100;
      await client.query(
        `INSERT INTO awards_entries (event_id, category_id, rank, name, org, points, is_winner)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [eventId, categoryId, rank, name, org, points, rank === 1]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { categoryId, entryCount } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
