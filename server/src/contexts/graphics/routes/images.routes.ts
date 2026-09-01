import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchCues, fetchTemplate, mapPage } from '../store';

// テロップCG — ページの写真フィールド（`kind: 'image'`・pageFields.ts）用アップロードAPI。
// awards の `images.routes.ts` と同じパターン（multer memoryStorage・マジックバイト検証・
// ローカル保存・認証なし静的配信）を踏襲。BOXミラー保存（`uploadAwardsImageToBox`相当）は
// 今回対象外 — awards固有の運用機能で、テロップCGはシンプルにローカル保存だけでよい
// （docs/design/v4/graphics-awards-migration-plan.md §2-2の9番）。

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const UPLOAD_DIR = path.join(__dirname, '../../../../../uploads/graphics');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// 静的配信（認証なし・出力画面が公開URLで読み込むため — public.routes.ts と同様の位置づけ）
router.use('/images', (req, _res, next) => {
  if (req.path.includes('..')) return next(new AppError(400, 'BAD_REQUEST', 'invalid path'));
  next();
});
router.use('/images', express.static(UPLOAD_DIR, { maxAge: '7d' }));
// ファイルが無いとき（DBのURLは残っているがアップロード先が消えた等）は、
// ここで確実に 404 を返す。**これが無いと** express.static が next() で
// 静かに素通りし、リクエストが createGraphicsRoutes() の後続ルーター
// （templates.routes.ts 等の `router.use(requireAuth, ...)`）まで落ちて、
// 本来 401 になるはずのない公開URLが 401 を返す（実際に検証で再現・段6-5の調査で発見）。
// パスの穴を塞ぐ意味でも、公開URL配下は必ずこの router 内で完結させる。
// GET/HEAD 以外は素通りさせる（`/images` 配下に他メソッドのルートは今は無いが、
// sounds.routes.ts で実際に PUT/DELETE を巻き込んで壊した教訓を踏まえて同じ形にする）。
router.use('/images', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '画像が見つかりません' } });
});

// ── ページの写真アップロード ────────────────────────────────────
router.post(
  '/pages/:id/photo',
  requireAuth, requirePermission('qsheet'),
  upload.single('photo'),
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string);
    const existing = id && !isNaN(id)
      ? await queryOne(`SELECT * FROM graphics_pages WHERE id = ?`, [id])
      : undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'ページが見つかりません');
    if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'photo ファイルを添付してください');

    const ext = detectExt(req.file.buffer);
    if (!ext) throw new AppError(400, 'BAD_REQUEST', 'JPG / PNG / WebP のみ対応');

    // テンプレートから作られたページ（template_id あり）は、pages.routes.ts の PUT と同じ境界を
    // ここでも強制する — publicFields に photoUrl が含まれないテンプレート固定ページには
    // このエンドポイントからも書き込ませない（オペレーターが公開されていないフィールドを
    // 弄れないことの保証を、フィールド更新の経路が増えても崩さない）
    if (existing.template_id != null) {
      const template = await fetchTemplate(existing.template_id as number);
      if (!template?.publicFields.includes('photoUrl')) {
        throw new AppError(
          400, 'VALIDATION_ERROR',
          'このページはテンプレート固定の写真欄です（編集不可: photoUrl）'
        );
      }
    }

    const filename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

    const photoUrl = `/api/v1/internal/graphics/images/${filename}`;
    const merged = { ...(existing.fields as Record<string, unknown> ?? {}), photoUrl };
    const row = await queryOne(
      `UPDATE graphics_pages SET fields=?::jsonb, updated_at=NOW() WHERE id=? RETURNING *`,
      [JSON.stringify(merged), id]
    );

    // 出力画面・送出コンソールへ即時反映（pages.routes.ts の PUT と同じ二重化）
    const io = req.app.get('io');
    if (io) {
      const cues = await fetchCues(existing.project_id as number);
      io.of('/graphics').to(`project:${existing.project_id}`).emit('cg:sync', {
        cues, page: mapPage(row!), timestamp: Date.now(),
      });
    }

    res.json({ success: true, data: { photoUrl } });
  })
);

export default router;
