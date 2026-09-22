/**
 * Wiki の AI — ①「AI に聞く」（`docs/design/v4/wiki.md` §6-⑤・§7-1・§10 の判断7・8）。
 *
 * ── 作り（§7-1 の①〜④をそのまま） ───────────────────────────
 *
 *   ① 質問を §5-4 の検索にかけ、**その人が読めるスペースの公開ページ**から
 *      上位8ページを材料にする（ページから開いたときはそのページと子ページを先に）
 *   ② 構造化出力 `{ answer_md, citations[], confidence }` を必須にし、
 *      **引用が出せない回答は「Wiki にはまだ書かれていません」に落とす**（判断8）
 *   ③ 回答・材料のページ id と `updated_at`・プロンプトの版を `ai_outputs` に**全文**で残す
 *   ④ 答えられなかった質問は `wiki_ai_gaps` に登録（同じ質問は回数を +1）
 *
 * ⚠️ **段は heavy 常に**（判断7）。手順の誤り（「先に電源を切る」）は読んだだけでは
 * 気づけず、現場で実行されて初めて分かるからです。費用で決めていません。
 *
 * ⚠️ **答えなかったことも「出力」です。** `confidence='none'` の回でも `ai_outputs` に
 * 1行残します — 残さないと**答えられなかった割合**（条件3）が数えられず、
 * 「AI が賢くなったのか、聞かれなくなっただけなのか」が区別できません。
 */
import { execute } from '../../../shared/db/connection';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { normalizeQuestion } from '../wiki-markdown';
import { assertReadablePage, type WikiUser } from './wiki-access.service';
import { callWikiAi, wikiTierFor } from './wiki-ai-llm';
import {
  WIKI_ANSWER_KIND, WIKI_ANSWER_PROMPT_VERSION, WIKI_NO_ANSWER_MD,
  WIKI_QUESTION_MAX_CHARS, WIKI_THREAD_MAX_TURNS, WIKI_HISTORY_TURNS, withFeedback,
} from './wiki-ai.constants';
import { WikiAnswerSchema, WIKI_ANSWER_SYSTEM, buildAnswerPrompt } from './wiki-ai-prompts';
import { wikiAdviceFor } from './wiki-ai-digest.service';
import { registerGap } from './wiki-ai-gap.service';
import {
  createThread, assertOwnThread, assertOwnMessage, listMessages, transcriptOf,
  titleThreadIfEmpty, newMessageId, selectMessage,
} from './wiki-ai-thread.service';
import {
  gatherMaterials, materialBlock, materialRefs, verifyCitations,
  type WikiMaterial, type WikiVerifiedCitation,
} from './wiki-ask-materials';

export interface AskInput {
  question: string;
  /** 続きを聞く（無ければ新しいスレッドを作る） */
  threadId?: string | null;
  /** ページ②の「AI に聞く」から開いたときの文脈 */
  pageId?: string | null;
  /** スペースを絞って聞く */
  spaceId?: string | null;
}

export interface AskResult {
  thread: Record<string, unknown>;
  /** 会話の全部（画面はこれをそのまま描く） */
  messages: Record<string, unknown>[];
  /** 右の「AI が読んだページ」（本文は返さない。題と場所だけ） */
  materials: Array<{ page_id: string; title: string; path: string; from_context: boolean }>;
  /** 答えられなかったか（画面は「ページを作成」への導線を出す） */
  no_answer: boolean;
}

/** 会話の1行を積む。`seq` は `UNIQUE (thread_id, seq)` なので取り合いにならない */
/**
 * 発言を1つ足す。**番号（`seq`）は入れる瞬間に DB 側で採ります。**
 *
 * ⚠️ **先に採った番号を持ち回らないこと。** `MAX(seq) + 1` を JS 側で採ってから
 * 入れていたころは、同じスレッドに2つの質問がほぼ同時に来ると**後の回が
 * 先の回と同じ番号を取り**、先の回は**長い AI の呼び出しを終えたあとで**
 * `UNIQUE (thread_id, seq)` に弾かれていました（質問だけが残り、答えが落ちる。
 * Codex の指摘・P2）。`INSERT ... SELECT` なら1文の中で採って入れるので、
 * 採ってから入れるまでの隙間がありません。
 *
 * ⚠️ **それでも稀に衝突します**（2つの `INSERT` が同じ瞬間に同じ `MAX` を読む）。
 * そのときは一意制約が弾くので、**数回だけ採り直します**。諦めるより、
 * 番号が1つ飛ぶほうがましです。
 */
