/**
 * 制作資料のトップ（案件を選ぶ）・制作のジャーニー — API
 *
 * ⚠️ `documents.routes.ts:12` の `router.use(requireAuth, requirePermission('qsheet'))` は
 * **そのルーターだけ**に掛かる。ここは自分で書く（書き忘れると認証なしで
 * 案件名が出る）。`sales` 権限は要求しない（`lookup.routes.ts` に前例あり）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { getScopeCards, getJourneyForProject, getJourneyForDocument } from '../services/journey.service';

const router = Router();

router.use(requireAuth, requirePermission('qsheet'));

// ============================================================
// トップ（案件を選ぶ）— 4束の件数
// ============================================================
router.get('/scopes', async (req: Request, res: Response) => {
  try {
    const cards = await getScopeCards(req.user!);
    res.json({ success: true, data: cards });
  } catch (err: unknown) {
    console.error('GET /scopes error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 案件単位のジャーニー
// ============================================================
router.get('/scopes/project/:projectId/journey', async (req: Request, res: Response) => {
  try {
    const result = await getJourneyForProject(String(req.params.projectId));
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '案件が見つかりません' } });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err: unknown) {
    console.error('GET /scopes/project/:projectId/journey error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 資料単体のジャーニー（案件に紐づかない資料）
// ============================================================
router.get('/scopes/document/:docId/journey', async (req: Request, res: Response) => {
  try {
    const result = await getJourneyForDocument(String(req.params.docId), req.user!);
    if (!result) {
      // 存在秘匿のため、アクセス権が無いときも同じ 404（documents.routes.ts と同じ作法）
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '資料が見つかりません' } });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err: unknown) {
    console.error('GET /scopes/document/:docId/journey error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
