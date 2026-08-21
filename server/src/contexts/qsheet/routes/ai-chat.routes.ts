/**
 * ④壁打ち（対話）のルート（段8・04-ai.md §10-3）。**本人のみ**（§14-8）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessThread } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import {
  createThread, getThread, listThreads, listMessages, deleteThread, postMessage, setMessageFeedback,
  threadIdOfMessage,
} from '../ai/chat.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireThreadAccess(req: Request, id: string) {
  const thread = await getThread(id);
  if (!canAccessThread(req.user!, thread)) throw new NotFoundError('スレッドが見つかりません');
  return thread;
}

router.post('/ai/threads', wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const thread = await createThread({
    title: typeof b.title === 'string' ? b.title : undefined,
    projectId: typeof b.project_id === 'string' ? b.project_id : null,
    scheduleId: typeof b.schedule_id === 'string' ? b.schedule_id : null,
    documentId: typeof b.document_id === 'string' ? b.document_id : null,
  }, req.user!);
  res.json({ success: true, data: thread });
}));

router.get('/ai/threads', wrap(async (req: Request, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const threads = await listThreads(req.user!.id, {
    projectId: typeof q.project_id === 'string' ? q.project_id : undefined,
    documentId: typeof q.document_id === 'string' ? q.document_id : undefined,
    scheduleId: typeof q.schedule_id === 'string' ? q.schedule_id : undefined,
  });
  res.json({ success: true, data: { threads } });
}));

router.get('/ai/threads/:id', wrap(async (req: Request, res: Response) => {
  const thread = await requireThreadAccess(req, p1(req.params.id));
  const messages = await listMessages(thread.id);
  res.json({ success: true, data: { ...thread, messages } });
}));

router.delete('/ai/threads/:id', wrap(async (req: Request, res: Response) => {
  const thread = await requireThreadAccess(req, p1(req.params.id));
  await deleteThread(thread.id);
  res.json({ success: true, data: { id: thread.id } });
}));

router.post('/ai/threads/:id/messages', wrap(async (req: Request, res: Response) => {
  const thread = await requireThreadAccess(req, p1(req.params.id));
  const content = (req.body as Record<string, unknown>)?.content;
  if (typeof content !== 'string' || !content.trim()) throw new ValidationError('content を指定してください');
  const result = await postMessage(thread.id, content, req.user!.id);
  res.json({
    success: true,
    data: {
      user: result.user,
      assistant: {
        id: result.assistant.id, seq: result.assistant.seq, content: result.assistant.content,
        suggestion: result.assistant.suggestion, model: result.assistant.model,
        prompt_version: result.assistant.prompt_version,
      },
      history_truncated: result.historyTruncated,
    },
  });
}));

router.put('/ai/messages/:id/feedback', wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const feedback = b.feedback;
  if (feedback !== 'good' && feedback !== 'rephrase' && feedback !== 'reject') {
    throw new ValidationError('feedback は good/rephrase/reject のいずれかで指定してください');
  }
  // メッセージが属するスレッドの所有権チェック（`setMessageFeedback` はメッセージ id しか
  // 受けないため、先にスレッド経由で存在と所有権を確かめる）
  const messageId = p1(req.params.id);
  const threadId = await threadIdOfMessage(messageId);
  if (!threadId) throw new NotFoundError('発言が見つかりません');
  await requireThreadAccess(req, threadId);
  await setMessageFeedback(messageId, {
    feedback, note: typeof b.note === 'string' ? b.note : undefined,
  }, req.user!.id);
  res.json({ success: true, data: { id: messageId, feedback } });
}));

export default router;
