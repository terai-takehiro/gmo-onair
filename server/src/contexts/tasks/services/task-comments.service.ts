// 依頼コメントスレッドとタスク期限 ICS フィード — docs/core-redesign-plan.md Phase 2 ⑤⑦
//
// my-tasks.service.ts（人軸のタスクと依頼）から**別ファイル**にしてあるのは、
// あちらがすでに大きいため（1ファイル400行の決めごと）。依頼の返答時のメモも
// ここの `task_comments` に入る（my-tasks 側が INSERT する。description 追記は廃止）。
//
// 権限の考え方（要件 D0 と同じ線引き）:
//   コメントは依頼のやり取りなので、読める・書けるのは**当事者だけ** —
//   依頼主（requester_id）・受け手（assigned_to）・作成者（created_by）。
//   sales 権限は要求しない（自分に来た依頼のやり取りができないと使えない）。

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { notify, template as notificationTemplate, fill } from '../../platform/services/notification.service';

// 期限の統一式（根源整理 §3-4）。my-tasks.service.ts の DUE_EXPR と**同じ式**にする
// （import すると循環になるので直書き。ずれると同じ人の期限がフィードと画面で食い違う）
const DUE_EXPR = `COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)`;

/** 受け手・依頼主がコメントを開ける場所（sales 権限の無い人も 403 にならない口） */
const COMMENT_LINK = '/daily/tasks?tab=delegations';

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

interface TaskParties {
  id: string;
  title: string;
  assigned_to: string | null;
  requester_id: string | null;
  created_by: string | null;
}

