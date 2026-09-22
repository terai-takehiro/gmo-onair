/**
 * Wiki の AI — 「AI に聞く」のスレッドと発言（`docs/design/v4/wiki.md` §6-⑤・§7-3）。
 *
 * ⚠️ **スレッドは本人のみです**（一覧・読み取りとも作成者だけ。制作技術支援の
 * 壁打ちと同じ判断）。質問には「まだ誰にも言っていないこと」が普通に混ざるので、
 * 他人が読める場所にしません。**読めないスレッドは 403 ではなく 404**（存在ごと隠す・§8）。
 *
 * ⚠️ **3値のフィードバックは条件2 の代わりです**（対話は「直される」ものではない）。
 * `feedback` 列だけに書くと**集計から読めません** — `ai_corrections` にも1行積み、
 * `get_ai_feedback_digest` の無修正採用率に効かせます（`qsheet/ai/chat.service` と同じ形）。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { assertReadablePage, type WikiUser } from './wiki-access.service';
import type { WikiAiFeedback } from './wiki-ai.types';

const THREAD_SELECT = `
  SELECT t.id, t.title, t.page_id, p.title AS page_title, t.space_id, s.name AS space_name,
         t.created_at, t.updated_at,
         (SELECT COUNT(*)::int FROM wiki_ai_messages m WHERE m.thread_id = t.id) AS message_count,
         EXISTS (SELECT 1 FROM wiki_ai_messages m
                  WHERE m.thread_id = t.id AND m.spawned_page_id IS NOT NULL) AS spawned_page
    FROM wiki_ai_threads t
    LEFT JOIN wiki_pages p ON p.id = t.page_id
    LEFT JOIN wiki_spaces s ON s.id = t.space_id
`;

const MESSAGE_SELECT = `
  SELECT m.id, m.thread_id, m.seq, m.role, m.content_md, m.citations, m.confidence,
         m.ai_output_id, m.model, m.prompt_version,
         m.feedback, m.feedback_note, m.feedback_at, m.spawned_page_id, m.created_at
    FROM wiki_ai_messages m
`;

/** 新しいスレッド・発言の id（他の Wiki の id と同じ作り方） */
export const newThreadId = (): string => `wt-${uuid().slice(0, 8)}`;
export const newMessageId = (): string => `wm-${uuid().slice(0, 8)}`;

/* ── スレッド ─────────────────────────────────────────────── */

export interface CreateThreadInput {
  title?: string;
  pageId?: string | null;
  spaceId?: string | null;
}

