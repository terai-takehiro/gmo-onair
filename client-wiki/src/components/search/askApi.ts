/**
 * 「AI に聞く」がサーバーを呼ぶところ（段E・docs/design/v4/wiki.md §6-⑤・§7-1）
 *
 * ⚠️ **URL は1ファイルに集める**（`client-wiki/CLAUDE.md`）。検索の次の一手が
 * 「AI に聞く」なので（§6-④）、段D の `searchApi.ts` と同じ場所に置いています。
 * 段E は「サーバー」と「画面」を同時に書いているため、`lib/wikiApi.ts` を
 * 取り合わないようここに分けます（段B の `components/page/pageOpsApi.ts` と同じ扱い）。
 *
 * サーバーの正は `server/src/contexts/wiki/services/wiki-ask.service.ts`
 * （`AskInput` / `AskResult`）と `wiki-ai-thread.service.ts`。返りはこの製品の作法どおり
 * `{ success: true, data: … }` で包まれています。
 *
 * ── 形の揺れを画面まで持ち込まない ──────────────────────────
 *
 * 出典（`citations`）は DB に**サーバーの形のまま**（`page_id` …）入ります。
 * `shared/src/wiki/types.ts` の `WikiCitation` はここだけ `pageId` と書いてあった
 * ので `page_id` に揃えましたが、**受け取った直後にここで1つの形へ直す**のは
 * 残してあります — 古い版の会話が DB に残っているうえ、外の AI（MCP）が
 * 書いた行も通るためです。画面の部品は `AskCitation`（`page_id`）だけを見ます。
 *
 * 会話1本（`GET /wiki/ai/threads/:id`）も、`{ thread, messages }` と
 * 「スレッドの行に `messages` が生えた形」のどちらでも受けられるようにしてあります。
 * **届いた JSON を描けずに白紙**にするより、受け口を広く取るほうが安全です。
 */
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { WikiAiFeedback, WikiAiThread } from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';
import { WIKI_URL } from '@/lib/wikiApi';

export const WIKI_ASK_URL = {
  /** 出典つきで答える（出せなければ答えない・§10 の判断8） */
  ask: '/wiki/ask',
  /** スレッドの一覧。**本人のものしか返りません** */
  threads: '/wiki/ai/threads',
  /** 会話1本（読む・消す） */
  thread: (id: string) => `/wiki/ai/threads/${id}`,
  /** 3値の評価（条件2） */
  feedback: (id: string) => `/wiki/ai/messages/${id}/feedback`,
  /*
   * ⚠️ **「AI で下書きを作る」（`POST /wiki/ai/draft`）はここに書きません。**
   * 編集画面の `components/ai/aiApi.ts`（`createAiDraftPage`）が持っており、
   * 「ページを作成」はそれを呼びます（同じ口を2つのファイルに持たない・
   * `client-wiki/CLAUDE.md`）。
   */
} as const;

export const askKeys = {
  threads: () => ['wiki', 'ask', 'threads'] as const,
  thread: (id: string) => ['wiki', 'ask', 'thread', id] as const,
};

/* ── 返ってくる形 ─────────────────────────────────────────── */

/** 出典1本。`quote` は材料の写しで、要約ではない（§7-1 ②） */
export interface AskCitation {
  page_id: string;
  title: string;
  heading: string | null;
  quote: string;
  /** 引用の文が材料の本文に見つかったか。**印を消さない**（条件1） */
  quote_verified: boolean;
}

export interface AskMessage {
  id: string;
  thread_id: string;
  seq: number;
  role: 'user' | 'assistant';
  content_md: string;
  citations: AskCitation[];
  /** cited = 出典つきで答えた ／ none = 「書かれていません」と返した */
  confidence: 'cited' | 'none' | null;
  /** `ai_outputs.id`。出典を開いたことをこの回答に結ぶのに使う（条件3） */
  ai_output_id: string | null;
  model: string | null;
  feedback: WikiAiFeedback | null;
  feedback_note: string | null;
  spawned_page_id: string | null;
  created_at: string;
}

/** 右に出す「AI が読んだページ」。**本文は返りません**（題と場所だけ） */
export interface AskMaterial {
  page_id: string;
  title: string;
  path: string;
  /** ページから開いたときの文脈として先に入れたページか */
  from_context: boolean;
}

export interface AskThreadDetail {
  thread: WikiAiThread | null;
  messages: AskMessage[];
}

export interface AskResponse extends AskThreadDetail {
  materials: AskMaterial[];
  /** 出典が出せず「書かれていません」に落ちた回（§7-2 の登録が走る） */
  no_answer: boolean;
}

export interface AskInput {
  question: string;
  /** 続けて聞く。無ければサーバーが新しいスレッドを作る */
  threadId?: string | null;
  /** ページ②から開いたときの文脈（そのページと子ページを先に読む） */
  pageId?: string | null;
  spaceId?: string | null;
}

/* ── 受け取った形を1つに直す ──────────────────────────────── */

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

/** `page_id` でも `pageId` でも受ける。どちらも無い出典は**捨てる**（押せない行を出さない） */
function toCitation(v: unknown): AskCitation | null {
  const c = asRaw(v);
  const pageId = asText(c.page_id) || asText(c.pageId);
  if (!pageId) return null;
  return {
    page_id: pageId,
    title: asText(c.title),
    heading: typeof c.heading === 'string' && c.heading ? c.heading : null,
    quote: asText(c.quote),
    quote_verified: c.quote_verified !== false,
  };
}

