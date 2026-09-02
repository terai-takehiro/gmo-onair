/**
 * ④壁打ち（対話）— 段8・04-ai.md §4・§5-2b・§14-8。
 *
 * **本人のみ。チーム共有はしない**（04-ai.md §14-8 の決定）。
 * 1往復 = 1 POST（ストリーミングしない。サーバーに SSE 基盤が無い・§4-3）。
 * 対話は「直される」ものではないので、条件2の代わりに3値フィードバックを使う（§5-2b）。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { recordAiUsage } from '../../../shared/services/ai-usage.service';
import { tierFor } from '../../../shared/services/ai-model';
import { callStructured, resolveProvider } from './llm';
import { ChatReplySchema } from './schemas';
import { PRODUCTION_CHAT_KIND, PRODUCTION_CHAT_PROMPT_VERSION, PRODUCTION_CHAT_PROMPT_VERSION_FB } from './kinds';
import { AiNotConfiguredError, NotFoundError, ValidationError } from '../services/httpErrors';
import { canAccessDoc, canAccessSchedule, type AccessUser } from '../access';

const MAX_TURNS_PER_THREAD = 40; // 04-ai.md §4-3
const HISTORY_TURNS = 20; // 直近20往復（40メッセージ）まで渡す

export interface ThreadRow {
  id: string; title: string; project_id: string | null; schedule_id: string | null;
  document_id: string | null; created_by: string; created_at: string; updated_at: string;
}
export interface MessageRow {
  id: string; thread_id: string; seq: number; role: 'user' | 'assistant'; content: string;
  suggestion: { suggests: string; hint: string } | null; ai_output_id: string | null;
  model: string | null; prompt_version: string | null;
  feedback: 'good' | 'rephrase' | 'reject' | null; feedback_note: string | null;
  spawned_proposal_id: string | null; created_at: string;
}

export interface CreateThreadInput {
  title?: string; projectId?: string | null; scheduleId?: string | null; documentId?: string | null;
}

export async function createThread(input: CreateThreadInput, user: AccessUser): Promise<ThreadRow> {
  if (input.documentId) {
    const doc = await queryOne('SELECT created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [input.documentId]);
    if (!doc || !(await canAccessDoc(user, input.documentId, (doc.created_by as string) ?? null))) {
      throw new NotFoundError('台本が見つかりません');
    }
  }
  if (input.scheduleId) {
    const sch = await queryOne('SELECT created_by FROM qsheet_schedules WHERE id = ? AND deleted_at IS NULL', [input.scheduleId]);
    if (!sch || !(await canAccessSchedule(user, input.scheduleId, (sch.created_by as string) ?? null))) {
      throw new NotFoundError('スケジュール表が見つかりません');
    }
  }
  const id = uuid();
  await execute(
    `INSERT INTO qsheet_ai_threads (id, title, project_id, schedule_id, document_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.title ?? '', input.projectId ?? null, input.scheduleId ?? null, input.documentId ?? null, user.id],
  );
  return getThread(id);
}

export async function getThread(id: string): Promise<ThreadRow> {
  const row = await queryOne('SELECT * FROM qsheet_ai_threads WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) throw new NotFoundError('スレッドが見つかりません');
  return row as unknown as ThreadRow;
}

export async function listThreads(userId: string, filters: { projectId?: string; documentId?: string; scheduleId?: string }): Promise<ThreadRow[]> {
  const conds = ['created_by = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [userId];
  if (filters.projectId) { conds.push('project_id = ?'); params.push(filters.projectId); }
  if (filters.documentId) { conds.push('document_id = ?'); params.push(filters.documentId); }
  if (filters.scheduleId) { conds.push('schedule_id = ?'); params.push(filters.scheduleId); }
  const rows = await queryAll(
    `SELECT * FROM qsheet_ai_threads WHERE ${conds.join(' AND ')} ORDER BY updated_at DESC LIMIT 50`, params,
  );
  return rows as unknown as ThreadRow[];
}

export async function listMessages(threadId: string): Promise<MessageRow[]> {
  const rows = await queryAll('SELECT * FROM qsheet_ai_messages WHERE thread_id = ? ORDER BY seq', [threadId]);
  return rows as unknown as MessageRow[];
}

export async function deleteThread(id: string): Promise<void> {
  await execute('UPDATE qsheet_ai_threads SET deleted_at = NOW() WHERE id = ?', [id]);
}

/** 発言が属するスレッド id を引く（フィードバック API の所有権チェック用） */
export async function threadIdOfMessage(messageId: string): Promise<string | null> {
  const row = await queryOne('SELECT thread_id FROM qsheet_ai_messages WHERE id = ?', [messageId]);
  return (row?.thread_id as string) ?? null;
}

