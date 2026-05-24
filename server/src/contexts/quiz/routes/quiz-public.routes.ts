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

export default router;
