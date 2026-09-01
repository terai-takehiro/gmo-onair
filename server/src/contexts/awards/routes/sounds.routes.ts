/**
 * awards/routes/sounds.routes.ts — v2.9.122
 *
 * 演出SE (CG ステップに割り当てる効果音 wav/mp3) の
 *  - 配信 (`/awards/audio/:file`、認証不要・OBS 出力用、ローカル欠落時は BOX から復元)
 *  - マッピング取得 (`GET /awards/events/:id/sounds`、認証不要・出力URLが読む)
 *  - アップロード / 更新 / 削除 (認証必須)
 *
 * 画像と同じ uploads/awards (Docker volume) + BOX ミラー基盤を流用。
 */
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

// wav / mp3 のみ。1 ファイル上限 10MB。
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function detectAudioExt(buf: Buffer): string | null {
  // mp3: ID3 ("ID3") か MPEG フレーム同期 (0xFF 0xFB/0xF3/0xF2)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return '.mp3';
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return '.mp3';
  // wav: "RIFF"...."WAVE"
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) return '.wav';
  return null;
}

const VALID_LAYERS = new Set(['ranking', 'quiz']);

// ── 配信: /awards/audio/:file (認証不要)。ローカルに無ければ BOX から復元 ──
router.use('/audio', (req, _res, next) => {
  if (req.path.includes('..')) return next(new AppError(400, 'BAD_REQUEST', 'invalid path'));
  next();
});
router.use('/audio', wrap(async (req, _res, next) => {
  const filename = path.basename(req.path);
  if (!filename || filename === '/') return next();
  const localPath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(localPath)) return next();
  const rows = await queryAll(
    `SELECT box_file_id FROM awards_sounds WHERE file = ? AND box_file_id IS NOT NULL LIMIT 1`,
    [filename],
  ) as { box_file_id: string }[];
  if (rows.length === 0) return next();
  const ok = await restoreAwardsImageFromBox(rows[0].box_file_id, localPath);
  if (!ok) return next();
  next();
}));
router.use('/audio', express.static(UPLOAD_DIR, { maxAge: '1d' }));

// ── マッピング取得 (認証不要・出力URLが読む) ──
router.get('/events/:id/sounds', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  // NaN を integer 列に渡すと pg が 22P02 で落ちて 500 になる（認証不要のURLなので必ず弾く）
  if (!Number.isInteger(eventId)) throw new AppError(400, 'BAD_REQUEST', 'イベントIDが不正です');
  const rows = await queryAll(
    `SELECT id, layer, step, rank_start, file, volume, enabled
     FROM awards_sounds WHERE event_id = ? ORDER BY layer, step, rank_start NULLS FIRST`,
    [eventId],
  );
  res.json({
    success: true,
    data: (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      layer: r.layer,
      step: r.step,
      rankStart: r.rank_start ?? null,
      url: `/api/v1/internal/awards/audio/${r.file}`,
      volume: Number(r.volume),
      enabled: !!r.enabled,
    })),
  });
}));