function toMessage(v: unknown): AskMessage {
  const m = asRaw(v);
  const rawCitations = Array.isArray(m.citations) ? m.citations : [];
  const confidence = m.confidence === 'cited' || m.confidence === 'none' ? m.confidence : null;
  const feedback = m.feedback === 'good' || m.feedback === 'rephrase' || m.feedback === 'reject'
    ? m.feedback
    : null;
  return {
    id: asText(m.id),
    thread_id: asText(m.thread_id),
    seq: Number(m.seq ?? 0),
    role: m.role === 'user' ? 'user' : 'assistant',
    content_md: asText(m.content_md),
    citations: rawCitations.map(toCitation).filter((c): c is AskCitation => c !== null),
    confidence,
    ai_output_id: asText(m.ai_output_id) || null,
    model: asText(m.model) || null,
    feedback,
    feedback_note: asText(m.feedback_note) || null,
    spawned_page_id: asText(m.spawned_page_id) || null,
    created_at: asText(m.created_at),
  };
}

function toMaterial(v: unknown): AskMaterial {
  const m = asRaw(v);
  return {
    page_id: asText(m.page_id),
    title: asText(m.title) || '（題のないページ）',
    path: asText(m.path),
    from_context: m.from_context === true,
  };
}

/** `{ thread, messages }` でも、スレッドの行に `messages` が生えた形でも受ける */
function toDetail(v: unknown): AskThreadDetail {
  const d = asRaw(v);
  const thread = (d.thread ? asRaw(d.thread) : d) as unknown as WikiAiThread;
  const messages = Array.isArray(d.messages) ? d.messages.map(toMessage) : [];
  return { thread: asText((thread as unknown as Raw).id) ? thread : null, messages };
}

async function pick<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await api.get<{ success: boolean; data: T }>(url, { signal });
  return res.data.data;
}

/* ── 読み取り ─────────────────────────────────────────────── */

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

/** スレッドの一覧（**本人のみ**。他の人のものは存在ごと見えない・§8） */
export function useAskThreads(opts?: Opts<WikiAiThread[]>) {
  return useQuery({
    queryKey: askKeys.threads(),
    queryFn: async ({ signal }) => {
      const data = await pick<unknown>(WIKI_ASK_URL.threads, signal);
      return (Array.isArray(data) ? data : []) as WikiAiThread[];
    },
    ...opts,
  });
}

/** 会話1本。`id` が無いうちは投げない（新しく聞くまでは会話が存在しない） */
export function useAskThread(id: string | null | undefined, opts?: Opts<AskThreadDetail>) {
  return useQuery({
    queryKey: askKeys.thread(id ?? ''),
    enabled: !!id,
    queryFn: async ({ signal }) => toDetail(await pick<unknown>(WIKI_ASK_URL.thread(id!), signal)),
    ...opts,
  });
}

/* ── 書き込み ─────────────────────────────────────────────── */

/**
 * 質問する。**1往復 = 1 POST**（少しずつ流さない）。
 * 段は heavy 固定なので、返るまで数十秒かかることがあります — 画面は待っている印を出します。
 */
export async function postAsk(input: AskInput): Promise<AskResponse> {
  // ⚠️ **送る名前はサーバーの道（`ai.routes.ts`）に合わせて `thread_id` …** です。
  //    サービスの `AskInput` は `threadId` ですが、道が読むのは本文の snake_case。
  //    ここを揃えないと「続けて聞いたのに毎回新しい会話ができる」になります
  const res = await api.post<{ success: boolean; data: unknown }>(WIKI_ASK_URL.ask, {
    question: input.question,
    thread_id: input.threadId ?? undefined,
    page_id: input.pageId ?? undefined,
    space_id: input.spaceId ?? undefined,
  });
  const data = asRaw(res.data?.data);
  return {
    ...toDetail(data),
    materials: Array.isArray(data.materials) ? data.materials.map(toMaterial) : [],
    no_answer: data.no_answer === true,
  };
}

/** 3値の評価（役に立った／言い直して／的外れ）＋任意の一言（条件2） */
export async function postAskFeedback(
  messageId: string,
  feedback: WikiAiFeedback,
  note?: string | null,
): Promise<AskMessage> {
  const res = await api.post<{ success: boolean; data: unknown }>(
    WIKI_ASK_URL.feedback(messageId),
    { feedback, note: note?.trim() || undefined },
  );
  return toMessage(res.data?.data);
}

export async function deleteAskThread(id: string): Promise<void> {
  await api.delete(WIKI_ASK_URL.thread(id));
}

/**
 * 出典を押して開いたことを記録する（`via='answer'`・§7-3 条件3 の代理指標）。
 *
 * ⚠️ **URL は `lib/wikiApi.ts` の `WIKI_URL.view` を借ります**（同じ口を2か所に書かない）。
 * `useRecordView` を使わないのは、あれが「画面を開いたら数える」フックで、
 * ここは**押した瞬間に・どの回答から開いたかを添えて**記録したいためです。
 * 読むのを妨げないので、失敗は黙って捨てます。
 */
export function recordAnswerView(pageId: string, answerOutputId: string | null): void {
  void api
    .post(WIKI_URL.view(pageId), { via: 'answer', answer_output_id: answerOutputId ?? undefined })
    .catch(() => undefined);
}