/** タスク 1 件の当事者（依頼主・受け手・作成者）を読む。無ければ 404 */
async function partiesOf(taskId: string): Promise<TaskParties> {
  const row = await queryOne(
    `SELECT id, title, assigned_to, requester_id, created_by
       FROM project_tasks WHERE id = ? AND deleted_at IS NULL`,
    [taskId],
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
  return row as unknown as TaskParties;
}

/**
 * 当事者かどうか。**403 の文面は理由が分かる形にする**（誰なら読めるのか）。
 * 依頼主 / 受け手 / 作成者 のいずれでもない人には、コメントの存在ごと見せない。
 */
function assertParty(task: TaskParties, userId: string): void {
  const parties = [task.assigned_to, task.requester_id, task.created_by];
  if (!parties.includes(userId)) {
    throw new AppError(
      403, 'FORBIDDEN',
      'このタスクのコメントは当事者（依頼主・受け手・作成者）だけが読み書きできます',
    );
  }
}

export const taskCommentsService = {
  /** コメント一覧（古い順 = 会話の順）。当事者だけが読める */
  async listComments(taskId: string, userId: string): Promise<TaskComment[]> {
    const task = await partiesOf(taskId);
    assertParty(task, userId);
    const rows = await queryAll(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name,
              c.body, c.created_at
         FROM task_comments c
         LEFT JOIN users u ON u.id = c.author_id
        WHERE c.task_id = ?
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT 500`,
      [taskId],
    );
    return rows as unknown as TaskComment[];
  },

  /**
   * コメントを 1 件書く。当事者だけが書ける。
   *
   * 通知は**相手方**へ出す — 自分が依頼主なら受け手へ、受け手なら依頼主へ。
   * 作成者（第三者側の当事者）が書いたときは依頼主・受け手の両方へ。
   * **best-effort** — 通知に失敗してもコメント自体は壊さない
   * （ひな形 dg_comment は migration 240。二重防止は 177 の一意索引で、
   *  ref_date にコメント id を入れるので 2 通目も潰されず毎回届く）。
   */
  async addComment(taskId: string, userId: string, body: string): Promise<TaskComment> {
    const text = body?.trim();
    if (!text) throw new AppError(400, 'VALIDATION_ERROR', 'コメントの本文を入力してください');
    const task = await partiesOf(taskId);
    assertParty(task, userId);

    const id = uuidv4();
    await execute(
      `INSERT INTO task_comments (id, task_id, author_id, body) VALUES (?, ?, ?, ?)`,
      [id, taskId, userId, text],
    );

    // 相手方 = 当事者のうち自分以外（依頼主・受け手を優先。作成者は書き手のことが多い）
    const recipients = [...new Set([task.assigned_to, task.requester_id].filter(
      (u): u is string => !!u && u !== userId,
    ))];
    try {
      const tpl = await notificationTemplate('dg_comment');
      if (tpl?.enabled && recipients.length > 0) {
        const author = await queryOne(`SELECT name FROM users WHERE id = ?`, [userId]);
        const vars = {
          '投稿者名': author?.name ? String(author.name) : '（不明）',
          'タスク名': task.title,
          // 通知は一言で分かればよい。長文はスレッドで読む
          '本文': text.length > 120 ? `${text.slice(0, 120)}…` : text,
        };
        for (const to of recipients) {
          await notify({
            userId: to,
            templateId: 'dg_comment',
            title: fill(tpl.subject, vars),
            body: fill(tpl.body, vars),
            link: COMMENT_LINK,
            refType: 'task',
            refId: taskId,
            refDate: id,
          });
        }
      }
    } catch (e) {
      console.warn('[task-comments] コメント通知の作成に失敗 (コメントは保存済み):', (e as Error).message);
    }

    const row = await queryOne(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at
         FROM task_comments c LEFT JOIN users u ON u.id = c.author_id
        WHERE c.id = ?`,
      [id],
    );
    return row as unknown as TaskComment;
  },

  // ── タスク期限の ICS フィード（Phase 2 ⑦）──────────────────

  /** いまのトークン。無ければ null（まだ発行していない） */
  async getFeedToken(userId: string): Promise<string | null> {
    const row = await queryOne(
      `SELECT token FROM user_task_feed_tokens WHERE user_id = ?`, [userId],
    );
    return row?.token ? String(row.token) : null;
  },

  /**
   * トークンを発行/再発行する。**再発行すると旧 URL はその場で無効になる**
   * （1 人 1 行の UPDATE なので、古いトークンは残らない）。
   */
  async issueFeedToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(24).toString('hex');
    await execute(
      `INSERT INTO user_task_feed_tokens (user_id, token) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = NOW()`,
      [userId, token],
    );
    return token;
  },

  /** トークン → 利用者。**不一致は null**（配信口は 404 で返す。403 だと在否が分かる） */
  async userIdForFeedToken(token: string): Promise<string | null> {
    if (!token) return null;
    const row = await queryOne(
      `SELECT user_id FROM user_task_feed_tokens WHERE token = ?`, [token],
    );
    return row?.user_id ? String(row.user_id) : null;
  },

  /**
   * フィードに載せる未完了タスク（過去 30 日〜未来 1 年。期限の無い行は載らない —
   * カレンダーは時刻の器なので、期限が無いものは置き場所が無い）。
   * 期限は COALESCE の統一式・**金額は返さない**（案件名と GLS 番号まで。要件 D0）。
   */
  async listFeedTasks(userId: string): Promise<Array<{
    id: string; title: string; project_name: string | null; gls_number: string | null;
    due_at: string; due_end: string; created_at: string | Date; updated_at: string | Date;
  }>> {
    const rows = await queryAll(
      `SELECT t.id, t.title, p.name AS project_name, p.gls_number,
              to_char(${DUE_EXPR}, 'YYYY-MM-DD"T"HH24:MI:SS') AS due_at,
              to_char(${DUE_EXPR} + INTERVAL '30 minutes', 'YYYY-MM-DD"T"HH24:MI:SS') AS due_end,
              t.created_at, t.updated_at
         FROM project_tasks t
         LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
        WHERE t.deleted_at IS NULL
          AND t.parent_task_id IS NULL
          AND t.assigned_to = ?
          AND t.is_completed = FALSE
          AND (t.delegation_status IS NULL
               OR t.delegation_status NOT IN ('declined', 'consulting'))
          AND ${DUE_EXPR} >= NOW() - INTERVAL '30 days'
          AND ${DUE_EXPR} < NOW() + INTERVAL '1 year'
        ORDER BY ${DUE_EXPR} ASC, t.created_at ASC
        LIMIT 1000`,
      [userId],
    );
    return rows as unknown as Array<{
      id: string; title: string; project_name: string | null; gls_number: string | null;
      due_at: string; due_end: string; created_at: string | Date; updated_at: string | Date;
    }>;
  },
};