// ── アップロード (認証必須) ──
router.post(
  '/events/:id/sounds',
  requireAuth, requirePermission('awards'),
  upload.single('file'),
  wrap(async (req, res) => {
    const eventId = parseInt(req.params.id as string);
    if (!Number.isInteger(eventId)) throw new AppError(400, 'BAD_REQUEST', 'イベントIDが不正です');
    const ev = await queryOne(`SELECT id, name FROM awards_events WHERE id = ?`, [eventId]) as
      | { id: number; name: string } | null;
    if (!ev) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
    if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'file (wav/mp3) を添付してください');

    const layer = String(req.body?.layer ?? '');
    const step = String(req.body?.step ?? '').trim();
    if (!VALID_LAYERS.has(layer)) throw new AppError(400, 'BAD_REQUEST', 'layer は ranking / quiz');
    if (!step) throw new AppError(400, 'BAD_REQUEST', 'step は必須です');
    const rankStartRaw = req.body?.rankStart;
    const rankStart = rankStartRaw === undefined || rankStartRaw === '' || rankStartRaw === null
      ? null : Math.max(2, Math.min(5, Math.floor(Number(rankStartRaw))));
    const volume = Math.max(0, Math.min(1, Number(req.body?.volume ?? 1) || 1));

    const ext = detectAudioExt(req.file.buffer);
    if (!ext) throw new AppError(400, 'BAD_REQUEST', 'wav / mp3 のみ対応しています');

    const filename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

    // 既存 (同 event/layer/step/rankStart) を置き換え。旧ファイルは物理削除。
    const existing = await queryOne(
      `SELECT id, file FROM awards_sounds
       WHERE event_id = ? AND layer = ? AND step = ? AND COALESCE(rank_start, 0) = COALESCE(?, 0)`,
      [eventId, layer, step, rankStart],
    ) as { id: number; file: string } | null;

    if (existing) {
      await execute(
        `UPDATE awards_sounds SET file = ?, box_file_id = NULL, volume = ?, enabled = TRUE, updated_at = NOW()
         WHERE id = ?`,
        [filename, volume, existing.id],
      );
      try { fs.unlinkSync(path.join(UPLOAD_DIR, existing.file)); } catch { /* noop */ }
    } else {
      await execute(
        `INSERT INTO awards_sounds (event_id, layer, step, rank_start, file, volume, enabled)
         VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
        [eventId, layer, step, rankStart, filename, volume],
      );
    }

    const row = await queryOne(
      `SELECT id FROM awards_sounds WHERE event_id = ? AND layer = ? AND step = ? AND COALESCE(rank_start, 0) = COALESCE(?, 0)`,
      [eventId, layer, step, rankStart],
    ) as { id: number };

    // BOX ミラー (fire-and-forget)
    uploadAwardsImageToBox(eventId, ev.name, filename, req.file.buffer)
      .then((boxFileId) => {
        if (boxFileId) execute(`UPDATE awards_sounds SET box_file_id = ? WHERE id = ?`, [boxFileId, row.id])
          .catch(() => {});
      })
      .catch((e) => console.warn('[awards-sounds] box mirror failed:', (e as Error).message));

    res.json({ success: true, data: { id: row.id, url: `/api/v1/internal/awards/audio/${filename}`, volume, enabled: true } });
  }),
);

// ── 音量 / 有効無効 更新 ──
router.put(
  '/sounds/:id',
  requireAuth, requirePermission('awards'),
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (!Number.isInteger(id)) throw new AppError(400, 'BAD_REQUEST', '音源IDが不正です');
    const cur = await queryOne(`SELECT id, volume, enabled FROM awards_sounds WHERE id = ?`, [id]) as
      | { id: number; volume: number; enabled: boolean } | null;
    if (!cur) throw new AppError(404, 'NOT_FOUND', '音源が見つかりません');
    const volume = req.body?.volume !== undefined
      ? Math.max(0, Math.min(1, Number(req.body.volume) || 0)) : cur.volume;
    const enabled = req.body?.enabled !== undefined ? !!req.body.enabled : cur.enabled;
    await execute(`UPDATE awards_sounds SET volume = ?, enabled = ?, updated_at = NOW() WHERE id = ?`,
      [volume, enabled, id]);
    res.json({ success: true, data: { id, volume, enabled } });
  }),
);

// ── 削除 ──
router.delete(
  '/sounds/:id',
  requireAuth, requirePermission('awards'),
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (!Number.isInteger(id)) throw new AppError(400, 'BAD_REQUEST', '音源IDが不正です');
    const row = await queryOne(`SELECT file FROM awards_sounds WHERE id = ?`, [id]) as { file: string } | null;
    await execute(`DELETE FROM awards_sounds WHERE id = ?`, [id]);
    if (row?.file) { try { fs.unlinkSync(path.join(UPLOAD_DIR, row.file)); } catch { /* noop */ } }
    res.json({ success: true });
  }),
);

export default router;
