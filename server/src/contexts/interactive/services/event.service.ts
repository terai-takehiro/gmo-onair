/**
 * server/src/contexts/interactive/services/event.service.ts — Phase 3 v2.6.8
 *
 * インタラクティブイベントのビジネスロジック層。
 * routes/events.routes.ts は HTTP plumbing のみで、SQL とドメイン処理は
 * すべてここに集約する。sales/services/project.service.ts と同じパターン。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  INTERACTIVE_EVENT_STATUS,
  INTERACTIVE_QUESTION_STATUS,
} from '../../../shared/constants/statuses';

export interface ListFilter {
  search: string;
  status: string;
}

export interface CreateInput {
  title: string;
  description?: string;
  project_id?: string;
  episode_id?: string;
  max_connections?: number;
}

export interface UpdateInput {
  title?: string;
  description?: string | null;
  project_id?: string | null;
  episode_id?: string | null;
  max_connections?: number;
  youtube_url?: string | null;
  banner_url?: string | null;
  admin_comment?: string | null;
  survey_url?: string | null;
  accepting?: boolean;
  waiting_message?: string | null;
  ended_message?: string | null;
}

/**
 * リハーサル統計 + クイズ回答 + 問題状態を初期化する内部ヘルパー
 * (rehearsal-reset / start-from-rehearsal / reuse で共通)
 */
async function clearEventRuntimeData(eventId: string): Promise<void> {
  await execute('DELETE FROM interactive_stamp_counts WHERE event_id = ?', [eventId]);
  await execute('DELETE FROM interactive_sessions WHERE event_id = ?', [eventId]);
  const qs = await queryAll(
    'SELECT id FROM interactive_questions WHERE event_id = ?',
    [eventId],
  );
  for (const q of qs as { id: string }[]) {
    await execute('DELETE FROM interactive_answers WHERE question_id = ?', [q.id]);
    await execute(
      `UPDATE interactive_questions SET status = '${INTERACTIVE_QUESTION_STATUS.DRAFT}', activated_at = NULL, closed_at = NULL WHERE id = ?`,
      [q.id],
    );
  }
}

