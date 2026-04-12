import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// ============================================================
// 管理者API (認証 + interactive権限)
// ============================================================

router.get('/events/:eventId/questions', requireAuth, requirePermission('interactive'), wrap(async (req, res) => {
  const questions = await queryAll(
    `SELECT q.*,
      (SELECT json_agg(json_build_object('language_code', t.language_code, 'question_text', t.question_text, 'choices', t.choices) ORDER BY t.language_code)
       FROM interactive_question_texts t WHERE t.question_id = q.id) as texts,
      (SELECT COUNT(*)::int FROM interactive_answers a WHERE a.question_id = q.id) as answer_count
     FROM interactive_questions q
     WHERE q.event_id = ?
     ORDER BY q.sort_order, q.created_at`,
    [req.params.eventId]
  );
  res.json({ success: true, data: questions });
}));

router.post('/events/:eventId/questions', requireAuth, requirePermission('interactive'), wrap(async (req, res) => {
  const { type, correct_index, texts } = req.body;
  if (!texts?.length) throw new AppError(400, 'VALIDATION_ERROR', 'テキストは必須です');

  const maxOrder = await queryOne(
    'SELECT COALESCE(MAX(sort_order), -1)::int + 1 as next FROM interactive_questions WHERE event_id = ?',
    [req.params.eventId]
  ) as any;

  const qId = uuid();
  await execute(
    `INSERT INTO interactive_questions (id, event_id, type, correct_index, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [qId, req.params.eventId, type || 'quiz', correct_index ?? null, maxOrder?.next || 0]
  );

  for (const t of texts) {
    await execute(
      `INSERT INTO interactive_question_texts (id, question_id, language_code, question_text, choices) VALUES (?, ?, ?, ?, ?)`,
      [uuid(), qId, t.language_code || 'ja', t.question_text || '', JSON.stringify(t.choices || [])]
    );
  }

  const row = await queryOne('SELECT * FROM interactive_questions WHERE id = ?', [qId]);
  res.status(201).json({ success: true, data: row });
}));

router.delete('/questions/:id', requireAuth, requirePermission('interactive'), wrap(async (req, res) => {
  await execute('DELETE FROM interactive_questions WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

router.post('/questions/:id/activate', requireAuth, requirePermission('interactive'), wrap(async (req, res) => {
  const q = await queryOne('SELECT event_id, status FROM interactive_questions WHERE id = ?', [req.params.id]) as any;
  if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

  // 他のactiveな問題をcloseする
  await execute(`UPDATE interactive_questions SET status = 'closed', closed_at = NOW() WHERE event_id = ? AND status = 'active'`, [q.event_id]);
  // 再出題の場合、前回の回答をクリアして再度受付可能にする
  if (q.status === 'closed') {
    await execute('DELETE FROM interactive_answers WHERE question_id = ?', [req.params.id]);
  }
  await execute(`UPDATE interactive_questions SET status = 'active', activated_at = NOW() WHERE id = ?`, [req.params.id]);

  const io = (req as any).app?.get('io');
  if (io) {
    const texts = await queryAll('SELECT * FROM interactive_question_texts WHERE question_id = ?', [req.params.id]);
    io.of('/interactive').to(`event:${q.event_id}`).emit('question:active', { questionId: req.params.id, texts });
  }
  res.json({ success: true });
}));

router.post('/questions/:id/close', requireAuth, requirePermission('interactive'), wrap(async (req, res) => {
  const q = await queryOne('SELECT event_id, correct_index FROM interactive_questions WHERE id = ?', [req.params.id]) as any;
  if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

  await execute(`UPDATE interactive_questions SET status = 'closed', closed_at = NOW() WHERE id = ?`, [req.params.id]);

  const io = (req as any).app?.get('io');
  if (io) {
    io.of('/interactive').to(`event:${q.event_id}`).emit('question:closed', { questionId: req.params.id, correctIndex: q.correct_index });
  }
  res.json({ success: true });
}));

router.get('/questions/:id/results/json', requireAuth, wrap(async (req, res) => {
  const q = await queryOne('SELECT * FROM interactive_questions WHERE id = ?', [req.params.id]) as any;
  const texts = await queryAll('SELECT * FROM interactive_question_texts WHERE question_id = ?', [req.params.id]);
  const results = await getResults(String(req.params.id));
  res.json({ questionId: req.params.id, type: q?.type, correctIndex: q?.correct_index, status: q?.status,
    texts: texts.map((t: any) => ({ lang: t.language_code, question: t.question_text, choices: typeof t.choices === 'string' ? JSON.parse(t.choices) : t.choices })),
    results });
}));

router.post('/events/:eventId/questions/import', requireAuth, requirePermission('interactive'), wrap(async (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions)) throw new AppError(400, 'VALIDATION_ERROR', 'questions配列は必須です');

  let order = ((await queryOne('SELECT COALESCE(MAX(sort_order), -1)::int as m FROM interactive_questions WHERE event_id = ?', [req.params.eventId]) as any)?.m || 0) + 1;

  for (const q of questions) {
    const qId = uuid();
    await execute(`INSERT INTO interactive_questions (id, event_id, type, correct_index, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [qId, req.params.eventId, q.type || 'quiz', q.correct_index ?? null, order++]);
    if (q.texts) {
      for (const t of q.texts) {
        await execute(`INSERT INTO interactive_question_texts (id, question_id, language_code, question_text, choices) VALUES (?, ?, ?, ?, ?)`,
          [uuid(), qId, t.language_code || 'ja', t.question_text || '', JSON.stringify(t.choices || [])]);
      }
    }
  }
  res.json({ success: true, message: `${questions.length}問をインポートしました` });
}));

// ============================================================
// 視聴者API (認証不要)
// ============================================================

router.post('/audience/questions/:id/answer', wrap(async (req, res) => {
  const { choice_index, session_token } = req.body;
  if (choice_index === undefined) throw new AppError(400, 'VALIDATION_ERROR', 'choice_indexは必須です');

  const q = await queryOne('SELECT id, status FROM interactive_questions WHERE id = ?', [req.params.id]) as any;
  if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');
  if (q.status !== 'active') throw new AppError(400, 'QUESTION_CLOSED', '回答受付は終了しています');

  let sessionId: string | null = null;
  if (session_token) {
    const s = await queryOne('SELECT id FROM interactive_sessions WHERE session_token = ?', [session_token]) as any;
    sessionId = s?.id || null;
  }

  try {
    await execute(`INSERT INTO interactive_answers (id, question_id, session_id, choice_index) VALUES (?, ?, ?, ?)`,
      [uuid(), req.params.id, sessionId, choice_index]);
  } catch (err: any) {
    if (err?.code === '23505') throw new AppError(409, 'ALREADY_ANSWERED', '既に回答済みです');
    throw err;
  }
  res.json({ success: true });
}));

async function getResults(questionId: string) {
  const rows = await queryAll(`SELECT choice_index, COUNT(*)::int as count FROM interactive_answers WHERE question_id = ? GROUP BY choice_index ORDER BY choice_index`, [questionId]);
  const total = rows.reduce((s: number, r: any) => s + (r.count || 0), 0);
  return { total, choices: rows.map((r: any) => ({ index: r.choice_index, count: r.count, percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0 })) };
}

export default router;