export async function createThread(user: WikiUser, input: CreateThreadInput = {}): Promise<Record<string, unknown>> {
  const pageId = input.pageId ? String(input.pageId) : null;
  // ②から開いたときの文脈。**読めないページは結びつけない**（404 を投げる）
  if (pageId) await assertReadablePage(user, pageId);
  const id = newThreadId();
  await execute(
    `INSERT INTO wiki_ai_threads (id, title, page_id, space_id, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, String(input.title ?? '').slice(0, 200), pageId, input.spaceId ?? null, user.id],
  );
  return selectThread(id);
}

/** 1行だけ引く（可否は呼ぶ側が確かめたあと） */
async function selectThread(threadId: string): Promise<Record<string, unknown>> {
  const row = await queryOne(`${THREAD_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`, [threadId]);
  if (!row) throw new NotFoundError('見つかりません');
  return row;
}

/**
 * 本人のスレッドか確かめて返す。**他人のものは「無い」と返します**（§8）。
 *
 * ⚠️ system_admin にも開けません — ここは業務の記録ではなく個人の下書きです。
 */
export async function assertOwnThread(user: WikiUser, threadId: string): Promise<Record<string, unknown>> {
  const row = await queryOne(
    `${THREAD_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL AND t.created_by = ?`,
    [threadId, user.id],
  );
  if (!row) throw new NotFoundError('見つかりません');
  return row;
}

export async function listThreads(user: WikiUser, limit = 50): Promise<Record<string, unknown>[]> {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return queryAll(
    `${THREAD_SELECT} WHERE t.deleted_at IS NULL AND t.created_by = ?
      ORDER BY t.updated_at DESC LIMIT ${n}`,
    [user.id],
  );
}

export async function deleteThread(user: WikiUser, threadId: string): Promise<{ id: string }> {
  await assertOwnThread(user, threadId);
  await execute('UPDATE wiki_ai_threads SET deleted_at = NOW() WHERE id = ?', [threadId]);
  return { id: threadId };
}

/** スレッドの題は**最初の質問から**付けます（人に付けさせない） */
export async function titleThreadIfEmpty(threadId: string, question: string): Promise<void> {
  await execute(
    `UPDATE wiki_ai_threads SET title = ?, updated_at = NOW()
      WHERE id = ? AND (title IS NULL OR title = '')`,
    [question.trim().slice(0, 60), threadId],
  );
  await execute('UPDATE wiki_ai_threads SET updated_at = NOW() WHERE id = ?', [threadId]);
}

/* ── 発言 ─────────────────────────────────────────────────── */

export async function listMessages(threadId: string): Promise<Record<string, unknown>[]> {
  return queryAll(`${MESSAGE_SELECT} WHERE m.thread_id = ? ORDER BY m.seq`, [threadId]);
}

/*
 * ⚠️ **`nextSeq`（`MAX(seq) + 1` を先に採る）は置きません。**
 * 採ってから入れるまでの間に別の質問が同じ番号を取り、**先の回が長い AI の
 * 呼び出しを終えたあとで `UNIQUE (thread_id, seq)` に弾かれて**いました
 *（質問だけが残り、答えが落ちる。Codex の指摘・P2）。番号は
 * `wiki-ask.service.ts` の `addMessage` が **入れる瞬間に DB 側で**採ります。
 * ここに同じ形の関数を戻さないでください。
 */

/** 直前の往復をプロンプトに載せる形にする（「言い直して」への追従） */
export function transcriptOf(messages: Record<string, unknown>[], turns: number): string {
  return messages
    .slice(-turns * 2)
    .map((m) => `${m.role === 'user' ? '人' : 'AI'}: ${String(m.content_md ?? '')}`)
    .join('\n');
}

export async function selectMessage(messageId: string): Promise<Record<string, unknown>> {
  const row = await queryOne(`${MESSAGE_SELECT} WHERE m.id = ?`, [messageId]);
  if (!row) throw new NotFoundError('見つかりません');
  return row;
}

/** その発言が本人のスレッドのものか（`assertOwnThread` と同じ隠し方） */
export async function assertOwnMessage(user: WikiUser, messageId: string): Promise<Record<string, unknown>> {
  const row = await queryOne(
    `${MESSAGE_SELECT}
      JOIN wiki_ai_threads t ON t.id = m.thread_id
     WHERE m.id = ? AND t.deleted_at IS NULL AND t.created_by = ?`,
    [messageId, user.id],
  );
  if (!row) throw new NotFoundError('見つかりません');
  return row;
}

/* ── 3値のフィードバック（条件2）──────────────────────────── */

export const WIKI_FEEDBACKS: readonly WikiAiFeedback[] = ['good', 'rephrase', 'reject'];

/** `ai_corrections.field_path`。発言そのものへの評価なので1つに固定する */
const FEEDBACK_FIELD = '(回答)';

/**
 * 発言に3値のフィードバックを付ける（§7-3 条件2）。
 *
 * ⚠️ **押し直しは1行に保ちます。** `hasCorrections()` で弾くと2回目が黙って
 * 捨てられ、「役に立った → やっぱり的外れ」の押し直しが集計に出ません。
 * `output_id × field_path` で消してから1行だけ入れ直します
 * （営業の「差分は `output_id × field_path` で置き換え」と同じ作法）。
 */
export async function setMessageFeedback(
  user: WikiUser,
  messageId: string,
  feedback: WikiAiFeedback,
  note?: string | null,
): Promise<Record<string, unknown>> {
  if (!WIKI_FEEDBACKS.includes(feedback)) {
    throw new ValidationError('役に立った・言い直して・的外れのいずれかを選んでください。');
  }
  const row = await assertOwnMessage(user, messageId);
  if (row.role !== 'assistant') throw new ValidationError('AI の回答にだけ付けられます。');

  await execute(
    `UPDATE wiki_ai_messages
        SET feedback = ?, feedback_note = ?, feedback_at = NOW(), feedback_by = ?
      WHERE id = ?`,
    [feedback, note ?? null, user.id, messageId],
  );

  const outputId = row.ai_output_id ? String(row.ai_output_id) : null;
  if (outputId) {
    await execute('DELETE FROM ai_corrections WHERE output_id = ? AND field_path = ?', [outputId, FEEDBACK_FIELD]);
    // 「役に立った」は無修正採用（`none`）。分母を守るために必ず1行積む
    const type = feedback === 'good' ? 'none' : feedback;
    await execute(
      `INSERT INTO ai_corrections
         (id, output_id, field_path, before_value, after_value, correction_type, note, corrected_by)
       VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)`,
      [
        uuid(), outputId, FEEDBACK_FIELD,
        JSON.stringify(String(row.content_md ?? '')), JSON.stringify(null),
        type, note ?? null, user.id,
      ],
    ).catch((e: unknown) => {
      console.warn('[wiki-ai] 評価の記録に失敗（評価そのものは残っています）:', (e as Error).message);
    });
  }
  return selectMessage(messageId);
}

/** この回答からページを作った（採用の印・条件3 の主指標） */
export async function markSpawnedPage(messageId: string, pageId: string): Promise<void> {
  await execute('UPDATE wiki_ai_messages SET spawned_page_id = ? WHERE id = ?', [pageId, messageId])
    .catch((e: unknown) => {
      console.warn('[wiki-ai] 「ページにする」の印の記録に失敗:', (e as Error).message);
    });
}
