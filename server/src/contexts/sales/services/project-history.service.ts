/**
 * 案件の変更の記録 (B4) と コメント・知らせた人 (B3)
 *
 * ── 変更の記録 ─────────────────────────────────────
 *
 * **主要な項目だけ**を残す。全列を残すと履歴が伸びて読めなくなり、
 * 「なぜこの金額になったのか」を探せなくなる = 履歴の目的を失う。
 *
 * **実際に変わった項目だけ**を書く (保存を押しただけで履歴が伸びない)。
 * 記録に失敗しても業務は止めない (履歴のために保存を落とさない)。
 *
 * ── コメント ───────────────────────────────────────
 *
 * 「みんなで書くメモ」(migration 136) とは役割が違う。
 * メモはいまの状態を全員で書き直す場所で、後から誰が何を書いたかは残らない。
 * コメントは言った・言わないの記録なので 1件=1行で残す。
 *
 * 知らせる相手は**画面で選ばせる**。本文から @名前 を機械的に拾うと、
 * 日本語の氏名は区切りが曖昧で取り違えたときに**別の人に知らせてしまう**。
 */
import { queryOne, queryAll, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

/** 記録する項目と、画面に出す名前 */
export const TRACKED_FIELDS: Record<string, string> = {
  name: '案件名',
  stage: 'ステージ',
  customer_id: 'お客様',
  assigned_to: '主担当',
  event_start: '実施日（開始）',
  event_end: '実施日（終了）',
  expected_amount: '想定金額',
  project_type: '案件種別',
  gls_number: 'GLS番号',
  gls_category: '案件分類',
};

const STAGE_LABELS: Record<string, string> = {
  neta: 'ネタ', d_hold: '仮押さえ', c_proposal: '見積提案', b_verbal: '口頭決定',
  a_won: '受注', s_completed: '完了', e_lost: '失注',
};
const TYPE_LABELS: Record<string, string> = {
  offline_event: 'オフラインイベント', online_event: 'オンラインイベント',
  hybrid_event: 'ハイブリッドイベント', recording: '収録', live: '生放送',
  studio_rental: 'スタジオレンタル', other: 'その他',
};

function raw(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/** 人が読む形にする。id は名前に引き直す (後から引けなくなるので保存時に確定させる) */
async function label(field: string, value: unknown): Promise<string | null> {
  const v = raw(value);
  if (v === null) return null;
  if (field === 'stage') return STAGE_LABELS[v] ?? v;
  if (field === 'project_type') return TYPE_LABELS[v] ?? v;
  if (field === 'gls_category') return v === 'A' ? 'スタジオ (A)' : v === 'B' ? 'ビジネス (B)' : v;
  if (field === 'expected_amount') {
    const n = Number(v);
    return Number.isFinite(n) ? `¥${n.toLocaleString('ja-JP')}` : v;
  }
  if (field === 'customer_id') {
    const r = (await queryOne('SELECT name FROM customers WHERE id = ?', [v])) as { name?: string } | null;
    return r?.name ?? v;
  }
  if (field === 'assigned_to') {
    const r = (await queryOne('SELECT name FROM users WHERE id = ?', [v])) as { name?: string } | null;
    return r?.name ?? v;
  }
  return v;
}

/** 金額は数値として、それ以外は文字列として比べる (0 と '0' を変更扱いにしない) */
function changed(field: string, before: unknown, after: unknown): boolean {
  if (field === 'expected_amount') {
    return Number(before ?? 0) !== Number(after ?? 0);
  }
  return raw(before) !== raw(after);
}

/**
 * 変わった項目だけ記録する。**業務を止めない** (失敗はログだけ)。
 * `after` に含まれない項目は「触っていない」として無視する。
 */
export async function recordProjectChanges(
  projectId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  actor: { userId?: string },
): Promise<void> {
  try {
    const actorName = actor.userId
      ? ((await queryOne('SELECT name FROM users WHERE id = ?', [actor.userId])) as { name?: string } | null)?.name ?? null
      : null;

    for (const field of Object.keys(TRACKED_FIELDS)) {
      if (!(field in after)) continue;
      if (!changed(field, before[field], after[field])) continue;
      await execute(
        `INSERT INTO project_changes
           (id, project_id, actor_id, actor_name, field,
            before_value, after_value, before_label, after_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), projectId, actor.userId ?? null, actorName, field,
          raw(before[field]), raw(after[field]),
          await label(field, before[field]), await label(field, after[field]),
        ],
      );
    }
  } catch (e) {
    console.error('[project-changes] 記録に失敗 (保存は成立しています):', (e as Error).message);
  }
}

export interface ProjectChangeRow {
  id: string; actor_id: string | null; actor_name: string | null;
  field: string; field_label: string;
  before_value: string | null; after_value: string | null;
  before_label: string | null; after_label: string | null;
  changed_at: string;
}

export async function listProjectChanges(projectId: string, limit = 100): Promise<ProjectChangeRow[]> {
  const rows = (await queryAll(
    `SELECT id, actor_id, actor_name, field, before_value, after_value,
            before_label, after_label, changed_at
     FROM project_changes WHERE project_id = ?
     ORDER BY changed_at DESC, id DESC LIMIT ?`,
    [projectId, limit],
  )) as Omit<ProjectChangeRow, 'field_label'>[];
  return rows.map((r) => ({ ...r, field_label: TRACKED_FIELDS[r.field] ?? r.field }));
}

// ── コメント ──────────────────────────────────────────

export interface ProjectCommentRow {
  id: string; body: string; author_id: string | null; author_name: string | null;
  created_at: string; mentions: { user_id: string; name: string | null; resolved_at: string | null }[];
}

export const projectCommentService = {
  async list(projectId: string): Promise<ProjectCommentRow[]> {
    const rows = (await queryAll(
      `SELECT c.id, c.body, c.author_id, c.created_at,
              COALESCE(u.name, c.author_name) AS author_name
       FROM project_comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.project_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC LIMIT 200`,
      [projectId],
    )) as Omit<ProjectCommentRow, 'mentions'>[];
    if (rows.length === 0) return [];

    const mentions = (await queryAll(
      `SELECT m.comment_id, m.user_id, m.resolved_at, u.name
       FROM project_comment_mentions m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.comment_id IN (${rows.map(() => '?').join(',')})`,
      rows.map((r) => r.id),
    )) as { comment_id: string; user_id: string; resolved_at: string | null; name: string | null }[];

    return rows.map((r) => ({
      ...r,
      mentions: mentions
        .filter((m) => m.comment_id === r.id)
        .map(({ user_id, name, resolved_at }) => ({ user_id, name, resolved_at })),
    }));
  },

  /** 投稿する。知らせる相手は呼び出し側 (画面) が選んだ user_id の配列 */
  async create(
    projectId: string,
    body: string,
    mentionUserIds: string[],
    actor: { userId: string },
  ): Promise<ProjectCommentRow[]> {
    const text = (body ?? '').trim();
    if (!text) throw new AppError(400, 'VALIDATION_ERROR', 'コメントが空です');
    const proj = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (!proj) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const actorName = ((await queryOne('SELECT name FROM users WHERE id = ?', [actor.userId])) as
      { name?: string } | null)?.name ?? null;
    const id = uuidv4();
    await execute(
      `INSERT INTO project_comments (id, project_id, body, author_id, author_name)
       VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, text, actor.userId, actorName],
    );

    // 自分あては作らない (自分のベルに自分の書き込みが出ても意味がない)
    const targets = Array.from(new Set((mentionUserIds ?? []).filter((u) => u && u !== actor.userId)));
    for (const userId of targets) {
      const u = await queryOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
      if (!u) continue; // 実在しない相手は黙って捨てる (FK 違反で投稿ごと落とさない)
      await execute(
        `INSERT INTO project_comment_mentions (comment_id, user_id) VALUES (?, ?)
         ON CONFLICT (comment_id, user_id) DO NOTHING`,
        [id, userId],
      );
    }
    return this.list(projectId);
  },

  /** 消せるのは書いた本人だけ (やり取りの記録は他人が消せてはいけない) */
  async remove(commentId: string, actor: { userId: string; isAdmin: boolean }): Promise<void> {
    const row = (await queryOne(
      'SELECT id, project_id, author_id FROM project_comments WHERE id = ? AND deleted_at IS NULL',
      [commentId],
    )) as { author_id: string | null } | null;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'コメントが見つかりません');
    if (row.author_id !== actor.userId && !actor.isAdmin) {
      throw new AppError(403, 'FORBIDDEN', '自分が書いたコメントだけ消せます');
    }
    await execute('UPDATE project_comments SET deleted_at = NOW() WHERE id = ?', [commentId]);
  },

  /**
   * 「対応した」を記録する (自分あてのものだけ)。
   * **「既読にする」ではない** — 読んだだけでは何も終わっていないので、
   * ベルから消えるのは本人が対応したと言ったときだけにする。
   */
  async resolveMention(commentId: string, actor: { userId: string }): Promise<void> {
    await execute(
      `UPDATE project_comment_mentions SET resolved_at = NOW(), resolved_by = ?
       WHERE comment_id = ? AND user_id = ? AND resolved_at IS NULL`,
      [actor.userId, commentId, actor.userId],
    );
  },

  /** ベル用: 自分あてで未対応のもの */
  async listMyOpenMentions(userId: string) {
    return (await queryAll(
      `SELECT c.id AS comment_id, c.body, c.created_at, c.project_id,
              COALESCE(au.name, c.author_name) AS author_name,
              p.name AS project_name, p.gls_number
       FROM project_comment_mentions m
       JOIN project_comments c ON c.id = m.comment_id AND c.deleted_at IS NULL
       JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL
       LEFT JOIN users au ON au.id = c.author_id
       WHERE m.user_id = ? AND m.resolved_at IS NULL
       ORDER BY c.created_at DESC LIMIT 50`,
      [userId],
    )) as {
      comment_id: string; body: string; created_at: string; project_id: string;
      author_name: string | null; project_name: string | null; gls_number: string | null;
    }[];
  },
};