async function addMessage(
  threadId: string,
  role: 'user' | 'assistant',
  contentMd: string,
  extra: {
    citations?: WikiVerifiedCitation[];
    confidence?: 'cited' | 'none';
    outputId?: string | null;
    model?: string | null;
    promptVersion?: string | null;
  } = {},
): Promise<string> {
  const id = newMessageId();
  // 並びは SQL の `?` と1対1。最後の1つは `WHERE thread_id`（番号を数える先）
  const params = [
    id, threadId, role, contentMd,
    extra.citations ? JSON.stringify(extra.citations) : null,
    extra.confidence ?? null,
    extra.outputId ?? null, extra.model ?? null, extra.promptVersion ?? null,
    threadId,
  ];
  for (let tries = 0; ; tries += 1) {
    try {
      await execute(
        `INSERT INTO wiki_ai_messages
           (id, thread_id, seq, role, content_md, citations, confidence,
            ai_output_id, model, prompt_version)
         SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?::jsonb, ?, ?, ?, ?
           FROM wiki_ai_messages WHERE thread_id = ?`,
        params,
      );
      return id;
    } catch (e) {
      // 一意制約（23505）だけ採り直す。ほかの失敗はそのまま上へ
      const code = (e as { code?: string }).code;
      if (code !== '23505' || tries >= 4) throw e;
    }
  }
}

/** 右の欄に出す形（**本文は返しません** — 読める人でも1画面に全文を出す意味が無い） */
function visibleMaterials(materials: WikiMaterial[]): AskResult['materials'] {
  return materials.map((m) => ({
    page_id: m.page_id, title: m.title, path: m.path, from_context: m.from_context,
  }));
}

/**
 * 質問に答える（`POST /wiki/ask`）。
 *
 * ⚠️ **材料が1件も無いときは AI を呼びません。** 呼んでも材料が無いので
 * 答えは作文になり、料金だけかかります。すぐ「書かれていません」に落とします。
 */
