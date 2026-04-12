import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// ============================================================
// 管理者API (認証必須)
// ============================================================

// 問題一覧
router.get('/events/:eventId/questions', requireAuth, async (req: Request, res: Response) => {
  const questions = await queryAll(
    `SELECT q.*,
      (SELECT json_agg(json_build_object('language_code', t.language_code, 'question_text', t.question_text, 'choices', t.choices) ORDER BY t.language_code)
       FROM interactive_question_texts t WHERE t.question_id = q.id) as texts,
      (SELECT COUNT(*)::int FROM interactive_answers a WHERE a.question_id = q.id) as answer_count
     FROM interactive_questions q
     WHERE q.event_id = $1
     ORDER BY q.sort_order, q.created_at`,
    [String(req.params.eventId)]
  );
  res.json({ success: true, data: questions });
});

// 問題作成
router.post('/events/:eventId/questions', requireAuth, async (req: Request, res: Response) => {
  const { type, correct_index, texts, config } = req.body;
  // texts: [{ language_code: 'ja', question_text: '...', choices: ['A','B','C'] }, ...]

  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'テキストは必須です');
  }

  const maxOrder = await queryOne(
    'SELECT COALESCE(MAX(sort_order), -1)::int + 1 as next FROM interactive_questions WHERE event_id = $1',
    [String(req.params.eventId)]
  ) as any;

  const qId = uuid();
  await execute(
    `INSERT INTO interactive_questions (id, event_id, type, correct_index, sort_order, config)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [qId, String(req.params.eventId), type || 'quiz', correct_index ?? null, maxOrder?.next || 0, JSON.stringify(config || {})]
  );

  for (const t of texts) {
    await execute(
      `INSERT INTO interactive_question_texts (id, question_id, language_code, question_text, choices)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuid(), qId, t.language_code || 'ja', t.question_text || '', JSON.stringify(t.choices || [])]
    );
  }

  const row = await queryOne('SELECT * FROM interactive_questions WHERE id = $1', [qId]);
  res.status(201).json({ success: true, data: row });
});

// 問題更新
router.put('/questions/:id', requireAuth, async (req: Request, res: Response) => {
  const { type, correct_index, texts, config, sort_order } = req.body;

  await execute(
    `UPDATE interactive_questions
     SET type = COALESCE($1, type), correct_index = $2, config = COALESCE($3, config),
         sort_order = COALESCE($4, sort_order), updated_at = NOW()
     WHERE id = $5`,
    [type, correct_index ?? null, config ? JSON.stringify(config) : null, sort_order, String(req.params.id)]
  );

  // テキスト更新 (upsert)
  if (texts && Array.isArray(texts)) {
    for (const t of texts) {
      await execute(
        `INSERT INTO interactive_question_texts (id, question_id, language_code, question_text, choices)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (question_id, language_code) DO UPDATE
         SET question_text = EXCLUDED.question_text, choices = EXCLUDED.choices`,
        [uuid(), String(req.params.id), t.language_code || 'ja', t.question_text || '', JSON.stringify(t.choices || [])]
      );
    }
  }

  const row = await queryOne('SELECT * FROM interactive_questions WHERE id = $1', [String(req.params.id)]);
  res.json({ success: true, data: row });
});

// 問題削除
router.delete('/questions/:id', requireAuth, async (req: Request, res: Response) => {
  await execute('DELETE FROM interactive_questions WHERE id = $1', [String(req.params.id)]);
  res.json({ success: true });
});

// 集計開始 (active にする)
router.post('/questions/:id/activate', requireAuth, async (req: Request, res: Response) => {
  // 同じイベントの他のactiveな問題をclosedにする
  const q = await queryOne('SELECT event_id FROM interactive_questions WHERE id = $1', [String(req.params.id)]) as any;
  if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

  await execute(
    `UPDATE interactive_questions SET status = 'closed', closed_at = NOW() WHERE event_id = $1 AND status = 'active'`,
    [q.event_id]
  );
  await execute(
    `UPDATE interactive_questions SET status = 'active', activated_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [String(req.params.id)]
  );

  // Socket.IO でリアルタイム通知
  const io = (req as any).app?.get('io');
  if (io) {
    const texts = await queryAll('SELECT * FROM interactive_question_texts WHERE question_id = $1', [String(req.params.id)]);
    io.of('/interactive').to(`event:${String(q.event_id)}`).emit('question:active', {
      questionId: String(req.params.id),
      texts,
    });
  }

  res.json({ success: true, message: '集計を開始しました' });
});

// 集計終了
router.post('/questions/:id/close', requireAuth, async (req: Request, res: Response) => {
  const q = await queryOne('SELECT event_id, correct_index FROM interactive_questions WHERE id = $1', [String(req.params.id)]) as any;
  if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

  await execute(
    `UPDATE interactive_questions SET status = 'closed', closed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [String(req.params.id)]
  );

  // Socket.IO で結果通知
  const io = (req as any).app?.get('io');
  if (io) {
    const results = await getQuestionResults(String(req.params.id));
    io.of('/interactive').to(`event:${String(q.event_id)}`).emit('question:closed', {
      questionId: String(req.params.id),
      correctIndex: q.correct_index,
      results,
    });
  }

  res.json({ success: true, message: '集計を終了しました' });
});

// 集計結果取得
router.get('/questions/:id/results', requireAuth, async (req: Request, res: Response) => {
  const results = await getQuestionResults(String(req.params.id));
  const question = await queryOne('SELECT * FROM interactive_questions WHERE id = $1', [String(req.params.id)]);
  const texts = await queryAll('SELECT * FROM interactive_question_texts WHERE question_id = $1', [String(req.params.id)]);
  res.json({ success: true, data: { question, texts, results } });
});

