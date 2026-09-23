/**
 * 見直しの画面がサーバーを呼ぶところ（段F・`docs/design/v4/wiki.md` §6-⑦・§7-2・§7-3）
 *
 * ⚠️ **URL は1ファイルに集める**（`client-wiki/CLAUDE.md` の表）。同じ口を2つの
 * ファイルに持つと、鍵（react-query の queryKey）が2か所に散って、同じ画面が
 * 同じものを2回取りに行きます。
 *
 * サーバーの正は `server/src/contexts/wiki/index.ts` の一覧と
 * `services/wiki-ai-gap.service.ts`・`services/wiki-ai-digest.service.ts`。
 * 返りはこの製品の作法どおり `{ success: true, data: … }` で包まれています。
 *
 * ── 形の揺れを画面まで持ち込まない ──────────────────────────
 *
 * 見直し予定（`GET /wiki/review`）が返すのは `{ rows, counts, recent_reviews }`
 * （`shared/src/wiki/reviewTypes.ts` の `WikiReviewList`）ですが、素の配列でも
 * 受けられるようにしてあります。**届いた JSON を描けずに白紙**にするより、
 * 受け口を広く取るほうが安全です（段E の `askApi.ts` と同じ判断）。
 *
 * ⚠️ **`counts` は上限（サーバー側 300件）で切る前の数**です。区分ごとの件数は
 * `rows` を数えずにこちらを使います（切られた先の行が数から落ちるため）。
 *
 * ⚠️ **スペースの絞り込みはサーバーに渡します**（`?space=`・Codex レビュー指摘・#735）。
 * 返ってきた行を画面で絞ると、**上限で切られた先にある行は手元に無い**ので、
 * そのスペースに見直すページがあっても「0件」に見えます。同じ理由で
 * 足りないページ（既定50件）も `?space=` をサーバーに渡します。
 *
 * ⚠️ **「期限切れ」という言葉は画面にもこのファイルにも出しません。**
 * Wiki のページは予定日を過ぎても中身が無効になるわけではない、という
 * 利用者のご指摘（2026-09-22）。区分の値は `overdue`／`soon`／`no_owner` の
 * ままですが（サーバーと対）、**画面に出すのは「要見直し」「まもなく」「担当なし」**です。
 */
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  WikiGap, WikiGapStatus, WikiReviewList, WikiReviewLogEntry, WikiReviewRow,
} from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';

/* ── URL（サーバーと突き合わせる唯一の場所） ─────────────────── */

export const WIKI_REVIEW_URL = {
  /** 見直し予定のページ（予定日を過ぎた・14日以内・担当が空） */
  review: '/wiki/review',
  /** 「見直した」。本文を変えずに次の予定日を入れ直す（editor） */
  reviewed: (id: string) => `/wiki/pages/${id}/reviewed`,
  /** 足りないページ（AI が答えられなかった質問・回数順・manager） */
  gaps: '/wiki/ai/gaps',
  /** ページにした／書かない（manager）。**行は消えません** */
  resolveGap: (id: string) => `/wiki/ai/gaps/${id}/resolve`,
  /** AI の直され方と成果（manager） */
  digest: '/wiki/ai/digest',
} as const;

export const reviewKeys = {
  all: ['wiki', 'review'] as const,
  // ⚠️ **スペースは鍵に入れます。** 入れないと、絞り込みを変えても
  //    前のスペースの結果が使い回されます（サーバーに投げる条件が鍵に無いため）
  due: (spaceId = '') => ['wiki', 'review', 'due', spaceId] as const,
  /** 絞り込みをまたいでまとめて古くするときの前の部分 */
  duePrefix: ['wiki', 'review', 'due'] as const,
  gaps: (status: WikiGapStatus | 'all', spaceId = '') =>
    ['wiki', 'review', 'gaps', status, spaceId] as const,
  digest: (windowDays: number) => ['wiki', 'review', 'digest', windowDays] as const,
};

/**
 * 「AI の直され方」が数える期間。設計 §6-⑦ は「今月」ですが、サーバーが数えるのは
 * **日数の窓**（`window_days`）なので 30日 を渡し、**画面には返ってきた日数をそのまま**
 * 出します（「今月」と書いて30日を数えると、月初に前月の分が混ざって嘘になります）。
 */
