/**
 * AI 生成4機能のうち①②③（段8・04-ai.md §10-1）。④壁打ちは `ai-chat.routes.ts`。
 *
 * **`data`/`qsheet_schedule_items` には一切書かない。** 生成サービスは
 * `qsheet_ai_proposals` へ保存するだけ（取り込みは段7の `/ai/proposals/:id/apply`）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { queryOne } from '../../../shared/db/connection';
import { canAccessDoc, canAccessSchedule, isQsheetAdmin } from '../access';
import { wrap } from './wrap';
import { NotFoundError, ValidationError, ProductionActiveError } from '../services/httpErrors';
import { isProductionLikelyActive } from '../services/cue-actual.service';
import { generateEventPlan } from '../ai/event-plan-ai.service';
import { generateScriptOutline, budgetSecOfScheduleItem } from '../ai/script-outline-ai.service';
import { generateScriptLines } from '../ai/script-line-ai.service';
import { markSpawned } from '../ai/chat.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

function proposalResponse(res: Response, proposal: unknown): void {
  res.json({ success: true, data: proposal });
}

async function requireDocAccess(req: Request, documentId: string) {
  const doc = await queryOne('SELECT created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
  if (!doc || !(await canAccessDoc(req.user!, documentId, (doc.created_by as string) ?? null))) {
    throw new NotFoundError('台本が見つかりません');
  }
}

async function requireScheduleAccess(req: Request, scheduleId: string) {
  const sch = await queryOne('SELECT created_by FROM qsheet_schedules WHERE id = ? AND deleted_at IS NULL', [scheduleId]);
  if (!sch || !(await canAccessSchedule(req.user!, scheduleId, (sch.created_by as string) ?? null))) {
    throw new NotFoundError('スケジュール表が見つかりません');
  }
}

// ── ①枠の叩き台 ───────────────────────────────────────────────
router.post('/ai/event-plan', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const scheduleId = typeof b.schedule_id === 'string' ? b.schedule_id : '';
  if (!scheduleId) throw new ValidationError('schedule_id を指定してください');
  await requireScheduleAccess(req, scheduleId);

  // 拠点・種別（14-schedule-v2-plan.md §3 B10）。任意——空なら今までどおり表・案件の値を使う
  const proposal = await generateEventPlan(
    scheduleId,
    {
      instruction: typeof b.instruction === 'string' ? b.instruction : undefined,
      isAdmin: isQsheetAdmin(req.user!),
      locationId: typeof b.location_id === 'string' && b.location_id ? b.location_id : undefined,
      category: typeof b.category === 'string' && b.category ? b.category : undefined,
    },
    req.user!.id,
  );
  proposalResponse(res, proposal);
}));

// ── ②骨格 ─────────────────────────────────────────────────────
router.post('/ai/script-outline', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const documentId = typeof b.document_id === 'string' ? b.document_id : '';
  const scheduleItemId = typeof b.schedule_item_id === 'string' ? b.schedule_item_id : undefined;
  if (!documentId) throw new ValidationError('document_id を指定してください（schedule_item_id は尺の上限を出すための補助）');
  await requireDocAccess(req, documentId);
  if (await isProductionLikelyActive(documentId)) throw new ProductionActiveError();

  const budgetSec = scheduleItemId ? await budgetSecOfScheduleItem(scheduleItemId) : null;
  const proposal = await generateScriptOutline(
    documentId,
    {
      budgetSec, instruction: typeof b.instruction === 'string' ? b.instruction : undefined,
      isAdmin: isQsheetAdmin(req.user!),
    },
    req.user!.id,
  );
  const fromMessageId = typeof b.from_message_id === 'string' ? b.from_message_id : null;
  if (fromMessageId) await markSpawned(fromMessageId, proposal.id);
  proposalResponse(res, proposal);
}));

// ── ③セリフ ────────────────────────────────────────────────────
router.post('/ai/script-lines', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const documentId = typeof b.document_id === 'string' ? b.document_id : '';
  if (!documentId) throw new ValidationError('document_id を指定してください');
  await requireDocAccess(req, documentId);
  if (await isProductionLikelyActive(documentId)) throw new ProductionActiveError();

  const proposal = await generateScriptLines(
    documentId,
    {
      rowIds: Array.isArray(b.row_ids) ? b.row_ids.map(String) : undefined,
      sectionIds: Array.isArray(b.section_ids) ? b.section_ids.map(String) : undefined,
      instruction: typeof b.instruction === 'string' ? b.instruction : undefined,
      isAdmin: isQsheetAdmin(req.user!),
    },
    req.user!.id,
  );
  proposalResponse(res, proposal);
}));

export default router;
