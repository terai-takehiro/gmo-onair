/**
 * AI 提案の読み取り・取り込み・締め — 段7（04-ai.md §10-2）。
 * **生成（POST での新規作成）は無い。** この段は「AI が出したものを受け止める器」。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { execute, queryOne } from '../../../shared/db/connection';
import { canAccessDoc, canAccessProposal, canAccessSchedule } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { applyProposal, discardProposal, markProposalWrong } from '../ai/apply.service';
import { settleProposalManual } from '../ai/settle.service';
import { getProposal, listProposals, proposalStats } from '../ai/proposals.service';
import type { ApplyRequestBody } from '../ai/types';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireProposalAccess(req: Request, id: string) {
  const row = await getProposal(id);
  if (!(await canAccessProposal(req.user!, row))) throw new NotFoundError('提案が見つかりません');
  return row;
}

// ── 一覧・単体 ─────────────────────────────────────────────
router.get('/ai/proposals', wrap(async (req: Request, res: Response) => {
  const documentId = typeof req.query.document_id === 'string' ? req.query.document_id : undefined;
  const scheduleId = typeof req.query.schedule_id === 'string' ? req.query.schedule_id : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;

  if (documentId) {
    const doc = await queryOne('SELECT created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
    if (!doc || !(await canAccessDoc(req.user!, documentId, (doc.created_by as string) ?? null))) {
      throw new NotFoundError('台本が見つかりません');
    }
  } else if (scheduleId) {
    const sch = await queryOne('SELECT created_by FROM qsheet_schedules WHERE id = ? AND deleted_at IS NULL', [scheduleId]);
    if (!sch || !(await canAccessSchedule(req.user!, scheduleId, (sch.created_by as string) ?? null))) {
      throw new NotFoundError('スケジュール表が見つかりません');
    }
  }
  const rows = await listProposals({ documentId, scheduleId, state });
  res.json({ success: true, data: { proposals: rows } });
}));

// ⚠️ `/ai/proposals/stats` は `/ai/proposals/:id` より前に置くこと（`stats` が id に食われる）
router.get('/ai/proposals/stats', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  const windowDays = Math.min(365, Math.max(1, Number(req.query.window_days) || 90));
  const stats = await proposalStats(windowDays);
  res.json({ success: true, data: { window_days: windowDays, stats } });
}));

router.get('/ai/proposals/:id', wrap(async (req: Request, res: Response) => {
  const row = await requireProposalAccess(req, p1(req.params.id));
  res.json({ success: true, data: row });
}));

// ── 取り込み・捨てる・締める・「これは違う」 ─────────────────
router.post('/ai/proposals/:id/apply', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireProposalAccess(req, p1(req.params.id));
  const b = req.body as Record<string, unknown>;
  if (b.applied_payload === undefined) throw new ValidationError('applied_payload を指定してください');
  const body: ApplyRequestBody = {
    applied_payload: b.applied_payload,
    applied_ids: (b.applied_ids ?? {}) as ApplyRequestBody['applied_ids'],
    rejected_keys: Array.isArray(b.rejected_keys) ? b.rejected_keys.map(String) : undefined,
  };
  const result = await applyProposal(p1(req.params.id), body, req.user!.id);
  res.json({
    success: true,
    data: { id: p1(req.params.id), state: 'applied', applied_at: result.appliedAt, dropped_count: result.droppedCount },
  });
}));

router.post('/ai/proposals/:id/discard', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireProposalAccess(req, p1(req.params.id));
  const reason = typeof (req.body as Record<string, unknown>)?.reason === 'string' ? (req.body as Record<string, unknown>).reason as string : null;
  await discardProposal(p1(req.params.id), reason, req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.id), state: 'discarded' } });
}));

router.post('/ai/proposals/:id/settle', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireProposalAccess(req, p1(req.params.id));
  await settleProposalManual(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

router.post('/ai/proposals/:id/wrong', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireProposalAccess(req, p1(req.params.id));
  const note = typeof (req.body as Record<string, unknown>)?.note === 'string' ? (req.body as Record<string, unknown>).note as string : null;
  await markProposalWrong(p1(req.params.id), note, req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

// ── 修正種別の人手上書き（manager 以上・§10-4） ───────────────
router.put('/ai/corrections/:id', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  const type = (req.body as Record<string, unknown>)?.correction_type;
  const allowed = ['fix', 'enrich', 'reject', 'rephrase', 'none'];
  if (typeof type !== 'string' || !allowed.includes(type)) {
    throw new ValidationError('correction_type は fix/enrich/reject/rephrase/none のいずれかで指定してください');
  }
  await execute('UPDATE ai_corrections SET correction_type = ? WHERE id = ?', [type, p1(req.params.id)]);
  res.json({ success: true, data: { id: p1(req.params.id), correction_type: type } });
}));

export default router;