export const REVIEW_DIGEST_WINDOW_DAYS = 30;

/* ── 返ってくる形 ─────────────────────────────────────────── */

/** 足りないページの1行。`WikiGap` にサーバーが返す列を足したもの */
export interface ReviewGap extends WikiGap {
  /** 元になった会話（今は画面に出さないが、捨てると後から辿れない） */
  thread_id: string | null;
  resolved_at: string | null;
}

/** よく直される項目（`ai_corrections` の集計） */
export interface ReviewFieldStat {
  field_path: string;
  corrections: number;
  fix: number;
  enrich: number;
  reject: number;
}

/**
 * `GET /wiki/ai/digest` の1種ぶん（画面が読む分だけ。サーバーはもっと返す）。
 * `kind` は `wiki_answer`／`wiki_draft`／`wiki_rewrite` の3つ。
 */
export interface ReviewDigest {
  kind: string;
  window_days: number;
  reviewed_outputs: number;
  as_is_rate: number | null;
  top_corrected_field_types: ReviewFieldStat[];
  /** AI に聞く（`wiki_answer`）のときだけ入る */
  answer?: {
    answers_total: number;
    cited: number;
    no_answer: number;
    no_answer_rate: number | null;
    citation_open_rate: number | null;
    spawned_page_rate: number | null;
    reask_rate: number | null;
    feedback: { good: number; rephrase: number; reject: number };
    unverified_quote_answers: number;
  };
  /** AI で下書きを作る（`wiki_draft`）のときだけ入る */
  draft?: {
    drafts_total: number;
    published: number;
    published_rate: number | null;
    views_30d_avg: number | null;
    reedits_30d_avg: number | null;
  };
  /** AI で整える（`wiki_rewrite`）のときだけ入る */
  rewrite?: {
    decided: number;
    replaced: number;
    replaced_rate: number | null;
    as_is: number;
  };
  /** 未着手の足りないページ（§7-2。ページを書くことが最大の改善） */
  /** 質問の文は返らない（読めないスペースの中身を含みうるため・サーバーの `wiki-ai-digest.service.ts`） */
  gaps?: { open: number; top_count: number };
  /** 次の呼び出しに載せる文。**そのまま画面にも出す**（何を直すかが人にも分かる） */
  advice: string[];
}

/* ── 受け取った形を1つに直す ──────────────────────────────── */

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const asText = (v: unknown): string => (typeof v === 'string' ? v : '');
const asTextOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const asInt = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const asRate = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const BUCKETS = ['overdue', 'soon', 'no_owner'] as const;

/**
 * 見直し予定の1行。**区分が無い行は自分で決めます** — サーバーが区分を
 * 付けない形で返してきても、担当が空なら「担当なし」・予定日が過ぎていれば
 * 「要見直し」と読めるようにするためです（画面から行が消えるほうが困ります）。
 */
function toReviewRow(v: unknown, todayMs: number): WikiReviewRow {
  const r = asRaw(v);
  const ownerId = asTextOrNull(r.owner_user_id);
  const reviewBy = asTextOrNull(r.review_by);
  const raw = asText(r.bucket) as WikiReviewRow['bucket'];
  const known = (BUCKETS as readonly string[]).includes(raw);
  const dueMs = reviewBy ? Date.parse(`${reviewBy.slice(0, 10)}T00:00:00`) : NaN;
  const fallback: WikiReviewRow['bucket'] = !ownerId
    ? 'no_owner'
    : Number.isFinite(dueMs) && dueMs < todayMs
      ? 'overdue'
      : 'soon';
  return {
    id: asText(r.id),
    title: asText(r.title) || '（題のないページ）',
    path: asText(r.path) || asText(r.space_name),
    space_id: asText(r.space_id),
    space_name: asText(r.space_name),
    owner_user_id: ownerId,
    owner_name: asTextOrNull(r.owner_name),
    review_by: reviewBy,
    updated_at: asText(r.updated_at),
    bucket: known ? raw : fallback,
    last_reviewed_at: asTextOrNull(r.last_reviewed_at),
  };
}

