import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { uploadAwardsImageToBox, restoreAwardsImageFromBox } from '../services/awards-box.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const UPLOAD_DIR = path.join(__dirname, '../../../../../uploads/awards');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const MAGIC: Record<string, number[]> = {
  '.jpg':  [0xFF, 0xD8, 0xFF],
  '.png':  [0x89, 0x50, 0x4E, 0x47],
  '.webp': [0x52, 0x49, 0x46, 0x46],
};

/** ZIP 一括アップロードの上限 (展開後)。1 部門 500 人でも 500 枚には収まる想定 */
const ZIP_MAX_ENTRIES = 1000;
const ZIP_MAX_TOTAL_BYTES = 300 * 1024 * 1024;

function detectExt(buf: Buffer): string | null {
  for (const [ext, sig] of Object.entries(MAGIC)) {
    if (sig.every((b, i) => buf[i] === b)) return ext;
  }
  return null;
}

// Static image serving (no auth required for CG output)
router.use('/images', (req, _res, next) => {
  if (req.path.includes('..')) return next(new AppError(400, 'BAD_REQUEST', 'invalid path'));
  next();
});
// ローカルキャッシュにファイルが無ければ BOX からの復元を試みる (v2.8.50+)
// volume 障害や手動削除などでローカルが空でも、BOX に mirror があれば自動回復する。
router.use('/images', wrap(async (req, _res, next) => {
  const filename = path.basename(req.path);
  if (!filename || filename === '/') return next();
  const localPath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(localPath)) return next();

  // DB から photo_url が当該ファイル名で終わる entry の box_file_id を引く
  const photoUrl = `/api/v1/internal/awards/images/${filename}`;
  const rows = await queryAll(
    `SELECT photo_box_file_id FROM awards_entries WHERE photo_url = ? AND photo_box_file_id IS NOT NULL LIMIT 1`,
    [photoUrl]
  ) as { photo_box_file_id: string }[];
  if (rows.length === 0) return next();

  const ok = await restoreAwardsImageFromBox(rows[0].photo_box_file_id, localPath);
  if (!ok) return next();
  next();
}));
router.use('/images', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// ── 顔写真アップロード ──────────────────────────────────────
router.post(
  '/entries/:id/photo',
  requireAuth, requirePermission('awards'),
  upload.single('photo'),
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string);
    const entry = await queryOne(
      `SELECT e.id, e.event_id, ev.name AS event_name
       FROM awards_entries e JOIN awards_events ev ON ev.id = e.event_id
       WHERE e.id = ?`,
      [id]
    ) as { id: number; event_id: number; event_name: string } | null;
    if (!entry) throw new AppError(404, 'NOT_FOUND', 'エントリが見つかりません');
    if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'photo ファイルを添付してください');

    const ext = detectExt(req.file.buffer);
    if (!ext) throw new AppError(400, 'BAD_REQUEST', 'JPG / PNG / WebP のみ対応');

    const filename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

    const photoUrl = `/api/v1/internal/awards/images/${filename}`;
    await execute(
      `UPDATE awards_entries SET photo_url=?, photo_box_file_id=NULL, updated_at=NOW() WHERE id=?`,
      [photoUrl, id]
    );

    // BOX へミラーアップロード（fire-and-forget — 失敗してもレスポンスは成功扱い）
    uploadAwardsImageToBox(entry.event_id, entry.event_name, filename, req.file.buffer)
      .then((boxFileId) => {
        if (boxFileId) {
          execute(
            `UPDATE awards_entries SET photo_box_file_id=?, updated_at=NOW() WHERE id=?`,
            [boxFileId, id]
          ).catch((e) => console.warn('[awards-box] DB update failed:', (e as Error).message));
        }
      })
      .catch((e) => console.warn('[awards-box] mirror failed:', (e as Error).message));

    res.json({ success: true, data: { photoUrl } });
  })
);

// ── ZIPアップロード（一括）──────────────────────────────────
router.post(
  '/events/:id/photos-zip',
  requireAuth, requirePermission('awards'),
  upload.single('zip'),
  wrap(async (req, res) => {
    if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'ZIP ファイルを添付してください');

    let AdmZip: new (buf: Buffer) => {
      getEntries(): { isDirectory: boolean; entryName: string; getData(): Buffer }[];
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      AdmZip = require('adm-zip');
    } catch {
      throw new AppError(500, 'SERVER_ERROR', 'adm-zip が未インストールです。npm install adm-zip を実行してください');
    }

    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();
    // ZIP は展開すると何倍にも膨らむ (10MB の ZIP から数 GB を作れる)。
    // 展開しながら合計サイズと件数を数え、超えたらそこで止める。
    // 止めずに全件 getData() すると、この 1 リクエストでサーバーのメモリが尽きる。
    if (entries.length > ZIP_MAX_ENTRIES) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        `ZIP に入っているファイルが多すぎます (${entries.length} 件)。${ZIP_MAX_ENTRIES} 件までに分けてください`
      );
    }

    const saved: { filename: string; url: string }[] = [];
    let totalBytes = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = path.basename(entry.entryName);
      const buf = entry.getData();
      totalBytes += buf.length;
      if (totalBytes > ZIP_MAX_TOTAL_BYTES) {
        throw new AppError(
          400,
          'BAD_REQUEST',
          `ZIP を開いた合計サイズが上限 (${Math.floor(ZIP_MAX_TOTAL_BYTES / 1024 / 1024)}MB) を超えました。写真を分けてアップロードしてください`
        );
      }
      const ext = detectExt(buf);
      if (!ext) continue;

      const filename = `${crypto.randomUUID()}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
      saved.push({ filename: name, url: `/api/v1/internal/awards/images/${filename}` });
    }

    res.json({ success: true, data: { saved } });
  })
);

export default router;
