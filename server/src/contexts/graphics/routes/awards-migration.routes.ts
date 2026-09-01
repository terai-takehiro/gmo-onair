import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  commitAwardsMigration, listAwardsMigrationEvents, previewAwardsMigration,
} from '../services/awards-migration.service';

// 旧リアルタイムCG（client-awards）の過去実績データを、新しいテロップCG（graphics）の
// データモデルへ変換移行するツール（段6-9）。system_admin/qsheet manager 向けの管理画面
// （`AwardsMigrationPage.tsx`）だけが呼ぶ想定。旧 `awards_*` テーブルへは一切書き込まない
// （`awards-migration.service.ts` の読み取り専用の実装を参照）。
//
// ⚠️ **本番データに対して自動実行してはいけない** — このツールは「ツールそのもの」の実装
// であり、実際に本番へ向けて実行する判断・操作はこのタスクの対象外（別途ユーザーの
// 明示的な指示を待つ）。ここではその判断を強制する仕組みは持たない（本番DBと検証DBは
// そもそも完全分離されており、このAPIが向く先はいつもの `DATABASE_URL` そのまま）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

function parseEventId(idParam: string): number {
  const id = parseInt(idParam, 10);
  if (!id || isNaN(id)) throw new AppError(400, 'VALIDATION_ERROR', 'eventId が不正です');
  return id;
}

// ── 移行元候補の一覧（旧 awards_events） ────────────────────────────
router.get('/awards-migration/events', wrap(async (_req, res) => {
  const events = await listAwardsMigrationEvents();
  res.json({ success: true, data: events });
}));

// ── プレビュー（DBには一切書き込まない） ─────────────────────────────
router.get('/awards-migration/events/:eventId/preview', wrap(async (req, res) => {
  const eventId = parseEventId(req.params.eventId as string);
  const preview = await previewAwardsMigration(eventId);
  res.json({ success: true, data: preview });
}));

// ── 確定（1トランザクションでINSERT）。一括データ作成のため manager 以上を要求 ──────
router.post(
  '/awards-migration/events/:eventId/commit',
  requirePermission('qsheet', 'manager'),
  wrap(async (req, res) => {
    const eventId = parseEventId(req.params.eventId as string);
    const ownerId = typeof req.body?.ownerId === 'string' && req.body.ownerId.trim() ? req.body.ownerId.trim() : undefined;
    const result = await commitAwardsMigration(eventId, ownerId);
    res.json({ success: true, data: result });
  })
);

export default router;