function toReviewLog(v: unknown): WikiReviewLogEntry {
  const r = asRaw(v);
  return {
    id: asText(r.id),
    page_id: asText(r.page_id),
    page_title: asText(r.page_title) || '（題のないページ）',
    space_name: asText(r.space_name),
    reviewed_by: asTextOrNull(r.reviewed_by),
    reviewer_name: asTextOrNull(r.reviewer_name),
    reviewed_at: asText(r.reviewed_at),
    prev_review_by: asTextOrNull(r.prev_review_by),
    next_review_by: asTextOrNull(r.next_review_by),
    note: asTextOrNull(r.note),
  };
}

/** `{ rows, counts, recent_reviews }`。素の配列で返ってきても受ける */
function toReviewList(v: unknown): WikiReviewList {
  const d = asRaw(v);
  const list = Array.isArray(v) ? v : Array.isArray(d.rows) ? d.rows : [];
  const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const rows = list.map((row) => toReviewRow(row, todayMs)).filter((row) => row.id !== '');
  const c = asRaw(d.counts);
  // `counts` が無い形で返ってきたときだけ、手元の行から数える（0 件に見せない）
  const fallback = { overdue: 0, soon: 0, no_owner: 0 };
  for (const row of rows) fallback[row.bucket] += 1;
  return {
    rows,
    counts: d.counts
      ? { overdue: asInt(c.overdue), soon: asInt(c.soon), no_owner: asInt(c.no_owner) }
      : fallback,
    recent_reviews: Array.isArray(d.recent_reviews) ? d.recent_reviews.map(toReviewLog) : [],
  };
}

const GAP_STATUSES: readonly string[] = ['open', 'written', 'dismissed'];

function toGap(v: unknown): ReviewGap {
  const g = asRaw(v);
  const status = asText(g.status);
  return {
    id: asText(g.id),
    question: asText(g.question),
    count: asInt(g.count),
    last_asked_at: asText(g.last_asked_at),
    space_id: asTextOrNull(g.space_id),
    space_name: asTextOrNull(g.space_name),
    status: (GAP_STATUSES.includes(status) ? status : 'open') as WikiGapStatus,
    page_id: asTextOrNull(g.page_id),
    thread_id: asTextOrNull(g.thread_id),
    resolved_at: asTextOrNull(g.resolved_at),
  };
}

function toFieldStat(v: unknown): ReviewFieldStat {
  const f = asRaw(v);
  return {
    field_path: asText(f.field_path),
    corrections: asInt(f.corrections),
    fix: asInt(f.fix),
    enrich: asInt(f.enrich),
    reject: asInt(f.reject),
  };
}

function toDigest(v: unknown): ReviewDigest {
  const d = asRaw(v);
  const a = d.answer ? asRaw(d.answer) : null;
  const dr = d.draft ? asRaw(d.draft) : null;
  const rw = d.rewrite ? asRaw(d.rewrite) : null;
  const g = d.gaps ? asRaw(d.gaps) : null;
  const fb = a ? asRaw(a.feedback) : {};
  return {
    kind: asText(d.kind),
    window_days: asInt(d.window_days),
    reviewed_outputs: asInt(d.reviewed_outputs),
    as_is_rate: asRate(d.as_is_rate),
    top_corrected_field_types: Array.isArray(d.top_corrected_field_types)
      ? d.top_corrected_field_types.map(toFieldStat)
      : [],
    answer: a
      ? {
        answers_total: asInt(a.answers_total),
        cited: asInt(a.cited),
        no_answer: asInt(a.no_answer),
        no_answer_rate: asRate(a.no_answer_rate),
        citation_open_rate: asRate(a.citation_open_rate),
        spawned_page_rate: asRate(a.spawned_page_rate),
        reask_rate: asRate(a.reask_rate),
        feedback: { good: asInt(fb.good), rephrase: asInt(fb.rephrase), reject: asInt(fb.reject) },
        unverified_quote_answers: asInt(a.unverified_quote_answers),
      }
      : undefined,
    draft: dr
      ? {
        drafts_total: asInt(dr.drafts_total),
        published: asInt(dr.published),
        published_rate: asRate(dr.published_rate),
        views_30d_avg: asRate(dr.views_30d_avg),
        reedits_30d_avg: asRate(dr.reedits_30d_avg),
      }
      : undefined,
    rewrite: rw
      ? {
        decided: asInt(rw.decided),
        replaced: asInt(rw.replaced),
        replaced_rate: asRate(rw.replaced_rate),
        as_is: asInt(rw.as_is),
      }
      : undefined,
    gaps: g
      ? { open: asInt(g.open), top_count: asInt(g.top_count) }
      : undefined,
    advice: Array.isArray(d.advice) ? d.advice.map(asText).filter((s) => s !== '') : [],
  };
}