export async function ask(user: WikiUser, input: AskInput): Promise<AskResult> {
  const question = String(input.question ?? '').trim();
  if (!question) throw new ValidationError('質問を入れてください。');
  if (question.length > WIKI_QUESTION_MAX_CHARS) {
    // ⚠️ **切り詰めません。** 切ると「質問の後半が無視された」ことに誰も気づけません
    throw new ValidationError(
      `質問が長すぎます（${WIKI_QUESTION_MAX_CHARS.toLocaleString()}字まで）。要点だけを聞いてください。`,
    );
  }
  if (input.pageId) await assertReadablePage(user, String(input.pageId));

  const thread = input.threadId
    ? await assertOwnThread(user, String(input.threadId))
    : await createThread(user, { pageId: input.pageId ?? null, spaceId: input.spaceId ?? null });
  const threadId = String(thread.id);

  const history = await listMessages(threadId);
  if (history.length >= WIKI_THREAD_MAX_TURNS * 2) {
    throw new ValidationError('この会話は長くなりました。新しく聞き直してください。');
  }

  // 文脈のページは、スレッドに結びついているものを既定にする（②から開いた会話の続き）
  const contextPageId = input.pageId ? String(input.pageId) : (thread.page_id ? String(thread.page_id) : null);
  const spaceId = input.spaceId ?? (thread.space_id ? String(thread.space_id) : null);

  const materials = await gatherMaterials(user, { question, pageId: contextPageId, spaceId });

  await addMessage(threadId, 'user', question);
  await titleThreadIfEmpty(threadId, question);

  const normalized = normalizeQuestion(question);
  const advice = await wikiAdviceFor(WIKI_ANSWER_KIND);
  const promptVersion = advice.length
    ? withFeedback(WIKI_ANSWER_PROMPT_VERSION)
    : WIKI_ANSWER_PROMPT_VERSION;

  let answerMd = '';
  let citations: WikiVerifiedCitation[] = [];
  let dropped: ReturnType<typeof verifyCitations>['dropped'] = [];
  let model: string | null = null;
  let rawCitationCount = 0;
  /*
   * AI 自身が申告した確からしさ。⚠️ **材料が無くて呼ばなかった回と区別が要る**ので
   * `null` を初期値にします（`'none'` にすると「AI が書かれていないと言った」と
   * 記録が読めてしまい、材料が集まらなかっただけの回と混ざります）。
   */
  let rawConfidence: 'cited' | 'none' | null = null;

  if (materials.length > 0) {
    const userPrompt = buildAnswerPrompt({
      question,
      materialBlock: materialBlock(materials),
      history: transcriptOf(history, WIKI_HISTORY_TURNS),
      advice,
    });
    const out = await callWikiAi({
      job: WIKI_ANSWER_KIND,
      tier: wikiTierFor(WIKI_ANSWER_KIND),
      system: WIKI_ANSWER_SYSTEM,
      user: userPrompt,
      schema: WikiAnswerSchema,
      schemaName: 'wiki_answer',
    }, user.id);
    model = out.model;
    rawCitationCount = (out.raw.citations ?? []).length;
    rawConfidence = out.raw.confidence === 'cited' ? 'cited' : 'none';
    const checked = verifyCitations(out.raw.citations ?? [], materials);
    citations = checked.citations;
    dropped = checked.dropped;
    answerMd = String(out.raw.answer_md ?? '').trim();
  }

  /*
   * **出典が出せない回答はしません**（判断8）。次のどれかなら「書かれていません」に落とす:
   *   - 材料が1件も無い
   *   - AI が `confidence='none'` を返した（自分で「書かれていない」と言った）
   *   - 残った出典が0件（材料に無いページを指していた＝作文）
   *   - 答えの本文が空
   */
  /*
   * ⚠️ **AI が `none` と言った回は、出典が残っていても落とします。**
   * スキーマは「`confidence='none'` なのに本文と出典がある」という
   * **中で食い違った答え**も通してしまいます（`z.enum` は組み合わせを縛れない）。
   * 上の約束を書いておきながら `confidence` を見ていなかったため、
   * **AI が自分で「書かれていない」と言った回を「出典つきの答え」として出し**、
   * 足りないページにも登録しない状態でした（Codex の指摘・P1）。
   * 申告と中身が食い違うときは、**安全な側（答えない）**を採ります。
   */
  const cited = rawConfidence === 'cited' && citations.length > 0 && answerMd.length > 0;
  const confidence: 'cited' | 'none' = cited ? 'cited' : 'none';
  const contentMd = cited ? answerMd : WIKI_NO_ANSWER_MD;

  /*
   * ③ `ai_outputs` に**全文**で残す（条件1）。
   *
   * ⚠️ **材料の本文は入れません。** ページの id と `rev` と `updated_at` があれば
   * `wiki_page_versions` から復元できます（§7-5「全文を二重に持たない」）。
   * 入れているのは、あとから確かめたいものが**答えの側**にあるからです。
   */
  const outputId = await recordAiOutput({
    kind: WIKI_ANSWER_KIND,
    targetTable: 'wiki_ai_messages',
    targetId: null,                   // 発言 id はこの下で決まるので、下で入れ直す
    payload: {
      question,
      normalized_question: normalized,
      thread_id: threadId,
      page_context_id: contextPageId,
      space_id: spaceId,
      materials: materialRefs(materials),
      answer_md: answerMd,            // **落とした回でも AI が書いた文をそのまま残す**
      citations,
      dropped_citations: dropped,
      raw_citation_count: rawCitationCount,
      unverified_quotes: citations.filter((c) => !c.quote_verified).length,
      confidence,
      no_answer: !cited,
      history_turns: Math.floor(history.length / 2),
      advice_used: advice,
    },
    model,
    promptVersion,
    actorId: user.id,
  });

  const messageId = await addMessage(threadId, 'assistant', contentMd, {
    citations, confidence, outputId, model, promptVersion,
  });
  if (outputId) {
    await execute('UPDATE ai_outputs SET target_id = ? WHERE id = ?', [messageId, outputId])
      .catch((e: unknown) => {
        console.warn('[wiki-ai] 回答の記録に発言 id を結べませんでした:', (e as Error).message);
      });
  }

  // ④ 答えられなかった質問は捨てない（§7-2）。**回答は先に返し、登録は best-effort**
  if (!cited) {
    await registerGap({ question, threadId, spaceId: spaceId ?? null });
  }

  return {
    thread: await assertOwnThread(user, threadId),
    messages: await listMessages(threadId),
    materials: visibleMaterials(materials),
    no_answer: !cited,
  };
}

/** 1発言だけ引き直す（フィードバックを押したあとの再描画用） */
export async function getMessage(user: WikiUser, messageId: string): Promise<Record<string, unknown>> {
  await assertOwnMessage(user, messageId);
  return selectMessage(messageId);
}
