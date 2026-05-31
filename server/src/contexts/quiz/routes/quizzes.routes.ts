import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { interactiveBridge } from '../services/interactive-bridge.service';

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
  const md = ['quiz','survey'].includes(mode) ? mode : 'survey';
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
    mode, has_answer_check, cover_image_data_url,
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
  const newMode = ['quiz','survey'].includes(mode) ? mode : cur.mode;
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
       cover_image_data_url = ?,
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
      cover_image_data_url !== undefined ? (cover_image_data_url || null) : cur.cover_image_data_url,
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
       is_correct = COALESCE(?::boolean, is_correct),
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

// ════════════════════════════════════════════════════════════════════
// インタラクティブ演出 (別 VPS) 連携  — v2.9.24
//   投票集計は Interactive 側で言語横断合算済み → poller が vote_count に反映 (別サービス)。
//   ここでは「連携設定 (URL/APIキー/対象イベント)」と「問題本文の双方向同期」を扱う。
// ════════════════════════════════════════════════════════════════════

interface StoredLink {
  baseUrl: string;
  apiKeyPrefix?: string;
  apiKeySecret: string;
  interactiveEventId: string;
}

async function loadLink(eventId: number): Promise<StoredLink | null> {
  const ev = await queryOne(`SELECT interactive_link FROM awards_events WHERE id = ?`, [eventId]);
  if (!ev?.interactive_link) return null;
  const raw = ev.interactive_link as unknown;
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as StoredLink;
}

// 連携設定の取得 (APIキーはマスクして返す)
router.get('/events/:eventId/interactive-link', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const link = await loadLink(eventId);
  res.json({
    success: true,
    data: link
      ? {
          configured: true,
          baseUrl: link.baseUrl,
          apiKeyPrefix: link.apiKeyPrefix ?? null,
          interactiveEventId: link.interactiveEventId,
        }
      : { configured: false },
  });
}));

// 連携設定の保存 (apiKeySecret 空欄なら既存を維持)
router.put('/events/:eventId/interactive-link', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const { baseUrl, interactiveEventId, apiKeySecret } = req.body ?? {};
  if (!baseUrl || !interactiveEventId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'baseUrl と interactiveEventId は必須です');
  }
  const existing = await loadLink(eventId);
  const secret = apiKeySecret && String(apiKeySecret).trim()
    ? String(apiKeySecret).trim()
    : existing?.apiKeySecret;
  if (!secret) throw new AppError(400, 'VALIDATION_ERROR', 'API キーが必要です');

  const link: StoredLink = {
    baseUrl: String(baseUrl).trim().replace(/\/+$/, ''),
    apiKeyPrefix: secret.slice(0, 12),
    apiKeySecret: secret,
    interactiveEventId: String(interactiveEventId).trim(),
  };
  await execute(
    `UPDATE awards_events SET interactive_link = ?::jsonb, updated_at = NOW() WHERE id = ?`,
    [JSON.stringify(link), eventId],
  );
  res.json({ success: true, data: { configured: true, baseUrl: link.baseUrl, apiKeyPrefix: link.apiKeyPrefix, interactiveEventId: link.interactiveEventId } });
}));

// 連携解除
router.delete('/events/:eventId/interactive-link', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  await execute(`UPDATE awards_events SET interactive_link = NULL, updated_at = NOW() WHERE id = ?`, [eventId]);
  await execute(`UPDATE quizzes SET interactive_question_id = NULL WHERE event_id = ?`, [eventId]);
  res.json({ success: true });
}));

// 連携先候補の Interactive イベント一覧 (設定 UI のプルダウン用)。
// baseUrl + apiKey を body で受けて疎通確認も兼ねる (保存前のテストに使える)。
router.post('/events/:eventId/interactive-link/list-events', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const { baseUrl, apiKeySecret } = req.body ?? {};
  const stored = await loadLink(eventId);
  const link: StoredLink = {
    baseUrl: (baseUrl ?? stored?.baseUrl ?? '').replace(/\/+$/, ''),
    apiKeySecret: (apiKeySecret && String(apiKeySecret).trim()) || stored?.apiKeySecret || '',
    interactiveEventId: stored?.interactiveEventId ?? '',
  };
  const events = await interactiveBridge.listEvents(link);
  res.json({ success: true, data: events });
}));

// Interactive の問題一覧プレビュー (取込前の確認用)
router.get('/events/:eventId/interactive-link/preview', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const link = await loadLink(eventId);
  if (!link) throw new AppError(400, 'NOT_CONFIGURED', '連携が未設定です');
  const data = await interactiveBridge.listQuestions(link);
  res.json({ success: true, data });
}));

