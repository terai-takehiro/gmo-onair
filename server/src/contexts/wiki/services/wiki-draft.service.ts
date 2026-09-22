/**
 * Wiki の AI — ②「AI で下書きを作る」（`docs/design/v4/wiki.md` §7-1・§7-2・§7-6）。
 *
 * ⚠️ **必ず `status='draft'` で置きます。** 公開は人が画面で押します
 * （メール取込の「AI は起票まで・確定は人」と同じ）。AI が公開できる経路を
 * 1本でも作ると、**誰も読んでいない手順書が現場で実行されます**。
 *
 * ⚠️ **公開中のページを AI で上書きしません。** 上書きすると、
 * いま現場が見ている手順が予告なく変わります。材料にはできます（読むだけ）。
 *
 * ⚠️ **`wiki_pages.ai_output_id` に紐づけます**（§5-1）。これが
 *   ・画面の「AI作成」の札の元
 *   ・条件2 の差分の起点（`wiki-ai-corrections.service.ts`）
 * の両方になります。付け忘れると、**人が直した差分が永久に取れません**。
 */
import { execute, queryAll, queryOne, type Row } from '../../../shared/db/connection';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { assertReadablePage, isWikiEditor, readableSpaceIds, type WikiUser } from './wiki-access.service';
import { callWikiAi, wikiTierFor } from './wiki-ai-llm';
import {
  WIKI_DRAFT_KIND, WIKI_DRAFT_PROMPT_VERSION, WIKI_MATERIAL_CHARS_PER_PAGE,
  WIKI_MATERIAL_CHARS_TOTAL, withFeedback,
} from './wiki-ai.constants';
import { WikiDraftSchema, WIKI_DRAFT_SYSTEM, buildDraftPrompt } from './wiki-ai-prompts';
import { wikiAdviceFor } from './wiki-ai-digest.service';
import { markGapWritten } from './wiki-ai-gap.service';
import { assertOwnThread, listMessages, markSpawnedPage } from './wiki-ai-thread.service';
import { savePageInternal, selectPageRow } from './wiki-page.service';
import { createPage } from './wiki-write.service';

/** 人が貼ったメモの上限。**切らずに断る**（黙って切ると後半が消えたことに気づけない） */
const NOTES_MAX_CHARS = 20_000;

export interface DraftInput {
  /** 書き込む先。無ければ新しい下書きページを作る */
  pageId?: string | null;
  /** 新しく作るとき: どのスペースの・どの親の下に置くか */
  spaceId?: string | null;
  parentId?: string | null;
  /** 題（無ければ AI が材料から決める） */
  title?: string;
  /** 材料にする会話（`wiki_ai_threads`。**本人のものだけ**） */
  threadId?: string | null;
  /** 「ページにする」を押した回答（採用の印を付ける） */
  messageId?: string | null;
  /** 足りないページから起こしたとき（書いたら `written` にする） */
  gapId?: string | null;
  /** 材料にする既存のページ（読める公開ページだけ） */
  sourcePageIds?: string[];
  /** 人が貼ったメモ（会議のメモ・口頭で聞いたこと） */
  notes?: string;
}

export interface DraftResult {
  page: Row;
  /** 材料から決められなかったこと（本文に推測で書かせない代わりの受け皿） */
  open_questions: string[];
  ai_output_id: string | null;
}

/* ── 材料 ─────────────────────────────────────────────────── */

interface DraftMaterials {
  block: string;
  /** `payload_snapshot` に残す形（本文は二重に持たない・§7-5） */
  refs: {
    thread_id: string | null;
    thread_message_count: number;
    pages: Array<{ page_id: string; title: string; rev: number; updated_at: string }>;
    notes: string;
  };
}

