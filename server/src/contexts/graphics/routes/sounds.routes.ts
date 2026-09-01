import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import { execute, queryAll, queryOne, Row } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchProject } from '../store';

// テロップCG — ランキング発表パーツ（part_key: 'ranking'）の演出SE（ステップ切替時の
// 効果音）管理API。旧 `client-awards` の `awards_sounds` + `images.routes.ts` と同じ
// パターン（multer memoryStorage・マジックバイト検証・ローカル保存・認証なし静的配信）を
// 踏襲する。設計判断は migration 252 のコメント参照（段6-5）。

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// images.routes.ts の `uploads/graphics` とは別ディレクトリ（衝突しない）
const UPLOAD_DIR = path.join(__dirname, '../../../../../uploads/graphics-sounds');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * マジックバイト検証（拡張子ではなく中身で判定 — images.routes.ts と同じ理由）。
 * mp3: ID3タグ（`49 44 33`）または MPEGフレーム同期（`FF Ex`/`FF Fx`）。
 * wav: RIFF（`52 49 46 46`）+ オフセット8に WAVE（`57 41 56 45`）。
 */
function detectExt(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return '.mp3';
  if (buf.length >= 2 && buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return '.mp3';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) return '.wav';
  return null;
}

// 静的配信（認証なし・放送側のブラウザソース〈OBS等〉が音源を直接読み込むため。
// images.routes.ts の `/images` と同じ位置づけ・同じ理由）
router.use('/sounds', (req, _res, next) => {
  if (req.path.includes('..')) return next(new AppError(400, 'BAD_REQUEST', 'invalid path'));
  next();
});
router.use('/sounds', express.static(UPLOAD_DIR, { maxAge: '7d' }));
// ファイルが無いときは必ずここで 404 を返す（images.routes.ts と同じ理由・段6-5の調査で
// 見つけた実バグの再発防止）。express.static は見つからないと next() で素通りするだけなので、
// これが無いとリクエストが後続ルーター（templates.routes.ts 等の
// `router.use(requireAuth, ...)`）まで落ち、本来 401 になるはずのない公開URLが
// 401 を返す（「OBSで一切鳴らない」の最悪ケースになりうる——無音のまま気づかれない）。
// ⚠️ **GET/HEAD 以外は next() で素通りさせる。** この router は同じ '/sounds' 配下に
// `PUT /sounds/:id`・`DELETE /sounds/:id`（下方で定義）も持つため、メソッドを見ずに
// 404 で止めると、その2つが「演出SEが見つかりません」で常に落ちる（実際に検証で踏んだ）。
router.use('/sounds', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '演出SEが見つかりません' } });
});

export interface RankingSoundRow {
  id: number;
  projectId: number;
  step: string;
  rankStart: number | null;
  file: string;
  url: string;
  volume: number;
  enabled: boolean;
}

function mapSound(r: Row): RankingSoundRow {
  const file = r.file as string;
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    step: r.step as string,
    rankStart: (r.rank_start as number | null) ?? null,
    file,
    url: `/api/v1/internal/graphics/sounds/${file}`,
    volume: Number(r.volume ?? 1),
    enabled: r.enabled as boolean,
  };
}

function parseRankStart(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'rankStart は数値です');
  }
  return Math.trunc(n);
}

function parseVolume(v: unknown): number {
  if (v === undefined || v === null || v === '') return 1;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'volume は 0〜1 の数値です');
  }
  return Math.round(n * 100) / 100;
}

function parseEnabled(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  return v === true || v === 'true' || v === '1' || v === 1;
}

