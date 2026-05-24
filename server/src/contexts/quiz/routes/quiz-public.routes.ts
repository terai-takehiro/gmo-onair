import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// 出力 URL から認証なしで quiz スナップショットを取得
router.get('/quizzes/:id/public', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const quiz = await queryOne(`SELECT * FROM quizzes WHERE id = ?`, [id]);
  if (!quiz) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');
  const choices = await queryAll(
    `SELECT * FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
    [id]
  );
  res.set('X-Robots-Tag', 'noindex');
  res.json({ success: true, data: { ...quiz, choices } });
}));

// イベント単位の stack: 全 quiz + choices + cue state を 1 回で返す (出力用)
router.get('/events/:eventId/quiz-stack/public', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const quizzes = await queryAll(
    `SELECT * FROM quizzes WHERE event_id = ? ORDER BY display_order, id`,
    [eventId]
  );
  const ids = quizzes.map((q) => q.id);
  let choicesByQuiz: Record<number, unknown[]> = {};
  if (ids.length) {
    const all = await queryAll(
      `SELECT * FROM quiz_choices WHERE quiz_id = ANY(?) ORDER BY quiz_id, position`,
      [ids]
    );
    choicesByQuiz = all.reduce((acc: Record<number, unknown[]>, c) => {
      const qid = c.quiz_id as number;
      (acc[qid] = acc[qid] || []).push(c);
      return acc;
    }, {});
  }
  const cue = await queryOne(
    `SELECT current_quiz_id, step, poll_started_at, reveal_phase FROM quiz_stack_state WHERE event_id = ?`,
    [eventId]
  );
  res.set('X-Robots-Tag', 'noindex');
  res.json({
    success: true,
    data: {
      quizzes: quizzes.map((q) => ({ ...q, choices: choicesByQuiz[q.id as number] ?? [] })),
      stack: cue
        ? {
            currentQuizId: cue.current_quiz_id ?? null,
            step: cue.step ?? 'idle',
            pollStartedAt: cue.poll_started_at
              ? new Date(cue.poll_started_at as string | number | Date).getTime()
              : null,
            revealPhase: cue.reveal_phase ?? 0,
          }
        : { currentQuizId: null, step: 'idle', pollStartedAt: null, revealPhase: 0 },
    },
  });
}));

export default router;