export const eventService = {
  async list(filter: ListFilter) {
    const params: unknown[] = [];
    let where = 'WHERE e.deleted_at IS NULL';

    if (filter.search) {
      params.push(`%${filter.search}%`);
      where += ' AND e.title ILIKE ?';
    }
    if ((Object.values(INTERACTIVE_EVENT_STATUS) as string[]).includes(filter.status)) {
      params.push(filter.status);
      where += ' AND e.status = ?';
    }

    return queryAll(
      `SELECT e.id, e.title, e.description, e.status, e.project_id, e.episode_id,
              e.max_connections, e.accepting, e.created_at,
              p.name as project_name, p.gls_number,
              (SELECT COUNT(*)::int FROM interactive_stamps s WHERE s.event_id = e.id) as stamp_count
       FROM interactive_events e
       LEFT JOIN projects p ON p.id = e.project_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT 100`,
      params,
    );
  },

  async getById(id: string) {
    const row = (await queryOne(
      `SELECT e.*, p.name as project_name, p.gls_number
       FROM interactive_events e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.id = ? AND e.deleted_at IS NULL`,
      [id],
    )) as Record<string, unknown> | null;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

    const stamps = await queryAll(
      'SELECT * FROM interactive_stamps WHERE event_id = ? ORDER BY sort_order',
      [id],
    );
    row.stamps = stamps;

    let channels: unknown[] = [];
    try {
      channels = await queryAll(
        'SELECT * FROM interactive_channels WHERE event_id = ? ORDER BY sort_order, created_at',
        [id],
      );
    } catch {
      /* table may not exist on older schemas */
    }
    row.channels = channels;
    return row;
  },

  async create(input: CreateInput, userId: string) {
    if (!input.title?.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');
    }
    const id = uuidv4();
    await execute(
      `INSERT INTO interactive_events (id, title, description, project_id, episode_id, max_connections, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(input.title).slice(0, 500),
        input.description ?? null,
        input.project_id ?? null,
        input.episode_id ?? null,
        Math.min(Math.max(Number(input.max_connections) || 100, 1), 10000),
        userId,
      ],
    );

    // デフォルトチャンネル作成 (テーブルが無い古いスキーマでは無視)
    try {
      await execute(
        'INSERT INTO interactive_channels (id, event_id, name, language_code, sort_order) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), id, 'メイン', 'ja', 0],
      );
    } catch {
      /* OK */
    }

    return queryOne('SELECT * FROM interactive_events WHERE id = ?', [id]);
  },

  async update(id: string, input: UpdateInput, userId: string) {
    const existing = (await queryOne(
      'SELECT * FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
      [id],
    )) as Record<string, unknown> | null;
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

    // undefined のフィールドは既存値を保持、空文字列は NULL として扱う
    const val = (key: keyof UpdateInput, fallback: unknown) => {
      const v = input[key];
      if (v === undefined) return fallback;
      if (v === '' || v === null) return null;
      return v;
    };

    await execute(
      `UPDATE interactive_events SET
         title = ?, description = ?, project_id = ?, episode_id = ?,
         max_connections = ?, youtube_url = ?, banner_url = ?,
         admin_comment = ?, survey_url = ?, accepting = ?,
         waiting_message = ?, ended_message = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        input.title || existing.title,
        val('description', existing.description),
        val('project_id', existing.project_id),
        val('episode_id', existing.episode_id),
        input.max_connections ? Number(input.max_connections) : existing.max_connections,
        val('youtube_url', existing.youtube_url),
        val('banner_url', existing.banner_url),
        val('admin_comment', existing.admin_comment),
        val('survey_url', existing.survey_url),
        input.accepting !== undefined ? input.accepting : existing.accepting,
        val('waiting_message', existing.waiting_message),
        val('ended_message', existing.ended_message),
        userId,
        id,
      ],
    );

    return queryOne('SELECT * FROM interactive_events WHERE id = ?', [id]);
  },

  /** リハーサル開始 (draft → rehearsal) */
  async startRehearsal(id: string) {
    await execute(
      `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.REHEARSAL}', accepting = true, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
  },

  /** リハーサルリセット (rehearsal → draft, 統計クリア) */
  async resetRehearsal(id: string) {
    await clearEventRuntimeData(id);
    await execute(
      `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.DRAFT}', accepting = false, started_at = NULL, ended_at = NULL, updated_at = NOW() WHERE id = ?`,
      [id],
    );
  },

  /** 本番開始 (draft/rehearsal → live)。リハーサルからの場合は統計をクリア */
  async start(id: string) {
    const ev = (await queryOne(
      'SELECT status FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
      [id],
    )) as { status: string } | null;
    if (ev?.status === INTERACTIVE_EVENT_STATUS.REHEARSAL) {
      await clearEventRuntimeData(id);
    }
    await execute(
      `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.LIVE}', accepting = true, started_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
  },

  /** 配信終了 (live → ended) */
  async stop(id: string) {
    await execute(
      `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.ENDED}', accepting = false, ended_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
  },

  /** 再利用 (ended → draft, 統計リセット) */
  async reuse(id: string) {
    await clearEventRuntimeData(id);
    await execute(
      `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.DRAFT}', accepting = false, started_at = NULL, ended_at = NULL, updated_at = NOW() WHERE id = ?`,
      [id],
    );
  },

  /** イベント soft delete */
  async delete(id: string) {
    await execute(
      'UPDATE interactive_events SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
  },

  /** 統計 (スタンプ別合計 + セッション数) */
  async getStats(id: string) {
    const stamps = await queryAll(
      `SELECT s.id, s.label, s.emoji, s.color, COALESCE(SUM(sc.count)::int, 0) as total
       FROM interactive_stamps s
       LEFT JOIN interactive_stamp_counts sc ON sc.stamp_id = s.id
       WHERE s.event_id = ?
       GROUP BY s.id, s.label, s.emoji, s.color
       ORDER BY s.sort_order`,
      [id],
    );

    const sessions = (await queryOne(
      `SELECT COUNT(*)::int as total, COUNT(CASE WHEN disconnected_at IS NULL THEN 1 END)::int as active
       FROM interactive_sessions WHERE event_id = ?`,
      [id],
    )) as { total: number; active: number } | null;

    return { stamps, sessions: sessions ?? { total: 0, active: 0 } };
  },
};
