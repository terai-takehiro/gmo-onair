/**
 * interactive/services/question.service.ts — Phase 3 v2.6.9
 * クイズ/アンケート問題のロジック層。
 *
 * 設計メモ: Socket.IO 通知は WS インフラのため routes 側に残す。
 * service は DB 操作 + ドメインルール (status 遷移、回答受付制御) のみ担当。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { INTERACTIVE_QUESTION_STATUS } from '../../../shared/constants/statuses';

export interface QuestionText {
  language_code?: string;
  question_text?: string;
  choices?: unknown[];
}

export interface CreateInput {
  type?: string;
  correct_index?: number | null;
  texts: QuestionText[];
}

export interface ResultsData {
  total: number;
  choices: { index: number; count: number; percent: number }[];
}

export const questionService = {
  async listByEvent(eventId: string) {
    return queryAll(
      `SELECT q.*,
        (SELECT json_agg(json_build_object('language_code', t.language_code, 'question_text', t.question_text, 'choices', t.choices) ORDER BY t.language_code)
         FROM interactive_question_texts t WHERE t.question_id = q.id) as texts,
        (SELECT COUNT(*)::int FROM interactive_answers a WHERE a.question_id = q.id) as answer_count
       FROM interactive_questions q
       WHERE q.event_id = ?
       ORDER BY q.sort_order, q.created_at`,
      [eventId],
    );
  },

  async getById(id: string) {
    return queryOne('SELECT * FROM interactive_questions WHERE id = ?', [id]);
  },

  async getEventStatus(id: string) {
    return queryOne(
      'SELECT event_id, status FROM interactive_questions WHERE id = ?',
      [id],
    ) as Promise<{ event_id: string; status: string } | null>;
  },

  async getEventCorrect(id: string) {
    return queryOne(
      'SELECT event_id, correct_index FROM interactive_questions WHERE id = ?',
      [id],
    ) as Promise<{ event_id: string; correct_index: number | null } | null>;
  },

  async create(eventId: string, input: CreateInput) {
    if (!input.texts?.length) {
      throw new AppError(400, 'VALIDATION_ERROR', 'テキストは必須です');
    }
    const maxOrder = (await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1)::int + 1 as next FROM interactive_questions WHERE event_id = ?',
      [eventId],
    )) as { next: number } | null;

    const qId = uuid();
    await execute(
      `INSERT INTO interactive_questions (id, event_id, type, correct_index, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [qId, eventId, input.type || 'quiz', input.correct_index ?? null, maxOrder?.next ?? 0],
    );

    for (const t of input.texts) {
      await execute(
        `INSERT INTO interactive_question_texts (id, question_id, language_code, question_text, choices) VALUES (?, ?, ?, ?, ?)`,
        [uuid(), qId, t.language_code || 'ja', t.question_text || '', JSON.stringify(t.choices ?? [])],
      );
    }
    return queryOne('SELECT * FROM interactive_questions WHERE id = ?', [qId]);
  },

  async delete(id: string) {
    await execute('DELETE FROM interactive_questions WHERE id = ?', [id]);
  },

  /**
   * 問題をアクティブにする。
   * 同じイベント内で既に active な問題があれば close する。
   * 当該問題が closed → active への再活性化なら回答もクリアする。
   * @returns 通知用に必要な question texts (Socket.IO emit に使う)
   */
  async activate(id: string) {
    const q = await this.getEventStatus(id);
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

    await execute(
      `UPDATE interactive_questions SET status = '${INTERACTIVE_QUESTION_STATUS.CLOSED}', closed_at = NOW() WHERE event_id = ? AND status = '${INTERACTIVE_QUESTION_STATUS.ACTIVE}'`,
      [q.event_id],
    );
    if (q.status === INTERACTIVE_QUESTION_STATUS.CLOSED) {
      await execute('DELETE FROM interactive_answers WHERE question_id = ?', [id]);
    }
    await execute(
      `UPDATE interactive_questions SET status = '${INTERACTIVE_QUESTION_STATUS.ACTIVE}', activated_at = NOW() WHERE id = ?`,
      [id],
    );

    const texts = await queryAll(
      'SELECT * FROM interactive_question_texts WHERE question_id = ?',
      [id],
    );
    return { eventId: q.event_id, texts };
  },

  /** 締切（回答受付終了のみ — 結果はまだ非公開） */
  async close(id: string) {
    const q = await this.getEventStatus(id);
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');
    await execute(
      `UPDATE interactive_questions SET status = '${INTERACTIVE_QUESTION_STATUS.CLOSED}', closed_at = NOW() WHERE id = ?`,
      [id],
    );
    return { eventId: q.event_id };
  },

  /** 各選択肢の投票数 + 割合 */
  async getResults(id: string): Promise<ResultsData> {
    const rows = (await queryAll(
      `SELECT choice_index, COUNT(*)::int as count FROM interactive_answers WHERE question_id = ? GROUP BY choice_index ORDER BY choice_index`,
      [id],
    )) as { choice_index: number; count: number }[];
    const total = rows.reduce((s, r) => s + (r.count || 0), 0);
    return {
      total,
      choices: rows.map((r) => ({
        index: r.choice_index,
        count: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
    };
  },

  /** JSON 結果ダンプ (公開用) */
  async getResultsDump(id: string) {
    const q = (await this.getById(id)) as
      | { type: string; correct_index: number | null; status: string }
      | null;
    const texts = (await queryAll(
      'SELECT * FROM interactive_question_texts WHERE question_id = ?',
      [id],
    )) as { language_code: string; question_text: string; choices: string | unknown[] }[];
    const results = await this.getResults(id);
    return {
      questionId: id,
      type: q?.type,
      correctIndex: q?.correct_index,
      status: q?.status,
      texts: texts.map((t) => ({
        lang: t.language_code,
        question: t.question_text,
        choices: typeof t.choices === 'string' ? JSON.parse(t.choices) : t.choices,
      })),
      results,
    };
  },

  async importBulk(eventId: string, questions: Array<CreateInput & { texts?: QuestionText[] }>) {
    if (!Array.isArray(questions)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'questions配列は必須です');
    }
    let order =
      (((await queryOne(
        'SELECT COALESCE(MAX(sort_order), -1)::int as m FROM interactive_questions WHERE event_id = ?',
        [eventId],
      )) as { m: number } | null)?.m ?? 0) + 1;

    for (const q of questions) {
      const qId = uuid();
      await execute(
        `INSERT INTO interactive_questions (id, event_id, type, correct_index, sort_order) VALUES (?, ?, ?, ?, ?)`,
        [qId, eventId, q.type || 'quiz', q.correct_index ?? null, order++],
      );
      if (q.texts) {
        for (const t of q.texts) {
          await execute(
            `INSERT INTO interactive_question_texts (id, question_id, language_code, question_text, choices) VALUES (?, ?, ?, ?, ?)`,
            [uuid(), qId, t.language_code || 'ja', t.question_text || '', JSON.stringify(t.choices ?? [])],
          );
        }
      }
    }
    return { count: questions.length };
  },

  /**
   * 視聴者の回答送信。
   * 重複回答 (UNIQUE 制約 23505) は ALREADY_ANSWERED にマップ。
   */
  async submitAnswer(questionId: string, choiceIndex: number, sessionToken?: string) {
    if (choiceIndex === undefined || choiceIndex === null) {
      throw new AppError(400, 'VALIDATION_ERROR', 'choice_indexは必須です');
    }
    const q = (await queryOne(
      'SELECT id, status FROM interactive_questions WHERE id = ?',
      [questionId],
    )) as { id: string; status: string } | null;
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');
    if (q.status !== INTERACTIVE_QUESTION_STATUS.ACTIVE) {
      throw new AppError(400, 'QUESTION_CLOSED', '回答受付は終了しています');
    }

    let sessionId: string | null = null;
    if (sessionToken) {
      const s = (await queryOne(
        'SELECT id FROM interactive_sessions WHERE session_token = ?',
        [sessionToken],
      )) as { id: string } | null;
      sessionId = s?.id ?? null;
    }

    try {
      await execute(
        `INSERT INTO interactive_answers (id, question_id, session_id, choice_index) VALUES (?, ?, ?, ?)`,
        [uuid(), questionId, sessionId, choiceIndex],
      );
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === '23505') {
        throw new AppError(409, 'ALREADY_ANSWERED', '既に回答済みです');
      }
      throw err;
    }
  },
};