// 取込: Interactive → Awards (問題本文・選択肢を quizzes/quiz_choices に upsert)
router.post('/events/:eventId/interactive-link/pull', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const link = await loadLink(eventId);
  if (!link) throw new AppError(400, 'NOT_CONFIGURED', '連携が未設定です');

  const { questions } = await interactiveBridge.listQuestions(link);
  let created = 0;
  let updated = 0;

  for (const iq of questions ?? []) {
    const texts = iq.texts ?? [];
    const ja = texts.find((t) => t.language_code === 'ja') ?? texts[0];
    const en = texts.find((t) => t.language_code === 'en');
    const jaChoices = (ja?.choices ?? []) as string[];
    const enChoices = (en?.choices ?? []) as string[];
    const choiceCount = Math.max(2, Math.min(6, Math.max(jaChoices.length, enChoices.length) || 2));
    const mode = iq.type === 'survey' ? 'survey' : 'quiz';

    // 既存の紐づけ quiz を探す
    let quiz = await queryOne(
      `SELECT id FROM quizzes WHERE event_id = ? AND interactive_question_id = ?`,
      [eventId, iq.id],
    );

    if (quiz) {
      await execute(
        `UPDATE quizzes SET question = ?, question_en = ?, choice_count = ?, mode = ?, updated_at = NOW() WHERE id = ?`,
        [ja?.question_text ?? '', en?.question_text ?? null, choiceCount, mode, quiz.id],
      );
      updated++;
    } else {
      const maxOrder = await queryOne(
        `SELECT COALESCE(MAX(display_order), 0) AS max FROM quizzes WHERE event_id = ?`,
        [eventId],
      );
      quiz = await queryOne(
        `INSERT INTO quizzes (event_id, title, question, question_en, choice_count, mode, display_order, interactive_question_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [eventId, ja?.question_text ?? '', ja?.question_text ?? '', en?.question_text ?? null,
         choiceCount, mode, ((maxOrder?.max as number) ?? 0) + 1, iq.id],
      );
      await execute(`INSERT INTO quiz_cue_state (quiz_id) VALUES (?) ON CONFLICT DO NOTHING`, [quiz!.id]);
      created++;
    }

    // 正解 (複数可): correct_indices 優先、無ければ単一 correct_index
    const correctSet = new Set<number>(
      Array.isArray(iq.correct_indices) && iq.correct_indices.length
        ? iq.correct_indices
        : (iq.correct_index !== null && iq.correct_index !== undefined ? [iq.correct_index] : []),
    );
    // 選択肢 upsert (Interactive choice_index i → Awards position i+1)。name/name_en/正解 を更新。
    for (let i = 0; i < choiceCount; i++) {
      const isCorrect = correctSet.has(i);
      await execute(
        `INSERT INTO quiz_choices (quiz_id, position, name, name_en, is_correct)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (quiz_id, position)
         DO UPDATE SET name = EXCLUDED.name, name_en = EXCLUDED.name_en, is_correct = EXCLUDED.is_correct, updated_at = NOW()`,
        [quiz!.id, i + 1, jaChoices[i] ?? '', enChoices[i] ?? null, isCorrect],
      );
    }
  }

  res.json({ success: true, data: { created, updated } });
}));

// 送信: Awards → Interactive (event 内の全 quiz の本文・選択肢を Interactive に書き込む)
router.post('/events/:eventId/interactive-link/push', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const link = await loadLink(eventId);
  if (!link) throw new AppError(400, 'NOT_CONFIGURED', '連携が未設定です');

  const quizzes = await queryAll(
    `SELECT * FROM quizzes WHERE event_id = ? ORDER BY display_order, id`,
    [eventId],
  );
  if (!quizzes.length) {
    return res.json({ success: true, data: { pushed: 0 } });
  }

  const payload = [];
  for (const q of quizzes) {
    const choices = await queryAll(
      `SELECT position, name, name_en, is_correct FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
      [q.id],
    );
    // 正解 (複数可) を Interactive へ。choice position(1始まり) → choice_index(0始まり)
    const correctIndexes = choices.filter((c) => c.is_correct).map((c) => (c.position as number) - 1);
    payload.push({
      _quizId: q.id as number,
      interactiveQuestionId: (q.interactive_question_id as string | null) ?? null,
      type: q.mode === 'quiz' ? 'quiz' : 'survey',
      correctIndex: correctIndexes.length ? correctIndexes[0] : null, // 後方互換
      correctIndexes,
      texts: [
        { lang: 'ja', question: (q.question as string) ?? '', choices: choices.map((c) => (c.name as string) ?? '') },
        { lang: 'en', question: (q.question_en as string) ?? '', choices: choices.map((c) => (c.name_en as string) ?? '') },
      ],
    });
  }

  const result = await interactiveBridge.syncQuestions(
    link,
    payload.map(({ interactiveQuestionId, type, correctIndex, correctIndexes, texts }) => ({ interactiveQuestionId, type, correctIndex, correctIndexes, texts })),
  );

  // 返ってきた interactiveQuestionId を quizzes に保存 (入力順で対応)
  for (let i = 0; i < payload.length; i++) {
    const iqId = result?.[i]?.interactiveQuestionId;
    if (iqId) {
      await execute(`UPDATE quizzes SET interactive_question_id = ? WHERE id = ?`, [iqId, payload[i]._quizId]);
    }
  }

  res.json({ success: true, data: { pushed: payload.length } });
}));

