import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// 認証なしで返してよい quiz_choices の列 (SELECT * は不可: is_correct を含むため。
// is_correct 自体はレスポンス形を変えないために残し、正解発表前は false にマスクする)
const PUBLIC_CHOICE_COLUMNS =
  'id, quiz_id, position, name, name_en, company, company_en, ' +
  'nomination_title, nomination_title_en, photo_data_url, vote_count, is_correct';

// 出力 URL から認証なしで quiz スナップショットを取得
router.get('/quizzes/:id/public', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const quiz = await queryOne(`SELECT * FROM quizzes WHERE id = ?`, [id]);
  if (!quiz) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');
  // 正解 (is_correct) は correct-reveal に TAKE されるまで公開しない
  const cue = await queryOne(`SELECT step FROM quiz_cue_state WHERE quiz_id = ?`, [id]);
  const revealed = cue?.step === 'correct-reveal';
  const choices = (await queryAll(
    `SELECT ${PUBLIC_CHOICE_COLUMNS} FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
    [id]
  )).map((c) => (revealed ? c : { ...c, is_correct: false }));
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
  const cue = await queryOne(
    `SELECT current_quiz_id, step, poll_started_at, reveal_phase FROM quiz_stack_state WHERE event_id = ?`,
    [eventId]
  );
  const ids = quizzes.map((q) => q.id);
  let choicesByQuiz: Record<number, unknown[]> = {};
  if (ids.length) {
    const all = await queryAll(
      `SELECT ${PUBLIC_CHOICE_COLUMNS} FROM quiz_choices WHERE quiz_id = ANY(?) ORDER BY quiz_id, position`,
      [ids]
    );
    // 正解 (is_correct) は correct-reveal に TAKE された現在の quiz の分だけ公開する
    const revealedQuizId = cue?.step === 'correct-reveal' ? (cue.current_quiz_id as number | null) : null;
    choicesByQuiz = all.reduce((acc: Record<number, unknown[]>, c) => {
      const qid = c.quiz_id as number;
      (acc[qid] = acc[qid] || []).push(qid === revealedQuizId ? c : { ...c, is_correct: false });
      return acc;
    }, {});
  }
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
