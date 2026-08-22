import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// ⚠️ **パスを付けずに `router.use(...)` を書かないこと**（理由は audio-share.routes.ts の
// 同じ注記）。`/qsheet` に丸ごと載せているので、パスなしだと `editor` 要求が
// あとから載せた router 全部に効いてしまう。
router.use(['/upload-image', '/images'], requireAuth, requirePermission('qsheet', 'editor'));

// Max file size: 5MB
const MAX_SIZE = 5 * 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, '../../../../uploads/qsheet');

// Magic bytes for image format validation
const MAGIC_BYTES: Record<string, number[][]> = {
  '.jpg': [[0xFF, 0xD8, 0xFF]],
  '.jpeg': [[0xFF, 0xD8, 0xFF]],
  '.png': [[0x89, 0x50, 0x4E, 0x47]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
};

function detectImageType(buffer: Buffer): string | null {
  for (const [ext, patterns] of Object.entries(MAGIC_BYTES)) {
    for (const pattern of patterns) {
      if (buffer.length >= pattern.length) {
        const match = pattern.every((byte, i) => buffer[i] === byte);
        if (match) return ext;
      }
    }
  }
  return null;
}

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ============================================================
// Image upload (base64 JSON body)
// ============================================================
router.post('/upload-image', async (req: Request, res: Response) => {
  try {
    const { data, filename } = req.body;

    if (!data || typeof data !== 'string') {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'data is required' } });
      return;
    }

    // Decode base64
    const base64Data = data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > MAX_SIZE) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ファイルサイズが5MBを超えています' } });
      return;
    }

    if (buffer.length < 4) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '無効な画像ファイルです' } });
      return;
    }

    // Validate actual file content via magic bytes (don't trust client-provided mimeType)
    const detectedExt = detectImageType(buffer);
    if (!detectedExt) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '許可されていない画像形式です (JPEG/PNG/GIF/WebP のみ)' } });
      return;
    }

    // Generate safe filename using random hash only
    const hash = crypto.randomBytes(16).toString('hex');
    const safeFilename = `${hash}${detectedExt}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    // Double-check path doesn't escape upload dir
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'アクセスが拒否されました' } });
      return;
    }

    fs.writeFileSync(filePath, buffer);

    const url = `/api/v1/internal/qsheet/images/${safeFilename}`;
    res.status(201).json({ success: true, data: { url, filename: safeFilename } });
  } catch (err: unknown) {
    console.error('POST /upload-image error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'アップロード中にエラーが発生しました' } });
  }
});

// ============================================================
// Serve uploaded images
// ============================================================
router.get('/images/:filename', (req: Request, res: Response) => {
  // Only allow alphanumeric, dots, and hyphens
  const filename = (req.params.filename as string).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!filename || filename.includes('..')) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '無効なファイル名です' } });
    return;
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  // Ensure path doesn't escape upload dir
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'アクセスが拒否されました' } });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '画像が見つかりません' } });
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
  };
  const contentType = mimeMap[ext];
  if (!contentType) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '不正なファイル形式です' } });
    return;
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(resolved).pipe(res);
});

export default router;