/** 生成に踏み込みそうな発言か（heavy に上げる目安。§7 の「suggestion を伴うターン」の代替判定） */
function looksGenerative(content: string): boolean {
  return /(骨格|セリフ|叩き台|枠)を?\s*(作|起こ|書)/u.test(content) || content.length > 400;
}

function buildSystemPrompt(): string {
  return `あなたは放送・イベント制作会社の制作進行の相談相手です。
「何を作るか」がまだ決まっていない段階の壁打ち相手として、要望を整理し、
①枠 ②骨格 ③セリフ のどれかが起動できる状態まで一緒に考えます。

## 守ること
- **十分に材料が揃ったと思ったら** suggests に event_plan / script_outline / script_lines の
  いずれかを入れ、hint に次段へ渡す短い指示を書く。まだなら suggests は none
- 断定を避け、聞き返してよい。生成そのものはこの対話ではしない（対話は準備段階）`;
}

export interface PostMessageResult {
  user: { id: string; seq: number; content: string };
  assistant: MessageRow;
  historyTruncated: boolean;
}

export async function postMessage(threadId: string, content: string, userId: string): Promise<PostMessageResult> {
  const trimmed = content.trim();
  if (!trimmed) throw new ValidationError('メッセージを入力してください');

  const countRow = await queryOne('SELECT COUNT(*)::int AS n FROM qsheet_ai_messages WHERE thread_id = ?', [threadId]);
  const turnCount = Math.floor((Number(countRow?.n) || 0) / 2);
  if (turnCount >= MAX_TURNS_PER_THREAD) {
    throw new ValidationError('このスレッドは上限に達しました。新しいスレッドを作ってください');
  }

  const provider = resolveProvider();
  if (!provider) throw new AiNotConfiguredError();

  const history = await listMessages(threadId);
  const nextSeq = (history[history.length - 1]?.seq ?? 0) + 1;
  const userRow: MessageRow = {
    id: uuid(), thread_id: threadId, seq: nextSeq, role: 'user', content: trimmed,
    suggestion: null, ai_output_id: null, model: null, prompt_version: null,
    feedback: null, feedback_note: null, spawned_proposal_id: null, created_at: new Date().toISOString(),
  };
  await execute(
    'INSERT INTO qsheet_ai_messages (id, thread_id, seq, role, content) VALUES (?, ?, ?, ?, ?)',
    [userRow.id, threadId, nextSeq, 'user', trimmed],
  );

  const windowed = [...history, userRow].slice(-HISTORY_TURNS * 2);
  const historyTruncated = history.length + 1 > windowed.length;
  const transcript = windowed.map((m) => `${m.role === 'user' ? '人' : 'AI'}: ${m.content}`).join('\n');

  const tier = tierFor('production_chat', { force: looksGenerative(trimmed) ? 'heavy' : undefined });

  const result = await callStructured({
    job: 'production_chat', tier, system: buildSystemPrompt(), user: transcript,
    schema: ChatReplySchema, schemaName: 'production_chat',
  }).catch((e) => {
    throw new AiNotConfiguredError(`壁打ちの呼び出しに失敗しました: ${(e as Error).message}`);
  });

  // 2ターン目以降（＝会話の文脈という「助言」を載せている）は +fb を付ける
  const promptVersion = windowed.length > 2
    ? PRODUCTION_CHAT_PROMPT_VERSION_FB : PRODUCTION_CHAT_PROMPT_VERSION;

  // ⚠️ メッセージ行を作る前に記録する場合は targetId:null で入れ、行ができたら UPDATE
  // （既存 activity-log.service.ts:205,285 の作法。04-ai.md §4-3）
  const aiOutputId = await recordAiOutput({
    kind: PRODUCTION_CHAT_KIND, targetTable: 'qsheet_ai_messages', targetId: null,
    payload: { input: transcript, output: result.raw }, toolName: 'qsheet.production_chat',
    model: result.model, promptVersion, actorId: userId,
  });
  await recordAiUsage({
    kind: 'production_chat', provider: result.provider, model: result.model,
    inputTokens: result.usage.inputTokens, cachedInputTokens: result.usage.cachedInputTokens,
    outputTokens: result.usage.outputTokens, ok: true, actorId: userId, aiOutputId: aiOutputId ?? undefined,
  });

  const suggests = result.raw.suggests === 'none' ? null : result.raw.suggests;
  const assistantId = uuid();
  const assistantSeq = nextSeq + 1;
  await execute(
    `INSERT INTO qsheet_ai_messages
       (id, thread_id, seq, role, content, suggestion, ai_output_id, model, prompt_version)
     VALUES (?, ?, ?, 'assistant', ?, ?::jsonb, ?, ?, ?)`,
    [
      assistantId, threadId, assistantSeq, result.raw.content,
      suggests ? JSON.stringify({ suggests, hint: result.raw.hint }) : null,
      aiOutputId, result.model, promptVersion,
    ],
  );
  if (aiOutputId) {
    await execute('UPDATE ai_outputs SET target_id = ? WHERE id = ?', [assistantId, aiOutputId]).catch(() => {});
  }
  await execute('UPDATE qsheet_ai_threads SET updated_at = NOW() WHERE id = ?', [threadId]);

  const assistantRow = (await queryOne('SELECT * FROM qsheet_ai_messages WHERE id = ?', [assistantId])) as unknown as MessageRow;
  return { user: { id: userRow.id, seq: nextSeq, content: trimmed }, assistant: assistantRow, historyTruncated };
}