// ── アップロード（同じ project/step/rankStart は UPSERT で上書き） ─────────
router.post(
  '/projects/:id/sounds',
  requireAuth, requirePermission('qsheet'),
  upload.single('sound'),
  wrap(async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
    if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');
    if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'sound ファイルを添付してください');

    const step = String((req.body as { step?: unknown })?.step ?? '').trim();
    if (!step) throw new AppError(400, 'VALIDATION_ERROR', 'step は必須です');
    const rankStart = parseRankStart((req.body as { rankStart?: unknown })?.rankStart);
    const volume = parseVolume((req.body as { volume?: unknown })?.volume);
    const enabled = parseEnabled((req.body as { enabled?: unknown })?.enabled);

    const ext = detectExt(req.file.buffer);
    if (!ext) throw new AppError(400, 'BAD_REQUEST', 'MP3 / WAV のみ対応');

    const filename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

    // UPSERT: 同じ (project, step, rankStart) が既にあれば古いローカルファイルを消して
    // 上書きする（アップロードのたびにゴミファイルが増えないように。ON CONFLICT の
    // 対象を式インデックスと厳密一致させる必要を避けるため、素朴な「あれば UPDATE・
    // 無ければ INSERT」にした — uq_graphics_ranking_sounds が同時アップロードの
    // 競合自体は防ぐ）
    const existing = await queryOne(
      `SELECT * FROM graphics_ranking_sounds
       WHERE project_id = ? AND step = ? AND COALESCE(rank_start, 0) = COALESCE(?, 0)`,
      [projectId, step, rankStart]
    );
    if (existing) {
      const oldPath = path.join(UPLOAD_DIR, existing.file as string);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch { /* 消せなくても致命的ではない */ }
      }
      const row = await queryOne(
        `UPDATE graphics_ranking_sounds
         SET file = ?, volume = ?, enabled = ?, updated_at = NOW()
         WHERE id = ? RETURNING *`,
        [filename, volume, enabled, existing.id]
      );
      res.status(200).json({ success: true, data: mapSound(row!) });
      return;
    }

    const row = await queryOne(
      `INSERT INTO graphics_ranking_sounds (project_id, step, rank_start, file, volume, enabled)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [projectId, step, rankStart, filename, volume, enabled]
    );
    res.status(201).json({ success: true, data: mapSound(row!) });
  })
);

// ── 一覧（認証なし） ───────────────────────────────────────────────
// ⚠️ 意図的に requireAuth を付けていない。管理UI（RankingSoundsPanel）だけでなく、
// **認証を持たない出力URL（`?audio=1`）の `useRankingAudio.ts` もこの一覧を読む**
// （旧 client-awards の `GET /events/:id/sounds` と同じ設計 — マッピングの読み取りは
// 公開、書き込み〈POST/PUT/DELETE〉だけ認証必須、という非対称は images.routes.ts の
// 「配信は公開・アップロードは認証必須」とも一致する）。ここに `requireAuth` を足すと
// OBS 側の出力ページが音源マッピングを一切取得できず、演出SEが無音のまま気づかれない
// 最悪のバグになる（検証で実際に踏んで判明・段6-5）。
router.get(
  '/projects/:id/sounds',
  wrap(async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
    if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

    const rows = await queryAll(
      `SELECT * FROM graphics_ranking_sounds WHERE project_id = ? ORDER BY step, COALESCE(rank_start, 0) DESC`,
      [projectId]
    );
    res.json({ success: true, data: rows.map(mapSound) });
  })
);

// ── volume / enabled の更新 ───────────────────────────────────────
router.put(
  '/sounds/:id',
  requireAuth, requirePermission('qsheet'),
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string);
    const existing = id && !isNaN(id)
      ? await queryOne(`SELECT * FROM graphics_ranking_sounds WHERE id = ?`, [id])
      : undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '演出SEが見つかりません');

    const body = (req.body ?? {}) as { volume?: unknown; enabled?: unknown };
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.volume !== undefined) {
      sets.push('volume = ?'); params.push(parseVolume(body.volume));
    }
    if (body.enabled !== undefined) {
      sets.push('enabled = ?'); params.push(parseEnabled(body.enabled));
    }
    if (sets.length === 0) {
      res.json({ success: true, data: mapSound(existing) });
      return;
    }
    sets.push('updated_at = NOW()');
    params.push(id);
    const row = await queryOne(
      `UPDATE graphics_ranking_sounds SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
      params
    );
    res.json({ success: true, data: mapSound(row!) });
  })
);

// ── 削除（ローカルファイルも削除） ──────────────────────────────────
router.delete(
  '/sounds/:id',
  requireAuth, requirePermission('qsheet'),
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string);
    const existing = id && !isNaN(id)
      ? await queryOne(`SELECT * FROM graphics_ranking_sounds WHERE id = ?`, [id])
      : undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '演出SEが見つかりません');

    await execute(`DELETE FROM graphics_ranking_sounds WHERE id = ?`, [id]);
    const filePath = path.join(UPLOAD_DIR, existing.file as string);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* 消せなくても致命的ではない */ }
    }
    res.json({ success: true });
  })
);

export default router;
