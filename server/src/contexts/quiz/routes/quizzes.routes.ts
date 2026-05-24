import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(['/quizzes', '/events'], requireAuth, requirePermission('awards'));

// ── イベント内 quizzes 一覧 ────────────────────────────
router.get('/events/:eventId/quizzes', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const rows = await queryAll(
    `SELECT * FROM quizzes WHERE event_id = ? ORDER BY display_order, id`,
    [eventId]
  );
  res.json({ success: true, data: rows });
}));

// ── 詳細 (choices 含む) ────────────────────────────────
router.get('/quizzes/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const quiz = await queryOne(`SELECT * FROM quizzes WHERE id = ?`, [id]);
  if (!quiz) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');
  const choices = await queryAll(
    `SELECT * FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
    [id]
  );
  res.json({ success: true, data: { ...quiz, choices } });
}));

// ── 作成 (choice_count 件の空 choice をシード) ─────────
router.post('/events/:eventId/quizzes', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const {
    title = '', title_en = null, question = '', question_en = null,
    choice_count: rawChoiceCount = 3,
    countdown_seconds: rawCountdown = 60,
    link_category_id = null,
    display = 'count',
    mode = 'survey',
    has_answer_check = false,
  } = req.body;

  const choiceCount = Math.max(2, Math.min(6, Math.floor(Number(rawChoiceCount) || 3)));
  const countdownSec = Math.max(5, Math.min(600, Math.floor(Number(rawCountdown) || 60)));
  const disp = display === 'percent' ? 'percent' : 'count';
  const md = mode === 'quiz' ? 'quiz' : 'survey';
  const hac = !!has_answer_check;

  const maxOrder = await queryOne(
    `SELECT COALESCE(MAX(display_order), 0) AS max FROM quizzes WHERE event_id = ?`,
    [eventId]
  );

  const quiz = await queryOne(
    `INSERT INTO quizzes (event_id, title, title_en, question, question_en,
                          choice_count, countdown_seconds, link_category_id, display, display_order,
                          mode, has_answer_check)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [eventId, title, title_en, question, question_en,
     choiceCount, countdownSec, link_category_id, disp, ((maxOrder?.max as number) ?? 0) + 1,
     md, hac]
  );
  if (!quiz) throw new AppError(500, 'INSERT_FAILED', 'quiz 作成失敗');

  // choice_count 件の空 choice を生成
  for (let pos = 1; pos <= choiceCount; pos++) {
    await execute(
      `INSERT INTO quiz_choices (quiz_id, position) VALUES (?, ?)`,
      [quiz.id, pos]
    );
  }
  // cue state も初期化
  await execute(
    `INSERT INTO quiz_cue_state (quiz_id) VALUES (?) ON CONFLICT DO NOTHING`,
    [quiz.id]
  );

  res.status(201).json({ success: true, data: quiz });
}));

// ── 更新 ─────────────────────────────────────────────
router.put('/quizzes/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const cur = await queryOne(`SELECT * FROM quizzes WHERE id = ?`, [id]);
  if (!cur) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');

  const {
    title, title_en, question, question_en,
    choice_count, countdown_seconds, link_category_id, display, display_order,
    mode, has_answer_check,
  } = req.body;

  const curChoiceCount = Number(cur.choice_count) || 3;
  const curCountdown = Number(cur.countdown_seconds) || 60;
  const newChoiceCount = choice_count !== undefined
    ? Math.max(2, Math.min(6, Math.floor(Number(choice_count) || curChoiceCount)))
    : curChoiceCount;
  const newCountdown = countdown_seconds !== undefined
    ? Math.max(5, Math.min(600, Math.floor(Number(countdown_seconds) || curCountdown)))
    : curCountdown;
  const newDisplay = display === 'percent' ? 'percent' : (display === 'count' ? 'count' : cur.display);
  const newMode = mode === 'quiz' ? 'quiz' : (mode === 'survey' ? 'survey' : cur.mode);
  const newHac = typeof has_answer_check === 'boolean' ? has_answer_check : cur.has_answer_check;

  await execute(
    `UPDATE quizzes SET
       title = COALESCE(?, title),
       title_en = ?,
       question = COALESCE(?, question),
       question_en = ?,
       choice_count = ?,
       countdown_seconds = ?,
       link_category_id = ?,
       display = ?,
       display_order = COALESCE(?, display_order),
       mode = ?,
       has_answer_check = ?,
       updated_at = NOW()
     WHERE id = ?`,
    [
      title ?? null, title_en ?? null,
      question ?? null, question_en ?? null,
      newChoiceCount, newCountdown,
      link_category_id ?? null,
      newDisplay,
      display_order ?? null,
      newMode, newHac,
      id,
    ]
  );

  // choice_count が増減した場合は quiz_choices を伸縮
  if (newChoiceCount !== cur.choice_count) {
    const existing = await queryAll(
      `SELECT position FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
      [id]
    );
    const existingPositions = new Set(existing.map((r) => r.position as number));
    // 足りない position を追加
    for (let pos = 1; pos <= newChoiceCount; pos++) {
      if (!existingPositions.has(pos)) {
        await execute(
          `INSERT INTO quiz_choices (quiz_id, position) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [id, pos]
        );
      }
    }
    // 余分な position は削除
    await execute(
      `DELETE FROM quiz_choices WHERE quiz_id = ? AND position > ?`,
      [id, newChoiceCount]
    );
  }

  const updated = await queryOne(`SELECT * FROM quizzes WHERE id = ?`, [id]);
  res.json({ success: true, data: updated });
}));