export interface FeedbackInput { feedback: 'good' | 'rephrase' | 'reject'; note?: string }

/**
 * 発言への3値フィードバック（§5-2b）。**`feedback` 列を正とし、押し直しは
 * 削除してから1行だけ INSERT する**（`hasCorrections` を使うと2回目が黙って捨てられるため。
 * §5-2 F19）。
 */
export async function setMessageFeedback(messageId: string, input: FeedbackInput, userId: string): Promise<void> {
  const row = await queryOne('SELECT * FROM qsheet_ai_messages WHERE id = ?', [messageId]) as unknown as MessageRow | undefined;
  if (!row) throw new NotFoundError('発言が見つかりません');
  if (row.role !== 'assistant') throw new ValidationError('AI の発言にのみ付けられます');

  await execute(
    `UPDATE qsheet_ai_messages
        SET feedback = ?, feedback_note = ?, feedback_at = NOW(), feedback_by = ?
      WHERE id = ?`,
    [input.feedback, input.note ?? null, userId, messageId],
  );
  if (!row.ai_output_id) return;
  await execute('DELETE FROM ai_corrections WHERE output_id = ? AND field_path = ?', [row.ai_output_id, '(発言)']);
  const type = input.feedback === 'good' ? 'none' : input.feedback;
  await execute(
    `INSERT INTO ai_corrections (id, output_id, field_path, before_value, after_value, correction_type, note, corrected_by)
     VALUES (?, ?, '(発言)', ?::jsonb, ?::jsonb, ?, ?, ?)`,
    [uuid(), row.ai_output_id, JSON.stringify(row.content), JSON.stringify(null), type, input.note ?? null, userId],
  );
  // 「good」は feedback 列と ai_corrections (correction_type='none') に残り、digest も
  // そこから導出する。導出できる信号を ai_outcomes へ重ねて書かない（読む側が無い書き込みになる）
}

/** この発言から提案を起こした（採用の proxy。§4-4・§5-3d の主指標） */
export async function markSpawned(messageId: string, proposalId: string): Promise<void> {
  await execute('UPDATE qsheet_ai_messages SET spawned_proposal_id = ? WHERE id = ?', [proposalId, messageId])
    .catch(() => { /* 記録の失敗で取り込みを止めない */ });
}