async function gatherDraftMaterials(user: WikiUser, input: DraftInput): Promise<DraftMaterials> {
  const parts: string[] = [];
  const pages: DraftMaterials['refs']['pages'] = [];
  let threadMessages = 0;

  const notes = String(input.notes ?? '').trim();
  if (notes.length > NOTES_MAX_CHARS) {
    throw new ValidationError(
      `メモが長すぎます（${NOTES_MAX_CHARS.toLocaleString()}字まで）。分けて書いてください。`,
    );
  }
  if (notes) parts.push(`### 人が書いたメモ\n${notes}`);

  if (input.threadId) {
    // **本人の会話だけ**（他人のスレッドは存在ごと見えない・§6-⑤）
    await assertOwnThread(user, String(input.threadId));
    const messages = await listMessages(String(input.threadId));
    threadMessages = messages.length;
    if (messages.length > 0) {
      parts.push(`### AI に聞いたときの会話\n${messages
        .map((m) => `${m.role === 'user' ? '人' : 'AI'}: ${String(m.content_md ?? '')}`)
        .join('\n')}`);
    }
  }

  const ids = (input.sourcePageIds ?? []).map(String).filter(Boolean).slice(0, 8);
  if (ids.length > 0) {
    // ⚠️ **読めるスペースの公開ページだけ**（§7-5）。下書き・`members` は材料にしない
    const spaceIds = await readableSpaceIds(user);
    const rows = await queryAll(
      `SELECT p.id, p.title, p.body_md, p.rev, p.updated_at
         FROM wiki_pages p
        WHERE p.deleted_at IS NULL AND p.status = 'published'
          AND p.space_id = ANY(?) AND p.id = ANY(?)`,
      [spaceIds, ids],
    );
    for (const r of rows) {
      const body = String(r.body_md ?? '').slice(0, WIKI_MATERIAL_CHARS_PER_PAGE);
      pages.push({
        page_id: String(r.id),
        title: String(r.title ?? ''),
        rev: Number(r.rev ?? 0),
        updated_at: new Date(r.updated_at as string).toISOString(),
      });
      parts.push(`### 既にあるページ page_id=${String(r.id)}\n題: ${String(r.title ?? '')}\n\n${body}`);
    }
  }

  // 合計の上限。長い1本で枠を使い切らせない（材料が落ちたことは payload の refs で分かる）
  let block = parts.join('\n\n---\n\n');
  if (block.length > WIKI_MATERIAL_CHARS_TOTAL) block = block.slice(0, WIKI_MATERIAL_CHARS_TOTAL);

  return {
    block,
    refs: {
      thread_id: input.threadId ? String(input.threadId) : null,
      thread_message_count: threadMessages,
      pages,
      notes,   // **人が打った原文は切り詰めずに残す**（どこを読み違えたかを後で確かめる）
    },
  };
}

/* ── 書き込む先 ───────────────────────────────────────────── */

/** 既にあるページに書くとき。**下書きだけ**（公開中は上書きしない） */
async function assertDraftTarget(user: WikiUser, pageId: string): Promise<Row> {
  await assertReadablePage(user, pageId);
  const row = await queryOne(
    'SELECT id, title, status, space_id FROM wiki_pages WHERE id = ? AND deleted_at IS NULL',
    [pageId],
  );
  if (!row) throw new NotFoundError('ページが見つかりません');
  if (String(row.status) !== 'draft') {
    throw new ValidationError('公開中のページは AI で書き換えません。下書きに戻してからお試しください。');
  }
  return row;
}

/* ── 本体 ─────────────────────────────────────────────────── */

/**
 * 下書きを作る（`POST /wiki/pages/:id/draft` ・ `POST /wiki/ai/draft`）。
 *
 * ⚠️ **段は heavy 常に**（§7-1）。会話・案件・機材・議事録を束ねた長い文から書くので、
 * 軽い段だと材料の冒頭の印象だけで書きます（議事録で実測済み）。
 */
