/**
 * ナレッジ（`qsheet_ai_knowledge`）の一覧・追加・承認 — 段9（04-ai.md §10-4）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { wrap, p1 } from './wrap';
import { createKnowledge, listKnowledge, updateKnowledge } from '../ai/knowledge';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

router.get('/ai/knowledge', wrap(async (req: Request, res: Response) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
  const segmentKey = typeof req.query.segment_key === 'string' ? req.query.segment_key : undefined;
  const rows = await listKnowledge({ kind, segmentKey });
  res.json({ success: true, data: { knowledge: rows } });
}));

// 追加は manager 以上（§10-4）。誰でも書けると、承認前の draft が溢れて月次レビューが読み切れなくなる
router.post('/ai/knowledge', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  if (typeof b.body !== 'string' || !b.body.trim()) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'body を指定してください' } });
    return;
  }
  const row = await createKnowledge({
    kind: typeof b.kind === 'string' ? b.kind : null,
    segmentKey: typeof b.segment_key === 'string' ? b.segment_key : null,
    body: b.body,
    rationale: typeof b.rationale === 'string' ? b.rationale : null,
    sortOrder: typeof b.sort_order === 'number' ? b.sort_order : undefined,
  }, req.user!.id);
  res.json({ success: true, data: row });
}));

// 承認 / 却下 / 引退・本文の直し（§10-4）。manager 以上
router.put('/ai/knowledge/:id', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const row = await updateKnowledge(p1(req.params.id), {
    status: typeof b.status === 'string' ? (b.status as 'draft' | 'active' | 'retired') : undefined,
    body: typeof b.body === 'string' ? b.body : undefined,
    rationale: b.rationale === undefined ? undefined : (b.rationale as string | null),
    sortOrder: typeof b.sort_order === 'number' ? b.sort_order : undefined,
  }, req.user!.id);
  res.json({ success: true, data: row });
}));

export default router;
