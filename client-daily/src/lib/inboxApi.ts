import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { MiscInquiry, Importance, InquiryState } from './types';

// その他問い合わせ（入ってきた情報）API の react-query フック集。
//
// ⚠️ **受領書類（`/dailyops/finance-docs`）のフックはここには無い。**
// 画面は財務管理（`/budget/documents`）にあり、このアプリには読む画面が
// 1つも無いのに `useFinanceDocs` / `useCreateFinanceDoc` / `useUpdateFinanceDoc` /
// `useDeleteFinanceDoc` と `FinanceDocInput` が**呼び手ゼロのまま**残っていた。
// 写しを残すと、片方だけ列が増えて食い違う。

// ── その他問い合わせ ──────────────────────────────
export interface InquiryInput {
  sender?: string | null;
  subject?: string | null;
  summary?: string;
  category?: string | null;
  importance?: Importance;
  action_needed?: string | null;
  url?: string | null;
  received_at?: string | null;
  notes?: string | null;
  source?: string | null;
  /** 渡さなければ**今の値を保つ**（サーバー側も同じ約束） */
  tags?: string[];
}

export interface InquiryListParams {
  importance?: Importance;
  /** 1つの行き先だけ */
  state?: InquiryState;
  /** 複数の行き先をまとめて（「仕分け済み」タブ = タスク / 案件 / 見送り） */
  states?: InquiryState[];
  /** 「今日さばくもの」= 未仕分け ＋ 見直しの日が来た「あとで見る」 */
  desk?: boolean;
  tag?: string | null;
  /** **必ず上限を付ける**（サーバー既定 50・最大 200） */
  limit?: number;
  offset?: number;
}

/**
 * 一覧。**上限つきで引く**（migration 247）。
 *
 * ⚠️ 以前は `useInquiries({})` で**全 state・全件・ページングなし**に引いてから
 * 画面側で絞っていた（タブの件数を出すため）。溜まるほど遅くなり、
 * 件数を出すためだけに全件を運んでいた。**件数は `useInquiryCounts()`**が
 * サーバーの COUNT から取る（運んだ行を数えると上限で切れた分だけ嘘になる）。
 */
export function useInquiries(params: InquiryListParams = {}) {
  const query: Record<string, string> = {};
  if (params.importance) query.importance = params.importance;
  if (params.state) query.state = params.state;
  if (params.states?.length) query.states = params.states.join(',');
  if (params.desk) query.desk = '1';
  if (params.tag) query.tag = params.tag;
  if (params.limit) query.limit = String(params.limit);
  if (params.offset) query.offset = String(params.offset);

  return useQuery({
    queryKey: ['inquiries', query],
    queryFn: () => api.get('/dailyops/inquiries', { params: query }).then((r) => r.data.data as MiscInquiry[]),
    refetchOnMount: 'always',
  });
}

/**
 * タブに出す件数。**サーバーが COUNT で数えたものを使う。**
 *
 * `desk` は「今日さばくもの」（未仕分け ＋ 見直しの日が来た「あとで見る」）で、
 * ホームのタイル（`GET /dailyops/alerts`）と同じ数になる。
 */
export interface InquiryStateCounts {
  unsorted: number;
  stock: number;
  /** 「あとで見る」のうち見直しの日が来たもの（`stock` の一部） */
  stock_due: number;
  /** タスク ＋ 案件 ＋ 見送り */
  sorted: number;
  ticket: number;
  project: number;
  dropped: number;
  booked: number;
  /** 未仕分け ＋ `stock_due`。**`stock` と重なる**ので足しても全件にならない */
  desk: number;
}

export interface InquiryCounts {
  states: InquiryStateCounts;
  /**
   * 出どころ別の内訳。**0 件の出どころは返ってこない**
   * （本番のメール取込がまだ `source` を渡していないため、
   * 出すと Slack・電話・口頭が必ず 0 で並ぶ）
   */
  sources: { source: string; total: number; ticket: number }[];
}

export function useInquiryCounts() {
  return useQuery({
    queryKey: ['inquiry-counts'],
    queryFn: () => api.get('/dailyops/inquiries/counts').then((r) => r.data.data as InquiryCounts),
    refetchOnMount: 'always',
  });
}

/**
 * よく使うタグ。**サーバーが数えたものを使う。**
 * 画面で数えると、タブを切り替えるたびに同じタグの件数が変わる
 */
export function useInquiryTags() {
  return useQuery({
    queryKey: ['inquiry-tags'],
    queryFn: () => api.get('/dailyops/inquiries/tags').then((r) => r.data.data as { tag: string; count: number }[]),
  });
}

