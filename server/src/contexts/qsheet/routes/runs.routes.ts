// 本番の実尺 (qsheet_cue_actuals) — 記録 (POST) と読み出し (GET)。
//
// POST は本番中に走る唯一の書き込み。**best-effort**: 検査に落ちても・権限が無くても・
// DB が落ちていても常に 204 を返す (4xx/5xx を返すと axios が例外を投げ、
// 未処理の Promise 拒否で本番中のコンソールを汚す)。
// GET は本番中には呼ばれない (過去の run を見る画面用)。通常どおり 200/403/404/500 を返す。
//
// 設計: docs/design/v4/qsheet-v4-coding/impl/01-cue-actuals-impl.md §5-4
import { Router, Request, Response } from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessDoc } from '../access';
import { listCueActuals, listRuns, recordCueActual, sanitizeCueActual } from '../services/cue-actual.service';

const router = Router();

// documents.routes.ts:11 と同じ慣習
router.use(requireAuth, requirePermission('qsheet'));

// ============================================================
// 実尺の記録 — 本番中に走る唯一の書き込み (best-effort)
// ============================================================
router.post('/runs/:documentId/cues', async (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId as string;
    const input = sanitizeCueActual(req.body);
    if (!input) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[qsheet-cue-actual] 検査に失敗した body を破棄しました', req.body);
      }
      res.status(204).end();
      return;
    }

    const doc = await queryOne(
      'SELECT created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc || !(await canAccessDoc(req.user!, documentId, (doc.created_by as string | null) ?? null))) {
      res.status(204).end();
      return;
    }

    void recordCueActual(documentId, input, req.user!.id);   // await しない
    res.status(204).end();
  } catch (e) {
    // 記録経路のどこで失敗しても本番中に 500 を出さない
    console.warn('[qsheet-cue-actual] POST 処理に失敗しました', e);
    res.status(204).end();
  }
});

// ============================================================
// 過去の run と実尺 (本番中には呼ばれない。通常どおり 200/403/404/500)
//   ?run_id=xxx を渡すと、その run のキュー単位の実尺行を返す。
//   渡さなければ run の要約一覧を返す。
// ============================================================
router.get('/runs/:documentId', async (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId as string;
    const doc = await queryOne(
      'SELECT created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    if (!(await canAccessDoc(req.user!, documentId, (doc.created_by as string | null) ?? null))) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }

    const runId = typeof req.query.run_id === 'string' ? req.query.run_id : undefined;
    if (runId) {
      const cues = await listCueActuals(documentId, runId);
      res.json({ success: true, data: cues });
      return;
    }

    const runs = await listRuns(documentId);
    res.json({ success: true, data: runs });
  } catch (err: unknown) {
    console.error('GET /runs/:documentId error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