// ── choice 単体更新 ───────────────────────────────────
router.put('/quizzes/:id/choices/:position', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const position = parseInt(req.params.position as string);
  const {
    name, name_en, company, company_en,
    nomination_title, nomination_title_en,
    photo_data_url, vote_count, is_correct,
  } = req.body;

  const existing = await queryOne(
    `SELECT id FROM quiz_choices WHERE quiz_id = ? AND position = ?`,
    [id, position]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '対象 choice がありません');

  await execute(
    `UPDATE quiz_choices SET
       name = COALESCE(?, name),
       name_en = ?,
       company = ?,
       company_en = ?,
       nomination_title = ?,
       nomination_title_en = ?,
       photo_data_url = ?,
       vote_count = COALESCE(?, vote_count),
       is_correct = COALESCE(?, is_correct),
       updated_at = NOW()
     WHERE quiz_id = ? AND position = ?`,
    [
      name ?? null, name_en ?? null,
      company ?? null, company_en ?? null,
      nomination_title ?? null, nomination_title_en ?? null,
      photo_data_url ?? null,
      vote_count !== undefined ? Math.max(0, Math.floor(Number(vote_count) || 0)) : null,
      typeof is_correct === 'boolean' ? is_correct : null,
      id, position,
    ]
  );

  const row = await queryOne(
    `SELECT * FROM quiz_choices WHERE quiz_id = ? AND position = ?`,
    [id, position]
  );
  res.json({ success: true, data: row });
}));

// ── 連動 (category の TOP-N から choice をコピー) ──────
router.post('/quizzes/:id/sync-from-category', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const quiz = await queryOne(`SELECT * FROM quizzes WHERE id = ?`, [id]);
  if (!quiz) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');
  if (!quiz.link_category_id) throw new AppError(400, 'NO_LINK', '連動カテゴリが未設定です');

  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE category_id = ? AND rank IS NOT NULL
     ORDER BY rank ASC LIMIT ?`,
    [quiz.link_category_id, quiz.choice_count]
  );

  for (const e of entries) {
    const pos = e.rank as number;
    if (pos < 1 || pos > (quiz.choice_count as number)) continue;
    const od = (e.oneshot_data ?? {}) as Record<string, unknown>;
    const nominationTitle = (od.title as string | undefined) ?? e.nomination_title ?? null;
    const nominationTitleEn = (od.titleEn as string | undefined) ?? e.nomination_title_en ?? null;
    await execute(
      `UPDATE quiz_choices SET
         name = ?, name_en = ?, company = ?, company_en = ?,
         nomination_title = ?, nomination_title_en = ?,
         photo_data_url = ?, updated_at = NOW()
       WHERE quiz_id = ? AND position = ?`,
      [
        e.name, e.name_en ?? null,
        e.org ?? null, e.org_en ?? null,
        nominationTitle, nominationTitleEn,
        e.photo_url ?? null,
        id, pos,
      ]
    );
  }

  const choices = await queryAll(
    `SELECT * FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
    [id]
  );
  res.json({ success: true, data: { synced: entries.length, choices } });
}));

// ── 削除 ─────────────────────────────────────────────
router.delete('/quizzes/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const row = await queryOne(`DELETE FROM quizzes WHERE id = ? RETURNING id`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');
  res.json({ success: true });
}));

export default router;