function useInvalidateInq() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['inquiries'] });
    qc.invalidateQueries({ queryKey: ['inquiry-counts'] });
    qc.invalidateQueries({ queryKey: ['inquiry-tags'] });
    qc.invalidateQueries({ queryKey: ['dailyops-alerts'] });
  };
}

export function useCreateInquiry() {
  const inv = useInvalidateInq();
  return useMutation({ mutationFn: (i: InquiryInput) => api.post('/dailyops/inquiries', i).then((r) => r.data.data as MiscInquiry), onSuccess: inv });
}
export function useUpdateInquiry() {
  const inv = useInvalidateInq();
  return useMutation({ mutationFn: ({ id, fields }: { id: string; fields: InquiryInput }) => api.put(`/dailyops/inquiries/${id}`, fields).then((r) => r.data.data as MiscInquiry), onSuccess: inv });
}
/**
 * 行き先を動かす（あとで見る / 見送り / 未仕分けに戻す）。
 *
 * **タスクと案件はここでは指定できません** — 実体（タスク・案件）を
 * 作ったときだけ入る値なので、サーバーが弾きます。
 *
 * 「あとで見る」にするときは **見直す日**（`stock_review_on`）を一緒に送ります
 * （migration 247）。送らなくても保存は通りますが、その行は
 * 「見直す日が決まっていない」ものとして翌日から机に出ます。
 */
export function useMoveInquiry() {
  const inv = useInvalidateInq();
  return useMutation({
    mutationFn: ({ id, state, stock_review_on }: {
      id: string; state: 'unsorted' | 'stock' | 'dropped'; stock_review_on?: string | null;
    }) =>
      api.post(`/dailyops/inquiries/${id}/state`, { state, stock_review_on: stock_review_on ?? null })
        .then((r) => r.data.data as MiscInquiry),
    onSuccess: inv,
  });
}

export interface TicketInput { title: string; assigned_to?: string; due_at?: string | null; description?: string | null }

/** タスクにする = 案件管理のタスクを1本作る。**2回押しても増えない** */
export function useMakeTicket() {
  const inv = useInvalidateInq();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: TicketInput }) =>
      api.post(`/dailyops/inquiries/${id}/ticket`, fields).then((r) => r.data as { data: MiscInquiry; already: boolean }),
    onSuccess: inv,
  });
}
export interface BookingInput {
  title: string;
  /** ISO 日時。全日なら `YYYY-MM-DDT00:00:00` を渡す（`studio_bookings` は TEXT 列） */
  start_time: string;
  end_time: string;
  all_day?: boolean;
  location_note?: string | null;
  notes?: string | null;
}

/** カレンダーに登録する = スタジオ予約を1本作る。**2回押しても増えない** */
export function useMakeBooking() {
  const inv = useInvalidateInq();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: BookingInput }) =>
      api.post(`/dailyops/inquiries/${id}/book`, fields).then((r) => r.data as { data: MiscInquiry; already: boolean }),
    onSuccess: inv,
  });
}

export function useDeleteInquiry() {
  const inv = useInvalidateInq();
  return useMutation({ mutationFn: (id: string) => api.delete(`/dailyops/inquiries/${id}`), onSuccess: inv });
}

// ── ホームの件数 ──────────────────────────────
/**
 * 未処理の書類 と 今日さばくものの件数。
 *
 * **サーバーが数えたものを使う** (`GET /dailyops/alerts`)。ホームは以前
 * 書類と問い合わせの**一覧を丸ごと取り寄せてから画面で数えて**いたので、
 * ・件数を出すためだけに数百件を運んでいた
 * ・「未処理」の定義が画面とサーバーの2か所にあり、片方だけ変えると食い違う
 * という2つの問題があった。数えるのは1か所にする。
 *
 * `unhandledInquiries` は **未仕分け ＋ 見直しの日が来た「あとで見る」**（migration 247）。
 * 未仕分けだけにすると、「あとで見る」の見直しは画面を開いた人しか気づけない。
 *
 * 問い合わせを変えると `dailyops-alerts` は無効化される (`useInvalidateInq`)。
 * 書類は財務管理の画面が持つ（このアプリからは変えない）。
 */
export interface DailyopsAlerts {
  pendingFinanceDocs: number;
  unhandledInquiries: number;
}

export function useDailyopsAlerts() {
  return useQuery({
    queryKey: ['dailyops-alerts'],
    queryFn: () => api.get('/dailyops/alerts').then((r) => r.data.data as DailyopsAlerts),
    refetchOnMount: 'always',
  });
}