export async function draftPage(user: WikiUser, input: DraftInput): Promise<DraftResult> {
  if (!isWikiEditor(user)) throw new ValidationError('ページを作る権限がありません。');

  const target = input.pageId ? await assertDraftTarget(user, String(input.pageId)) : null;
  const spaceId = target ? String(target.space_id) : String(input.spaceId ?? '');
  if (!spaceId) throw new ValidationError('スペースを選んでください。');

  const materials = await gatherDraftMaterials(user, input);
  if (!materials.block.trim()) {
    throw new ValidationError('材料がありません。会話・メモ・参考にするページのどれかを指定してください。');
  }

  const title = String(input.title ?? (target ? String(target.title ?? '') : '')).trim();
  const advice = await wikiAdviceFor(WIKI_DRAFT_KIND);
  const promptVersion = advice.length
    ? withFeedback(WIKI_DRAFT_PROMPT_VERSION)
    : WIKI_DRAFT_PROMPT_VERSION;

  const out = await callWikiAi({
    job: WIKI_DRAFT_KIND,
    tier: wikiTierFor(WIKI_DRAFT_KIND),
    system: WIKI_DRAFT_SYSTEM,
    user: buildDraftPrompt({ title, materialBlock: materials.block, advice }),
    schema: WikiDraftSchema,
    schemaName: 'wiki_draft',
  }, user.id);

  const bodyMd = String(out.raw.body_md ?? '').trim();
  const pageTitle = title || String(out.raw.title ?? '').trim();
  const openQuestions = (out.raw.open_questions ?? []).map(String).filter(Boolean);
  if (!bodyMd) {
    // 材料から書けなかった。**空のページを置かない**（空の下書きが増えると見直しが回らない）
    throw new ValidationError('材料からは本文を書けませんでした。メモか参考にするページを足してください。');
  }

  /*
   * ページに置く。**新しく作るときも直すときも `status='draft'`**。
   *
   * ⚠️ `skipAiFeedback` を立てるのは、これが**AI 自身の書き込み**だからです。
   * 立てないと、この保存が直前の（あるいは前回の）下書きに対する
   * 「人の修正」として `ai_corrections` に積まれます（GPM の「AI 自身は除外」と同じ）。
   */
  let pageId: string;
  if (target) {
    pageId = String(target.id);
    await savePageInternal(
      pageId,
      { title: pageTitle || undefined, body_md: bodyMd, status: 'draft', note: 'AI が下書きを作成' },
      user,
      { skipAiFeedback: true },
    );
  } else {
    const created = await createPage(user, {
      space_id: spaceId,
      parent_id: input.parentId ?? null,
      title: pageTitle,
      body_md: bodyMd,
      status: 'draft',
      note: 'AI が下書きを作成',
    });
    pageId = String(created.id);
  }

  /*
   * 条件1: **全文で残す**。本文はここにしか無い形（まだ人が触っていない AI の出力）なので、
   * `payload_snapshot` に丸ごと入れます。材料のページの本文は入れません（id と rev で復元可）。
   */
  const outputId = await recordAiOutput({
    kind: WIKI_DRAFT_KIND,
    targetTable: 'wiki_pages',
    targetId: pageId,
    payload: {
      title: pageTitle,
      body_md: bodyMd,
      open_questions: openQuestions,
      materials: materials.refs,
      space_id: spaceId,
      from_message_id: input.messageId ?? null,
      from_gap_id: input.gapId ?? null,
      advice_used: advice,
    },
    model: out.model,
    promptVersion,
    actorId: user.id,
  });

  if (outputId) {
    await execute('UPDATE wiki_pages SET ai_output_id = ? WHERE id = ?', [outputId, pageId])
      .catch((e: unknown) => {
        console.warn('[wiki-ai] 下書きとの紐づけに失敗（差分が取れなくなります）:', (e as Error).message);
      });
  }
  // 採用の印（条件3）。会話から起こした／足りないページから起こした
  if (input.messageId) await markSpawnedPage(String(input.messageId), pageId);
  if (input.gapId) await markGapWritten(String(input.gapId), pageId, user.id);

  return { page: await selectPageRow(pageId), open_questions: openQuestions, ai_output_id: outputId };
}