// 結果JSON出力 (Singular Live等向け)
router.get('/questions/:id/results/json', requireAuth, async (req: Request, res: Response) => {
  const results = await getQuestionResults(String(req.params.id));
  const question = await queryOne('SELECT * FROM interactive_questions WHERE id = $1', [String(req.params.id)]) as any;
  const texts = await queryAll('SELECT * FROM interactive_question_texts WHERE question_id = $1', [String(req.params.id)]);

  const output = {
    questionId: String(req.params.id),
    type: question?.type,
    correctIndex: question?.correct_index,
    status: question?.status,
    texts: texts.map((t: any) => ({
      lang: t.language_code,
      question: t.question_text,
      choices: typeof t.choices === 'string' ? JSON.parse(t.choices) : t.choices,
    })),
    results,
    timestamp: new Date().toISOString(),
  };

  res.json(output);
});

// Excel一括インポート
router.post('/events/:eventId/questions/import', requireAuth, async (req: Request, res: Response) => {
  const { questions } = req.body;
  // questions: [{ type, correct_index, texts: [{ language_code, question_text, choices }] }]

  if (!questions || !Array.isArray(questions)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'questions配列は必須です');
  }

  let count = 0;
  const maxOrder = await queryOne(
    'SELECT COALESCE(MAX(sort_order), -1)::int as max FROM interactive_questions WHERE event_id = $1',
    [String(req.params.eventId)]
  ) as any;
  let order = (maxOrder?.max || 0) + 1;

  for (const q of questions) {
    const qId = uuid();
    await execute(
      `INSERT INTO interactive_questions (id, event_id, type, correct_index, sort_order, config)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [qId, String(req.params.eventId), q.type || 'quiz', q.correct_index ?? null, order++, JSON.stringify(q.config || {})]
    );

    if (q.texts && Array.isArray(q.texts)) {
      for (const t of q.texts) {
        await execute(
          `INSERT INTO interactive_question_texts (id, question_id, language_code, question_text, choices)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuid(), qId, t.language_code || 'ja', t.question_text || '', JSON.stringify(t.choices || [])]
        );
      }
    }
    count++;
  }

  res.json({ success: true, message: `${count}問をインポートしました` });
});

// ============================================================
// 視聴者API (認証不要)
// ============================================================

// アクティブな問題取得 (視聴者向け)
router.get('/audience/events/:eventId/active-question', async (req: Request, res: Response) => {
  const lang = String(req.query.lang || 'ja');

  const q = await queryOne(
    `SELECT q.id, q.type, q.status, q.activated_at, q.config
     FROM interactive_questions q
     WHERE q.event_id = $1 AND q.status = 'active'
     LIMIT 1`,
    [String(req.params.eventId)]
  ) as any;

  if (!q) {
    res.json({ success: true, data: null });
    return;
  }

  const text = await queryOne(
    `SELECT question_text, choices FROM interactive_question_texts
     WHERE question_id = $1 AND language_code = $2`,
    [q.id, lang]
  ) as any;

  // フォールバック: 指定言語がなければ最初のテキスト
  const fallback = text || await queryOne(
    `SELECT question_text, choices FROM interactive_question_texts
     WHERE question_id = $1 ORDER BY language_code LIMIT 1`,
    [q.id]
  ) as any;

  res.json({
    success: true,
    data: {
      questionId: q.id,
      type: q.type,
      questionText: fallback?.question_text || '',
      choices: typeof fallback?.choices === 'string' ? JSON.parse(fallback.choices) : (fallback?.choices || []),
      activatedAt: q.activated_at,
    },
  });
});

// 回答送信 (視聴者)
router.post('/audience/questions/:id/answer', async (req: Request, res: Response) => {
  const { choice_index, session_token } = req.body;

  if (choice_index === undefined || choice_index === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'choice_indexは必須です');
  }

  // セッション検証
  const session = await queryOne(
    'SELECT id FROM interactive_sessions WHERE session_token = $1',
    [session_token]
  ) as any;

  const q = await queryOne('SELECT id, status, event_id FROM interactive_questions WHERE id = $1', [String(req.params.id)]) as any;
  if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');
  if (q.status !== 'active') throw new AppError(400, 'QUESTION_CLOSED', 'この問題の回答受付は終了しています');

  try {
    await execute(
      `INSERT INTO interactive_answers (id, question_id, session_id, choice_index)
       VALUES ($1, $2, $3, $4)`,
      [uuid(), String(req.params.id), session?.id || null, choice_index]
    );
  } catch (err: any) {
    if (err?.message?.includes('unique') || err?.code === '23505') {
      throw new AppError(409, 'ALREADY_ANSWERED', '既に回答済みです');
    }
    throw err;
  }

  // リアルタイム集計更新
  const io = (req as any).app?.get('io');
  if (io) {
    const results = await getQuestionResults(String(req.params.id));
    io.of('/interactive').to(`admin:${String(q.event_id)}`).emit('question:results', {
      questionId: String(req.params.id),
      results,
    });
  }

  res.json({ success: true, message: '回答を受け付けました' });
});

// ============================================================
// Helper
// ============================================================
async function getQuestionResults(questionId: string) {
  const rows = await queryAll(
    `SELECT choice_index, COUNT(*)::int as count
     FROM interactive_answers
     WHERE question_id = $1
     GROUP BY choice_index
     ORDER BY choice_index`,
    [questionId]
  );
  const total = rows.reduce((s: number, r: any) => s + (r.count || 0), 0);
  return {
    total,
    choices: rows.map((r: any) => ({
      index: r.choice_index,
      count: r.count,
      percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
    })),
  };
}

export default router;