/* ── 読み取り ─────────────────────────────────────────────── */

async function pick<T>(url: string, signal?: AbortSignal, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get<{ success: boolean; data: T }>(url, { signal, params });
  return res.data.data;
}

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

/**
 * 見直し予定のページ。**区画ごとに諦められるように**、3つのタブは別々の
 * 問い合わせにしてあります（1つの 404 で画面全体が白紙にならない）。
 */
export function useReviewDue(enabled: boolean, spaceId = '', opts?: Opts<WikiReviewList>) {
  return useQuery({
    queryKey: reviewKeys.due(spaceId),
    enabled,
    queryFn: async ({ signal }) => toReviewList(
      // 絞り込みは**サーバーの LIMIT より先**に当てる（画面で絞ると上限の先が見えない）
      await pick<unknown>(WIKI_REVIEW_URL.review, signal, spaceId ? { space: spaceId } : undefined),
    ),
    ...opts,
  });
}

/** 足りないページ。**manager だけ**が読めます（§8）。権限が無い人には投げません */
export function useReviewGaps(
  enabled: boolean,
  status: WikiGapStatus | 'all' = 'open',
  spaceId = '',
  opts?: Opts<ReviewGap[]>,
) {
  return useQuery({
    queryKey: reviewKeys.gaps(status, spaceId),
    enabled,
    queryFn: async ({ signal }) => {
      const params: Record<string, string> = {};
      if (status !== 'all') params.status = status;
      if (spaceId) params.space = spaceId;
      const data = await pick<unknown>(
        WIKI_REVIEW_URL.gaps,
        signal,
        Object.keys(params).length > 0 ? params : undefined,
      );
      return (Array.isArray(data) ? data : []).map(toGap).filter((g) => g.id !== '');
    },
    ...opts,
  });
}

/** AI の直され方（3種まとめて1回で読む）。**manager だけ** */
export function useReviewDigest(enabled: boolean, windowDays = REVIEW_DIGEST_WINDOW_DAYS, opts?: Opts<ReviewDigest[]>) {
  return useQuery({
    queryKey: reviewKeys.digest(windowDays),
    enabled,
    queryFn: async ({ signal }) => {
      const data = await pick<unknown>(WIKI_REVIEW_URL.digest, signal, { window_days: windowDays });
      return (Array.isArray(data) ? data : []).map(toDigest);
    },
    ...opts,
  });
}

/* ── 書き込み ─────────────────────────────────────────────── */

/**
 * 「見直した」（editor）。**本文は変えません**（版も最終更新も増えません）—
 * 次の見直し予定日を入れ直すだけです。
 *
 * ⚠️ **月数を画面から送りません。** 何も送らなければサーバーの既定
 * （`WIKI_REVIEW_DEFAULT_MONTHS`）が当たります。押す場所ごとに別の間隔を
 * 書くと、同じボタンが画面によって違う日を入れることになります。
 * 日付を選んで入れ直すのはページの「情報」の見直し予定日のほうです。
 */
export async function postPageReviewed(pageId: string): Promise<void> {
  await api.post(WIKI_REVIEW_URL.reviewed(pageId), {});
}

/** ページにした（`written`）／書かないと決めた（`dismissed`）。**行は消えません** */
export async function postGapResolve(
  gapId: string,
  status: Exclude<WikiGapStatus, 'open'>,
  pageId?: string | null,
): Promise<ReviewGap> {
  const res = await api.post<{ success: boolean; data: unknown }>(
    WIKI_REVIEW_URL.resolveGap(gapId),
    { status, page_id: pageId ?? undefined },
  );
  return toGap(res.data?.data);
}