// ── 1 問単位の連携 ───────────────────────────────────────────────────

// quiz に対応する Interactive 問題を選択/解除 (プルダウン用)
router.put('/quizzes/:id/interactive-question', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { interactiveQuestionId } = req.body ?? {};
  await execute(
    `UPDATE quizzes SET interactive_question_id = ?, updated_at = NOW() WHERE id = ?`,
    [interactiveQuestionId || null, id],
  );
  res.json({ success: true });
}));

// 取込 (1 問): 指定 quiz の interactive_question_id (または body 指定) の問題を取り込む
router.post('/events/:eventId/interactive-link/pull/:quizId', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const quizId = parseInt(req.params.quizId as string);
  const link = await loadLink(eventId);
  if (!link) throw new AppError(400, 'NOT_CONFIGURED', '連携が未設定です');

  const quiz = await queryOne(
    `SELECT id, interactive_question_id FROM quizzes WHERE id = ? AND event_id = ?`,
    [quizId, eventId],
  );
  if (!quiz) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');

  const iqId = (req.body?.interactiveQuestionId as string | undefined) || (quiz.interactive_question_id as string | null);
  if (!iqId) throw new AppError(400, 'NO_LINK', '取込元の Interactive 問題が指定されていません');

  const { questions } = await interactiveBridge.listQuestions(link);
  const iq = (questions ?? []).find((x) => x.id === iqId);
  if (!iq) throw new AppError(404, 'NOT_FOUND', 'Interactive 側に該当問題がありません');

  const texts = iq.texts ?? [];
  const ja = texts.find((t) => t.language_code === 'ja') ?? texts[0];
  const en = texts.find((t) => t.language_code === 'en');
  const jaChoices = (ja?.choices ?? []) as string[];
  const enChoices = (en?.choices ?? []) as string[];
  const choiceCount = Math.max(2, Math.min(6, Math.max(jaChoices.length, enChoices.length) || 2));
  const mode = iq.type === 'survey' ? 'survey' : 'quiz';

  await execute(
    `UPDATE quizzes SET question = ?, question_en = ?, choice_count = ?, mode = ?, interactive_question_id = ?, updated_at = NOW() WHERE id = ?`,
    [ja?.question_text ?? '', en?.question_text ?? null, choiceCount, mode, iqId, quizId],
  );
  const correctSet = new Set<number>(
    Array.isArray(iq.correct_indices) && iq.correct_indices.length
      ? iq.correct_indices
      : (iq.correct_index !== null && iq.correct_index !== undefined ? [iq.correct_index] : []),
  );
  for (let i = 0; i < choiceCount; i++) {
    const isCorrect = correctSet.has(i);
    await execute(
      `INSERT INTO quiz_choices (quiz_id, position, name, name_en, is_correct)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (quiz_id, position)
       DO UPDATE SET name = EXCLUDED.name, name_en = EXCLUDED.name_en, is_correct = EXCLUDED.is_correct, updated_at = NOW()`,
      [quizId, i + 1, jaChoices[i] ?? '', enChoices[i] ?? null, isCorrect],
    );
  }
  res.json({ success: true, data: { interactiveQuestionId: iqId } });
}));

// 送信 (1 問): 指定 quiz を Interactive に書き込む (interactive_question_id 無しなら新規作成)
router.post('/events/:eventId/interactive-link/push/:quizId', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const quizId = parseInt(req.params.quizId as string);
  const link = await loadLink(eventId);
  if (!link) throw new AppError(400, 'NOT_CONFIGURED', '連携が未設定です');

  const q = await queryOne(`SELECT * FROM quizzes WHERE id = ? AND event_id = ?`, [quizId, eventId]);
  if (!q) throw new AppError(404, 'NOT_FOUND', 'quiz が見つかりません');

  const choices = await queryAll(
    `SELECT position, name, name_en, is_correct FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
    [quizId],
  );
  const correctIndexes = choices.filter((c) => c.is_correct).map((c) => (c.position as number) - 1);
  const result = await interactiveBridge.syncQuestions(link, [{
    interactiveQuestionId: (q.interactive_question_id as string | null) ?? null,
    type: q.mode === 'quiz' ? 'quiz' : 'survey',
    correctIndex: correctIndexes.length ? correctIndexes[0] : null, // 後方互換
    correctIndexes,
    texts: [
      { lang: 'ja', question: (q.question as string) ?? '', choices: choices.map((c) => (c.name as string) ?? '') },
      { lang: 'en', question: (q.question_en as string) ?? '', choices: choices.map((c) => (c.name_en as string) ?? '') },
    ],
  }]);
  const iqId = result?.[0]?.interactiveQuestionId;
  if (iqId) await execute(`UPDATE quizzes SET interactive_question_id = ? WHERE id = ?`, [iqId, quizId]);
  res.json({ success: true, data: { interactiveQuestionId: iqId ?? (q.interactive_question_id ?? null) } });
}));

export default router;
