import { Router, Request, Response, NextFunction } from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchCues, fetchProjectInteractiveLinkFull, mapPage } from '../store';
import { interactiveBridge } from '../services/interactive-bridge.service';
import { clearVoteTimers } from '../services/vote-lifecycle.service';

// テロップCG — 投票ページ（part_key: 'vote'）と外部インタラクティブの設問の紐付けAPI（段6-7）。
// `fields.interactiveQuestionId` はオペレーターが手入力するものではなく、ここで発行される
// （client-techops/src/pages/graphics/voteInteractive.ts のコメント参照）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

async function loadVotePage(id: number) {
  const existing = id && !isNaN(id) ? await queryOne(`SELECT * FROM graphics_pages WHERE id = ?`, [id]) : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ページが見つかりません');
  if (existing.part_key !== 'vote') {
    throw new AppError(400, 'VALIDATION_ERROR', 'このページは投票・クイズ部品（vote）ではありません');
  }
  return existing;
}

function choiceLabel(c: unknown): string {
  if (!c || typeof c !== 'object') return '';
  const label = (c as Record<string, unknown>).label;
  return typeof label === 'string' ? label : '';
}

function choiceLabelEn(c: unknown): string {
  if (!c || typeof c !== 'object') return '';
  const labelEn = (c as Record<string, unknown>).labelEn;
  return typeof labelEn === 'string' ? labelEn : '';
}

async function emitPageSync(req: Request, projectId: number, page: ReturnType<typeof mapPage>): Promise<void> {
  const io = req.app.get('io');
  if (!io) return;
  const cues = await fetchCues(projectId);
  io.of('/graphics').to(`project:${projectId}`).emit('cg:sync', { cues, page, timestamp: Date.now() });
}

// ── 投票ページの本文・選択肢を外部インタラクティブへ同期し、設問と紐付ける ────────
router.post('/pages/:id/vote/sync-interactive', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = await loadVotePage(id);
  const projectId = existing.project_id as number;

  const link = await fetchProjectInteractiveLinkFull(projectId);
  if (!link || !link.baseUrl || !link.apiKeySecret) {
    throw new AppError(400, 'NOT_CONFIGURED', 'Interactive 連携が設定されていません');
  }

  const fields = (existing.fields ?? {}) as Record<string, unknown>;
  const question = typeof fields.question === 'string' ? fields.question : '';
  const questionEn = typeof fields.questionEn === 'string' && fields.questionEn ? fields.questionEn : question;
  const choicesRaw = Array.isArray(fields.choices) ? fields.choices : [];
  const labelsJa = choicesRaw.map((c) => choiceLabel(c));
  const labelsEn = choicesRaw.map((c, i) => choiceLabelEn(c) || labelsJa[i] || '');
  const existingQuestionId = typeof fields.interactiveQuestionId === 'string' ? fields.interactiveQuestionId : null;

  const synced = await interactiveBridge.syncQuestions(link, [{
    interactiveQuestionId: existingQuestionId,
    type: 'survey',
    texts: [
      { lang: 'ja', question, choices: labelsJa },
      { lang: 'en', question: questionEn, choices: labelsEn },
    ],
  }]);

  const newQuestionId = synced?.[0]?.interactiveQuestionId ?? existingQuestionId;
  const nextFields = { ...fields, interactiveQuestionId: newQuestionId };
  const row = await queryOne(
    `UPDATE graphics_pages SET fields = ?::jsonb, updated_at = NOW() WHERE id = ? RETURNING *`,
    [JSON.stringify(nextFields), id],
  );
  const page = mapPage(row!);
  await emitPageSync(req, projectId, page);
  res.json({ success: true, data: page });
}));

// ── 外部インタラクティブとの紐付けを解除する ─────────────────────────────
router.post('/pages/:id/vote/dismiss-interactive', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = await loadVotePage(id);
  const projectId = existing.project_id as number;
  const fields = (existing.fields ?? {}) as Record<string, unknown>;
  const questionId = typeof fields.interactiveQuestionId === 'string' ? fields.interactiveQuestionId : null;

  if (questionId) {
    const link = await fetchProjectInteractiveLinkFull(projectId);
    if (link?.baseUrl && link?.apiKeySecret) {
      try {
        await interactiveBridge.dismissQuestion(link, questionId);
      } catch (err) {
        // 外部側が消せなくても、連携解除自体（fields のクリア）は続行する
        console.warn('[vote-interactive] dismissQuestion failed:', (err as Error).message);
      }
    }
  }

  // 連携を完全に解除する操作なので、予約中のタイマー（自動締切・外部締切）も止める
  clearVoteTimers(id);

  const nextFields = { ...fields };
  delete nextFields.interactiveQuestionId;
  delete nextFields.openedAt;
  delete nextFields.countdownSeconds;

  const row = await queryOne(
    `UPDATE graphics_pages SET fields = ?::jsonb, updated_at = NOW() WHERE id = ? RETURNING *`,
    [JSON.stringify(nextFields), id],
  );
  const page = mapPage(row!);
  await emitPageSync(req, projectId, page);
  res.json({ success: true, data: page });
}));

export default router;
